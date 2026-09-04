/**
 * 知识库自动更新模块
 * 基于技术/知识发展自动更新维护知识库
 *
 * 流程：
 * 1. 调用 AMiner 获取每日推荐论文
 * 2. 提取关键概念（标题+年份摘要）
 * 3. 用 LLM 分析论文，与现有知识库比对，发现新知识/新连接
 * 4. 返回更新建议，并把更新结果保存到磁盘日志
 *
 * 所有 AMiner / LLM 调用均用 try-catch 包裹，失败时降级处理，
 * 保证主流程不会因为外部依赖故障而中断。
 */

import { getDailyPapers } from '../aminer/aminer-adapter';
import { chat } from '../api/llm-client';
import { invoke } from '@tauri-apps/api/core';
import type { AcademicSearchResult } from '../../types/research';

/** 更新建议类型 */
export type KnowledgeUpdateSuggestionType =
  | 'new-concept'
  | 'new-connection'
  | 'update-existing';

/** 更新建议 */
export interface KnowledgeUpdateSuggestion {
  type: KnowledgeUpdateSuggestionType;
  description: string;
  confidence: number;
  relatedPapers?: string[];
}

/** 更新结果 */
export interface KnowledgeUpdateResult {
  /** ISO 时间戳 */
  timestamp: string;
  /** 本次获取的论文数量 */
  newPapersCount: number;
  /** 更新建议列表 */
  suggestions: KnowledgeUpdateSuggestion[];
  /** 本次更新摘要 */
  summary: string;
}

/** 默认关注主题 */
const DEFAULT_TOPICS: string[] = [
  'large language model',
  'knowledge graph',
  'AI agent',
];

/** 最多传给 LLM 的论文数量 */
const MAX_PAPERS_FOR_LLM = 10;

/** 日志最多保留条数 */
const MAX_LOG_ENTRIES = 100;

/**
 * 从论文列表构造 LLM 输入摘要
 * 仅取标题与年份，避免上下文过长
 */
function buildPaperSummaries(papers: AcademicSearchResult[]): string {
  return papers
    .slice(0, MAX_PAPERS_FOR_LLM)
    .map((p) => `- ${p.title || '无标题'} (${p.year || '未知'})`)
    .join('\n');
}

/**
 * 从 LLM 返回内容中解析更新建议
 * 容错处理：去除 markdown 代码块标记、JSON 解析失败时返回空数组
 */
function parseSuggestions(raw: string): {
  suggestions: KnowledgeUpdateSuggestion[];
  summary: string;
} {
  let text = raw.trim();
  // 去除可能的 markdown 代码块标记
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  const parsed = JSON.parse(text) as {
    suggestions?: KnowledgeUpdateSuggestion[];
    summary?: string;
  };
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter(
        (s) =>
          s &&
          typeof s.description === 'string' &&
          typeof s.confidence === 'number',
      )
    : [];
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  return { suggestions, summary };
}

/**
 * 更新知识库
 * 调用 AMiner 获取最新论文 → 提取关键概念 → 用 LLM 分析 → 返回更新建议
 *
 * @param topics 关注主题列表，默认为 LLM / 知识图谱 / AI agent
 * @returns 更新结果（始终 resolve，不抛异常）
 */
export async function updateKnowledgeBase(
  topics?: string[],
): Promise<KnowledgeUpdateResult> {
  const timestamp = new Date().toISOString();

  // 1. 获取每日推荐论文（AMiner 失败则降级返回空结果）
  let papers: AcademicSearchResult[] = [];
  try {
    papers = await getDailyPapers(topics && topics.length > 0 ? topics : DEFAULT_TOPICS);
  } catch (error) {
    console.error('AMiner 获取每日论文失败:', error);
    return {
      timestamp,
      newPapersCount: 0,
      suggestions: [],
      summary: `AMiner 获取论文失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const newPapersCount = papers.length;
  const paperSummaries = buildPaperSummaries(papers);

  // 2. 用 LLM 分析论文，提取关键概念和更新建议（LLM 失败则降级为基础摘要）
  let suggestions: KnowledgeUpdateSuggestion[] = [];
  let summary = '';

  if (paperSummaries.length === 0) {
    summary = '未获取到任何论文，跳过 LLM 分析';
    return { timestamp, newPapersCount, suggestions, summary };
  }

  try {
    const llmResult = await chat(
      [
        {
          role: 'system',
          content:
            '你是知识库管理助手。分析最新论文，提取关键概念和知识连接建议。返回严格JSON格式，不要包含markdown代码块标记。',
        },
        {
          role: 'user',
          content:
            '以下是最新学术论文：\n' +
            paperSummaries +
            '\n\n请分析这些论文，提取：1.新概念 2.知识连接建议 3.对现有知识的更新建议。' +
            '返回JSON格式：{"suggestions":[{"type":"new-concept","description":"...","confidence":0.8}],"summary":"..."}',
        },
      ],
      { temperature: 0.3 },
    );

    if (llmResult.success && llmResult.content) {
      try {
        const parsed = parseSuggestions(llmResult.content);
        suggestions = parsed.suggestions;
        summary = parsed.summary;
      } catch (e) {
        console.warn('LLM 返回 JSON 解析失败，使用基础建议:', e);
        summary = `获取了 ${newPapersCount} 篇最新论文（LLM 结果解析失败）`;
      }
    } else {
      summary = `获取了 ${newPapersCount} 篇最新论文（LLM 调用失败: ${llmResult.error || '未知错误'}）`;
    }
  } catch (e) {
    console.warn('LLM 分析失败，使用基础建议:', e);
    summary = `获取了 ${newPapersCount} 篇最新论文`;
  }

  return { timestamp, newPapersCount, suggestions, summary };
}

/**
 * 保存更新日志到磁盘
 * 路径：{data_dir}/research/nightly-update-log.json
 * 最多保留最近 MAX_LOG_ENTRIES 条
 *
 * 容错策略：
 * - get_data_dir 失败：直接静默返回（无法保存）
 * - 读旧日志失败：视为首次写入，用空数组
 * - 写新日志失败：打印错误，不抛出
 */
export async function saveUpdateLog(result: KnowledgeUpdateResult): Promise<void> {
  let dataDir: string;
  try {
    dataDir = await invoke<string>('get_data_dir');
  } catch (error) {
    console.error('获取数据目录失败，跳过保存更新日志:', error);
    return;
  }

  const logPath = `${dataDir}/research/nightly-update-log.json`;

  // 读取现有日志（不存在则用空数组）
  let existingLogs: KnowledgeUpdateResult[] = [];
  try {
    const existing = await invoke<string>('read_json_file', { filename: logPath });
    const parsed = JSON.parse(existing);
    existingLogs = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    /* 文件不存在或解析失败，用空数组 */
  }

  // 添加新日志，最多保留最近 MAX_LOG_ENTRIES 条
  existingLogs.push(result);
  if (existingLogs.length > MAX_LOG_ENTRIES) {
    existingLogs = existingLogs.slice(-MAX_LOG_ENTRIES);
  }

  // 保存
  try {
    await invoke('write_json_file', {
      filename: logPath,
      content: JSON.stringify(existingLogs, null, 2),
    });
  } catch (error) {
    console.error('保存更新日志失败:', error);
  }
}