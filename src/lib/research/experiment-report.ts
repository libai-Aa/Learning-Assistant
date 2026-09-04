/**
 * 实验报告核心逻辑
 *
 * @description 提供实验报告与探索记录条目的工厂函数、统计计算、
 *   过滤、自动总结等纯函数工具。Store 与组件均依赖本模块。
 *
 * 设计目标：
 * - 纯函数 + 工厂函数，便于单测与复用
 * - 不持有状态，状态由 experiment-report-store 管理
 * - 自动总结能力：根据 entries + findings 推断结论草稿
 *
 * @module src/lib/research/experiment-report
 */

import type {
  CreateExperimentReportInput,
  CreateExplorationEntryInput,
  EvidenceItem,
  ExperimentReport,
  ExperimentReportFilter,
  ExperimentReportStats,
  ExplorationConclusion,
  ExplorationEntry,
  ExplorationEntryFilter,
  ExplorationEntryStats,
  ExplorationEntryType,
  ExplorationFindings,
  ExplorationStatus,
  UpdateExplorationEntryInput,
  UpdateExperimentReportInput,
} from '../../types/experiment-report';
import type { Methodology } from '../../types/research';

// ============ ID 生成 ============

/**
 * 生成唯一ID
 * @param prefix 前缀
 */
export function generateId(prefix: string = 'rpt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============ 工厂函数：默认空对象 ============

/**
 * 创建默认的"发现与数据"部分
 */
export function createDefaultFindings(): ExplorationFindings {
  return {
    evidences: [],
    analysis: '',
    supportingSummary: '',
    againstSummary: '',
    contradictions: [],
  };
}

/**
 * 创建默认的"结论与反思"部分
 */
export function createDefaultConclusion(): ExplorationConclusion {
  return {
    result: 'inconclusive',
    conclusion: '',
    keyInsights: [],
    lessonsLearned: [],
    unresolvedQuestions: [],
    newIdeas: [],
    futureDirections: [],
  };
}

/**
 * 创建默认的"思考题与延伸"部分
 */
export function createDefaultReflection() {
  return {
    newQuestions: [],
    generalizations: [],
    connections: [],
  };
}

// ============ 报告工厂 ============

/**
 * 创建实验报告
 *
 * 当用户开始探索新想法/问题时自动调用，初始化一份贯穿始终的报告。
 * 仅 motivation.why / theory.initialAssumption 等关键字段可由调用方指定，
 * 其余字段填合理默认值，后续随探索推进逐步补全。
 */
export function createExperimentReport(
  input: CreateExperimentReportInput
): ExperimentReport {
  const now = new Date().toISOString();
  const id = generateId('rpt');
  const topic = input.topic.trim();

  if (!topic) {
    throw new Error('探索主题不能为空');
  }

  return {
    id,
    basicInfo: {
      topic,
      explorer: input.explorer ?? 'user',
      status: 'in_progress',
      startedAt: now,
      lastUpdatedAt: now,
      ideaId: input.ideaId,
      researchQuestionId: input.researchQuestionId,
      tags: input.tags ?? [],
    },
    motivation: {
      why: input.motivation?.why ?? '',
      hypothesis: input.motivation?.hypothesis ?? '',
      expectedGoal: input.motivation?.expectedGoal ?? '',
      origin: input.motivation?.origin,
      originUrl: input.motivation?.originUrl,
    },
    theory: {
      initialAssumption: input.theory?.initialAssumption ?? '',
      basedOn: input.theory?.basedOn ?? '',
      expectedOutcomes: input.theory?.expectedOutcomes ?? [],
      methodology: input.theory?.methodology ?? 'first-principles',
      methodologyReason: input.theory?.methodologyReason,
    },
    tools: {
      tools: [],
      references: [],
      priorKnowledge: [],
    },
    entries: [],
    findings: createDefaultFindings(),
    conclusion: createDefaultConclusion(),
    reflection: createDefaultReflection(),
    createdAt: now,
    updatedAt: now,
  };
}

// ============ 报告更新 ============

/**
 * 浅合并更新对象（保留未提供字段）
 */
function mergePartial<T extends object>(base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base;
  // 对数组字段直接替换，对象字段浅合并，标量直接替换
  const result: T = { ...base };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (base as Record<keyof T, unknown>)[key] === 'object' &&
      !Array.isArray((base as Record<keyof T, unknown>)[key])
    ) {
      (result as Record<keyof T, unknown>)[key] = {
        ...((base as Record<keyof T, unknown>)[key] as object),
        ...(value as object),
      };
    } else {
      (result as Record<keyof T, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * 更新实验报告各部分
 */
export function updateExperimentReport(
  report: ExperimentReport,
  updates: UpdateExperimentReportInput
): ExperimentReport {
  const now = new Date().toISOString();
  const next: ExperimentReport = {
    ...report,
    motivation: mergePartial(report.motivation, updates.motivation),
    theory: mergePartial(report.theory, updates.theory),
    tools: mergePartial(report.tools, updates.tools),
    findings: mergePartial(report.findings, updates.findings),
    conclusion: mergePartial(report.conclusion, updates.conclusion),
    reflection: mergePartial(report.reflection, updates.reflection),
    updatedAt: now,
  };

  if (updates.basicInfo) {
    next.basicInfo = mergePartial(report.basicInfo, updates.basicInfo);
    next.basicInfo.lastUpdatedAt = now;
  }

  return next;
}

// ============ 探索记录条目工厂 ============

/**
 * 创建探索记录条目
 */
export function createExplorationEntry(
  reportId: string,
  input: CreateExplorationEntryInput
): ExplorationEntry {
  const now = new Date().toISOString();
  const title = input.title.trim();
  const content = input.content.trim();

  if (!title) {
    throw new Error('探索记录标题不能为空');
  }
  if (!content) {
    throw new Error('探索记录内容不能为空');
  }

  return {
    id: generateId('entry'),
    reportId,
    type: input.type,
    title,
    content,
    reflection: input.reflection?.trim() || undefined,
    relatedEntryId: input.relatedEntryId,
    evidenceId: input.evidenceId,
    tools: input.tools,
    durationMinutes: input.durationMinutes,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 更新探索记录条目
 */
export function updateExplorationEntry(
  entry: ExplorationEntry,
  updates: UpdateExplorationEntryInput
): ExplorationEntry {
  const next: ExplorationEntry = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };

  if (updates.type !== undefined) next.type = updates.type;
  if (updates.title !== undefined) {
    const t = updates.title.trim();
    if (!t) throw new Error('探索记录标题不能为空');
    next.title = t;
  }
  if (updates.content !== undefined) {
    const c = updates.content.trim();
    if (!c) throw new Error('探索记录内容不能为空');
    next.content = c;
  }
  if (updates.reflection !== undefined) {
    next.reflection = updates.reflection.trim() || undefined;
  }
  if (updates.relatedEntryId !== undefined) next.relatedEntryId = updates.relatedEntryId;
  if (updates.evidenceId !== undefined) next.evidenceId = updates.evidenceId;
  if (updates.tools !== undefined) next.tools = updates.tools;
  if (updates.durationMinutes !== undefined) next.durationMinutes = updates.durationMinutes;
  if (updates.tags !== undefined) next.tags = updates.tags;

  return next;
}

// ============ 状态转换 ============

/** 合法的状态转换路径 */
const VALID_TRANSITIONS: Record<ExplorationStatus, ExplorationStatus[]> = {
  in_progress: ['completed', 'shelved', 'falsified', 'inconclusive'],
  completed: ['shelved', 'in_progress'],
  shelved: ['in_progress', 'completed', 'falsified', 'inconclusive'],
  falsified: ['shelved'],
  inconclusive: ['in_progress', 'completed', 'shelved', 'falsified'],
};

/**
 * 检查状态转换是否合法
 */
export function canTransitionStatus(
  from: ExplorationStatus,
  to: ExplorationStatus
): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * 应用状态转换，返回更新后的 basicInfo 字段
 */
export function transitionStatus(
  report: ExperimentReport,
  to: ExplorationStatus
): ExperimentReport {
  if (!canTransitionStatus(report.basicInfo.status, to)) {
    throw new Error(
      `非法状态转换：${report.basicInfo.status} -> ${to}`
    );
  }
  const now = new Date().toISOString();
  return {
    ...report,
    basicInfo: {
      ...report.basicInfo,
      status: to,
      lastUpdatedAt: now,
      completedAt:
        to === 'completed' || to === 'falsified' || to === 'inconclusive'
          ? now
          : report.basicInfo.completedAt,
    },
    updatedAt: now,
  };
}

// ============ 过滤 ============

/**
 * 过滤实验报告
 */
export function filterReports(
  reports: ExperimentReport[],
  filter: ExperimentReportFilter
): ExperimentReport[] {
  return reports.filter((r) => {
    const { basicInfo } = r;
    if (filter.status && basicInfo.status !== filter.status) return false;
    if (filter.ideaId && basicInfo.ideaId !== filter.ideaId) return false;
    if (filter.researchQuestionId && basicInfo.researchQuestionId !== filter.researchQuestionId)
      return false;
    if (filter.knowledgeId && basicInfo.knowledgeId !== filter.knowledgeId) return false;
    if (filter.explorer && basicInfo.explorer !== filter.explorer) return false;
    if (filter.tag && !basicInfo.tags.includes(filter.tag)) return false;
    if (filter.startedFrom && basicInfo.startedAt < filter.startedFrom) return false;
    if (filter.startedTo && basicInfo.startedAt > filter.startedTo) return false;
    return true;
  });
}

/**
 * 过滤探索记录条目
 */
export function filterEntries(
  entries: ExplorationEntry[],
  filter: ExplorationEntryFilter
): ExplorationEntry[] {
  const keyword = filter.keyword?.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter.type && e.type !== filter.type) return false;
    if (filter.types && filter.types.length > 0 && !filter.types.includes(e.type)) return false;
    if (filter.tag && !(e.tags ?? []).includes(filter.tag)) return false;
    if (filter.dateFrom && e.createdAt < filter.dateFrom) return false;
    if (filter.dateTo && e.createdAt > filter.dateTo) return false;
    if (keyword) {
      const hay = `${e.title} ${e.content} ${e.reflection ?? ''}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

/**
 * 按时间排序条目（默认升序，即从早到晚）
 */
export function sortEntries(
  entries: ExplorationEntry[],
  order: 'asc' | 'desc' = 'asc'
): ExplorationEntry[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  return order === 'asc' ? sorted : sorted.reverse();
}

// ============ 统计 ============

/**
 * 计算实验报告列表的统计信息
 */
export function computeReportStats(reports: ExperimentReport[]): ExperimentReportStats {
  const stats: ExperimentReportStats = {
    total: reports.length,
    byStatus: {
      in_progress: 0,
      completed: 0,
      shelved: 0,
      falsified: 0,
      inconclusive: 0,
    },
    totalEntries: 0,
    totalEvidences: 0,
    averageEntriesPerReport: 0,
  };

  for (const r of reports) {
    stats.byStatus[r.basicInfo.status]++;
    stats.totalEntries += r.entries.length;
    stats.totalEvidences += r.findings.evidences.length;
  }

  stats.averageEntriesPerReport =
    stats.total === 0 ? 0 : stats.totalEntries / stats.total;

  return stats;
}

/**
 * 计算探索记录条目的统计信息
 */
export function computeEntryStats(entries: ExplorationEntry[]): ExplorationEntryStats {
  const stats: ExplorationEntryStats = {
    total: entries.length,
    byType: {
      idea: 0,
      attempt: 0,
      discovery: 0,
      setback: 0,
      breakthrough: 0,
      reflection: 0,
      pivot: 0,
      evidence_support: 0,
      evidence_against: 0,
      question: 0,
      note: 0,
    },
    totalDurationMinutes: 0,
    supportEvidenceCount: 0,
    againstEvidenceCount: 0,
  };

  for (const e of entries) {
    stats.byType[e.type]++;
    if (e.durationMinutes) stats.totalDurationMinutes += e.durationMinutes;
    if (e.type === 'evidence_support') stats.supportEvidenceCount++;
    if (e.type === 'evidence_against') stats.againstEvidenceCount++;
  }

  return stats;
}

// ============ 自动总结 ============

/**
 * 根据证据列表推断结论的 result 字段
 *
 * 规则：
 * - 反对证据数显著多于支持证据 → falsified
 * - 支持证据数显著多于反对证据 → confirmed
 * - 两者都有但势均力敌 → partial
 * - 都没有 → inconclusive
 */
export function inferConclusionResult(
  supportCount: number,
  againstCount: number
): ExplorationConclusion['result'] {
  if (supportCount === 0 && againstCount === 0) return 'inconclusive';
  const ratio = supportCount / (supportCount + againstCount);
  if (ratio >= 0.7) return 'confirmed';
  if (ratio <= 0.3) return 'falsified';
  return 'partial';
}

/**
 * 自动生成报告总结草稿
 *
 * 探索完成时调用，根据 entries + findings 推断结论草稿。
 * 注意：仅生成草稿，用户应当审阅并修改。
 */
export function generateSummaryDraft(report: ExperimentReport): {
  conclusion: Partial<ExplorationConclusion>;
  reflection: Partial<ExperimentReport['reflection']>;
} {
  const entryStats = computeEntryStats(report.entries);
  const supportCount =
    entryStats.supportEvidenceCount +
    report.findings.evidences.filter((e) => e.stance === 'support').length;
  const againstCount =
    entryStats.againstEvidenceCount +
    report.findings.evidences.filter((e) => e.stance === 'against').length;

  const result = inferConclusionResult(supportCount, againstCount);

  // 从 breakthrough / discovery 类型条目提取关键洞察
  const keyInsights = report.entries
    .filter((e) => e.type === 'breakthrough' || e.type === 'discovery')
    .map((e) => e.title);

  // 从 setback 类型条目提取教训
  const lessonsLearned = report.entries
    .filter((e) => e.type === 'setback')
    .map((e) => `${e.title}：${e.reflection ?? e.content.slice(0, 80)}`);

  // 从 question 类型条目提取未解决问题
  const unresolvedQuestions = report.entries
    .filter((e) => e.type === 'question')
    .map((e) => e.title);

  // 从 pivot 类型条目提取新方向
  const futureDirections = report.entries
    .filter((e) => e.type === 'pivot')
    .map((e) => e.title);

  return {
    conclusion: {
      result,
      keyInsights: Array.from(new Set(keyInsights)),
      lessonsLearned: Array.from(new Set(lessonsLearned)),
      unresolvedQuestions: Array.from(new Set(unresolvedQuestions)),
      futureDirections: Array.from(new Set(futureDirections)),
    },
    reflection: {
      newQuestions: Array.from(new Set(unresolvedQuestions)),
    },
  };
}

// ============ 证据工厂 ============

/**
 * 创建证据条目
 */
export function createEvidence(
  reportId: string,
  input: {
    type: EvidenceItem['type'];
    stance: EvidenceItem['stance'];
    description: string;
    content: string;
    source?: string;
    confidence?: number;
    relatedEntryId?: string;
  }
): EvidenceItem {
  const description = input.description.trim();
  const content = input.content.trim();
  if (!description) throw new Error('证据描述不能为空');
  if (!content) throw new Error('证据内容不能为空');

  const confidence = input.confidence ?? 0.5;
  if (confidence < 0 || confidence > 1) {
    throw new Error('置信度必须在 0-1 之间');
  }

  return {
    id: generateId('ev'),
    reportId,
    type: input.type,
    stance: input.stance,
    description,
    content,
    source: input.source,
    confidence,
    relatedEntryId: input.relatedEntryId,
    createdAt: new Date().toISOString(),
  };
}

// ============ 查询辅助 ============

/**
 * 在报告中查找条目
 */
export function findEntry(
  report: ExperimentReport,
  entryId: string
): ExplorationEntry | undefined {
  return report.entries.find((e) => e.id === entryId);
}

/**
 * 在报告中查找证据
 */
export function findEvidence(
  report: ExperimentReport,
  evidenceId: string
): EvidenceItem | undefined {
  return report.findings.evidences.find((e) => e.id === evidenceId);
}

/**
 * 获取条目的"思路链"：通过 relatedEntryId 递归回溯
 */
export function getEntryChain(
  report: ExperimentReport,
  entryId: string
): ExplorationEntry[] {
  const chain: ExplorationEntry[] = [];
  const visited = new Set<string>();
  let current = findEntry(report, entryId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    if (current.relatedEntryId) {
      current = findEntry(report, current.relatedEntryId);
    } else {
      current = undefined;
    }
  }

  return chain;
}

/**
 * 计算报告的探索时长（分钟）
 */
export function computeReportDurationMinutes(report: ExperimentReport): number {
  return report.entries.reduce(
    (sum, e) => sum + (e.durationMinutes ?? 0),
    0
  );
}

/**
 * 计算探索跨度（从开始到最后更新，单位：分钟）
 */
export function computeReportSpanMinutes(report: ExperimentReport): number {
  const start = new Date(report.basicInfo.startedAt).getTime();
  const end = new Date(report.basicInfo.lastUpdatedAt).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

// ============ 方法论推荐 ============

/**
 * 根据探索主题的简单启发式规则推荐方法论
 *
 * 仅作为创建报告时的默认值，用户可手动覆盖。
 */
export function recommendMethodology(topic: string): Methodology {
  const t = topic.toLowerCase();
  // 包含"为什么"或"根因" → 五问
  if (t.includes('为什么') || t.includes('根因') || t.includes('cause')) {
    return 'five-whys';
  }
  // 包含"什么是"或"原理" → 苏格拉底
  if (t.includes('什么是') || t.includes('原理') || t.includes('概念')) {
    return 'socratic';
  }
  // 默认第一性原理
  return 'first-principles';
}

/**
 * 推断探索主题的简短标签
 */
export function inferTags(topic: string, existingTags: string[] = []): string[] {
  const tags = new Set(existingTags);
  // 简单关键词识别
  if (/证伪|反例|否证/.test(topic)) tags.add('证伪');
  if (/假设| conjecture |hypothesis/i.test(topic)) tags.add('假设检验');
  if (/复现|reproduce/i.test(topic)) tags.add('复现');
  return Array.from(tags);
}

// ============ 导出常量辅助 ============

/**
 * 列出所有探索记录条目类型
 */
export const ALL_ENTRY_TYPES: ExplorationEntryType[] = [
  'idea',
  'attempt',
  'discovery',
  'setback',
  'breakthrough',
  'reflection',
  'pivot',
  'evidence_support',
  'evidence_against',
  'question',
  'note',
];