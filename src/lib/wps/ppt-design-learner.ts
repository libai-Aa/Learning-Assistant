/**
 * PPT 设计学习进修模块 (PPTDesignLearner)
 *
 * @description "更懂你的WPS"系统的PPT设计进修层：
 *   内置小红书/设计社区流行的PPT设计趋势知识库，并支持通过 LLM 在线进修
 *   最新趋势，结合历史评估弱项，输出可供 PPT 生成器直接注入的 prompt 指导文本。
 *
 *   设计思路（说人话）：
 *     这一层是"PPT审美进修班"——先内置一份小红书爆款PPT的审美知识库作为底线，
 *     再定期请 LLM（扮演设计专家）进修当下最新趋势，同时回顾历史评估中暴露的
 *     弱项（内容/设计/连贯性哪个维度总拖后腿），把"趋势 + 弱项"合成一份指导
 *     文本喂给 PPT 生成器，让生成的 PPT 越来越贴近年轻人审美。
 *
 *   核心能力：
 *     1. getBuiltinTrends：返回内置小红书PPT设计趋势知识库
 *     2. studyTrends：用 LLM 进修最新趋势，失败时降级返回内置趋势
 *     3. saveStudyNotes / getStudyNotes：进修笔记的追加写入与读取
 *     4. getEvaluationHistory：解析历史评估记录，定位弱项维度
 *     5. getDesignGuidance：综合趋势 + 弱项，输出 prompt 指导文本
 *     6. runStudySession：一站式进修流程
 *
 *   文件路径约定：
 *     所有读写通过 Tauri invoke 命令（read_json_file / write_json_file），
 *     路径相对于 D:\code\llm-wiki-data\，使用相对路径如 research/xxx.md。
 *
 * @module src/lib/wps/ppt-design-learner
 */

import { chat } from '../api/llm-client';
import { invoke } from '@tauri-apps/api/core';

// ============ 类型定义 ============

/** 设计趋势条目 */
export interface DesignTrend {
  category: string;      // '配色'|'排版'|'内容'|'视觉'|'字体'
  trend: string;         // 趋势名称
  description: string;   // 详细描述
  example: string;       // 应用示例
}

/** 评估记录（从 pptagent-study-notes.md 解析得到） */
export interface EvaluationRecord {
  timestamp: string;
  topic: string;
  purpose: string;
  audience: string;
  content: number;
  design: number;
  coherence: number;
  total: number;
  suggestions: string[];
}

/** 进修笔记条目 */
export interface StudyNote {
  timestamp: string;
  trends: string;       // 本次进修获取的趋势摘要
  weakPoints: string;   // 发现的弱项
  improvements: string; // 改进方向
}

/** PPT 生成 prompt 指导文本 */
export interface DesignGuidance {
  trendsPrompt: string;     // 注入LLM prompt的趋势指导文本
  weakPointsPrompt: string; // 历史评估弱项指导
  fullGuidance: string;     // 合并的完整指导文本
}

// ============ 内置小红书 PPT 设计趋势知识库 ============

/**
 * 内置趋势知识库
 *
 * 来源：小红书爆款PPT、站酷/Behance 设计社区共性总结。
 * 作为 LLM 进修失败时的降级底线，也作为 getDesignGuidance 的基础 prompt。
 */
const BUILTIN_TRENDS: DesignTrend[] = [
  // ---- 配色 ----
  {
    category: '配色',
    trend: '莫兰迪低饱和',
    description: '降低色彩饱和度，加入灰调，营造高级、温柔、不刺眼的视觉氛围，适合知识分享与职场汇报。',
    example: '主色用 #6B7B8C 雾霾蓝、#A8A8A8 高级灰，背景用 #F5F5F2 奶白',
  },
  {
    category: '配色',
    trend: '渐变撞色',
    description: '用同色系或邻近色做柔和渐变，避免高饱和硬撞色；渐变方向以对角线为主，增加层次感。',
    example: '标题色块用 #FFB6C1 → #FFD9E6 的粉色渐变，年轻又不突兀',
  },
  {
    category: '配色',
    trend: '单色系高级感',
    description: '全篇只用一个主色 + 黑白灰，通过明度深浅拉开层次，克制且专业。',
    example: '以深蓝 #1A365D 为主色，配浅蓝 #BEE3F8 与白底，通篇不超3色',
  },
  {
    category: '配色',
    trend: '奶油色系',
    description: '米白、奶咖、浅杏等暖低饱和色打底，柔软治愈，契合小红书女性向内容审美。',
    example: '背景 #FAF3E7 奶咖、文字 #4A4A4A 深灰、点缀 #E8B4B8 豆沙粉',
  },

  // ---- 排版 ----
  {
    category: '排版',
    trend: '大字标题+小字正文',
    description: '标题字号占视觉重心（≥36pt），正文克制（≤18pt），形成强烈大小对比，一眼抓重点。',
    example: '标题 48pt 加粗，正文 16pt 常规，行距 1.5，信息层级一目了然',
  },
  {
    category: '排版',
    trend: '卡片式布局',
    description: '把内容装进圆角卡片（圆角 8-16px），卡片间留白分隔，模块化呈现，适合并列观点。',
    example: '三栏并列卡片，每卡圆角 12px、浅灰描边、内边距 24px',
  },
  {
    category: '排版',
    trend: '左右分栏',
    description: '左侧放标题/金句/图标，右侧放正文/数据，形成对话感版式，打破通栏沉闷。',
    example: '左栏 40% 放大字观点，右栏 60% 放说明文字与配图',
  },
  {
    category: '排版',
    trend: '留白充足',
    description: '页面四周与元素之间大量留白（留白率 ≥40%），呼吸感强，避免信息堆砌。',
    example: '页边距统一 64px，元素间距 32px，绝不贴边排版',
  },
  {
    category: '排版',
    trend: '几何装饰',
    description: '用圆、半圆、矩形条、斜线等几何形状做角落点缀或分隔，增加设计感但不抢内容。',
    example: '右上角放一个半透明大圆，底部加一条主色细矩形条做分隔',
  },

  // ---- 内容 ----
  {
    category: '内容',
    trend: '每页一个观点',
    description: '一页只讲一个核心观点，不贪多，让观众3秒内 get 到重点，符合碎片化阅读习惯。',
    example: '页面标题即观点，正文只做3点以内展开论证',
  },
  {
    category: '内容',
    trend: '关键词+短句',
    description: '提炼关键词加粗放大，配短句解释，避免长段落，降低阅读门槛。',
    example: '"复利效应"放大加粗，下方配一句"时间越久，收益越非线性增长"',
  },
  {
    category: '内容',
    trend: '数字突出',
    description: '关键数据用超大字号 + 主色呈现，数字本身就是视觉焦点，增强说服力。',
    example: '"87%"用 72pt 主色加粗，下方配一句说明文字',
  },
  {
    category: '内容',
    trend: '对比类比',
    description: '用"之前vs之后""错误vs正确"的对比版式呈现，差异直观，说服力强。',
    example: '左右两栏对比，左栏标红打叉，右栏标绿打勾',
  },
  {
    category: '内容',
    trend: '图标辅助',
    description: '每个观点配一个线性图标（icon），图文对应降低认知负荷，也增加视觉趣味。',
    example: '三个观点分别配 🎯/📈/💡 风格的线性 SVG 图标',
  },

  // ---- 视觉 ----
  {
    category: '视觉',
    trend: '简约现代',
    description: '去掉一切多余装饰（阴影、立体、纹理），保留核心信息，符合当下"少即是多"审美。',
    example: '不用投影/斜面/渐变叠加，只靠色块与字号拉开层次',
  },
  {
    category: '视觉',
    trend: '扁平化',
    description: '元素全部扁平处理，无立体阴影，色彩平涂，清爽利落，加载也快。',
    example: '图标用扁平线性风格，按钮用纯色填充无阴影',
  },
  {
    category: '视觉',
    trend: '微渐变',
    description: '用非常接近的两个同色系颜色做微弱渐变，比纯色有层次又不像强渐变那样喧宾夺主。',
    example: '背景从 #FDF6E3 到 #FAF0D9 的微渐变，几乎看不出却更耐看',
  },
  {
    category: '视觉',
    trend: '毛玻璃质感（不用blur）',
    description: '用半透明白色色块 + 细描边模拟毛玻璃通透感，但不使用 CSS blur 滤镜（兼容性与性能更好）。',
    example: '卡片用 rgba(255,255,255,0.6) + 1px 浅灰描边模拟磨砂质感',
  },
  {
    category: '视觉',
    trend: '负空间设计',
    description: '刻意保留大片空白作为构图元素，让少的内容显得更珍贵，高级感拉满。',
    example: '页面只放一句话居中，四周大片留白，极简又有力',
  },

  // ---- 字体 ----
  {
    category: '字体',
    trend: '思源黑体',
    description: 'Source Han Sans 开源免费、字形现代、字重齐全，是中文PPT的安全牌首选。',
    example: '标题用 Bold，正文用 Regular，数字用 Medium',
  },
  {
    category: '字体',
    trend: '苹方',
    description: 'Apple 生态默认中文字体，字形挺拔利落，macOS/iOS 演示无字体缺失风险。',
    example: '苹果设备演示优先 PingFang SC，回退思源黑体',
  },
  {
    category: '字体',
    trend: '鸿蒙黑体',
    description: 'HarmonyOS Sans 线条均匀、现代感强，且免费可商用，国产新锐选择。',
    example: '华为生态演示优先 HarmonyOS Sans，风格年轻',
  },
  {
    category: '字体',
    trend: '现代无衬线统一',
    description: '全篇统一使用一种无衬线字体族，靠字重/字号拉开层级，绝不混用衬线与艺术体。',
    example: '通篇思源黑体，仅用 Bold/Medium/Regular 切换层级',
  },
];

// ============ 文件路径常量 ============

/** 进修笔记文件（相对 D:\code\llm-wiki-data\） */
const STUDY_NOTES_PATH = 'research/ppt-study-notes.md';
/** 历史评估记录文件（由 ppt-generator 写入） */
const EVALUATION_NOTES_PATH = 'research/pptagent-study-notes.md';

// ============ 方法实现 ============

/**
 * 返回内置的小红书 PPT 设计趋势知识库
 *
 * @returns 内置趋势数组（配色/排版/内容/视觉/字体五维度）
 */
function getBuiltinTrends(): DesignTrend[] {
  // 返回副本，避免外部误改常量
  return BUILTIN_TRENDS.map((t) => ({ ...t }));
}

/**
 * 把内置趋势数组按维度分组，拼成可读的摘要文本
 * 用于 LLM 失败时降级返回，以及 runStudySession 兜底
 */
function buildBuiltinTrendsSummary(): string {
  const trends = BUILTIN_TRENDS;
  const grouped = new Map<string, DesignTrend[]>();
  for (const t of trends) {
    if (!grouped.has(t.category)) grouped.set(t.category, []);
    grouped.get(t.category)!.push(t);
  }
  const lines: string[] = ['【内置小红书PPT设计趋势知识库】'];
  for (const [category, items] of grouped) {
    lines.push(`\n■ ${category}维度：`);
    for (const item of items) {
      lines.push(`  - ${item.trend}：${item.description}`);
    }
  }
  lines.push('\n核心趋势：低饱和配色 + 大字标题 + 卡片式留白 + 每页一观点 + 现代无衬线字体。');
  return lines.join('\n');
}

/**
 * 用 LLM 进修最新 PPT 设计趋势
 *
 * 调用 chat() 让 LLM 扮演 PPT 设计专家，结合小红书/设计社区最新趋势，
 * 返回配色/排版/内容/视觉/字体五个维度的指导摘要。
 *
 * 容错策略：LLM 调用失败时降级返回内置趋势摘要，不抛异常。
 *
 * @returns 趋势摘要字符串
 */
async function studyTrends(): Promise<string> {
  const systemPrompt =
    '你是一位资深的 PPT 设计专家，深谙小红书、站酷、Behance 等设计社区的最新 PPT 设计趋势，' +
    '尤其熟悉面向年轻人的知识分享型 PPT 审美。\n\n' +
    '请结合当下小红书爆款 PPT 的共性，从以下五个维度给出当前流行的 PPT 设计指导：\n' +
    '1. 配色：推荐配色方案与禁忌\n' +
    '2. 排版：版式布局建议\n' +
    '3. 内容：信息组织方式\n' +
    '4. 视觉：视觉风格要素\n' +
    '5. 字体：字体选择建议\n\n' +
    '每个维度用 2-3 句话精炼描述，给出可落地的具体建议。' +
    '最后用一句话总结当下 PPT 设计的核心趋势。';

  try {
    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '请进修并输出当前最流行的 PPT 设计趋势指导。' },
      ],
      { temperature: 0.7, maxTokens: 1200 },
    );

    if (result.success && result.content.trim().length > 0) {
      return result.content.trim();
    }
    // LLM 返回失败或空内容，降级返回内置趋势摘要
    return buildBuiltinTrendsSummary();
  } catch {
    // 异常时降级返回内置趋势，不抛异常
    return buildBuiltinTrendsSummary();
  }
}

/**
 * 把进修成果追加保存到 research/ppt-study-notes.md
 *
 * 采用"先读后追加再写回"策略：
 *   1. 先 invoke('read_json_file') 读取现有内容（返回 "[]" 时当作空）
 *   2. 拼接新笔记条目（markdown 格式）
 *   3. 再 invoke('write_json_file') 写回
 *
 * 失败时静默处理（打印警告），不抛异常，不影响主流程。
 *
 * @param note 本次进修笔记
 */
async function saveStudyNotes(note: StudyNote): Promise<void> {
  // 1. 先读现有内容
  let existing = '';
  try {
    existing = await invoke<string>('read_json_file', { filename: STUDY_NOTES_PATH });
    // read_json_file 对不存在的文件返回 "[]"，此时当作空内容
    if (existing === '[]') existing = '';
  } catch {
    // 文件不存在或读取失败，当作空内容
    existing = '';
  }

  // 2. 拼接新笔记条目（markdown 格式）
  const entry =
    '\n## PPT 设计进修记录\n\n' +
    '- 时间: ' + note.timestamp + '\n' +
    '- 趋势摘要:\n' + note.trends + '\n' +
    '- 弱项: ' + note.weakPoints + '\n' +
    '- 改进方向: ' + note.improvements + '\n';

  // 3. 写回
  try {
    await invoke('write_json_file', {
      filename: STUDY_NOTES_PATH,
      content: existing + entry,
    });
  } catch (e) {
    console.warn('[PPTDesignLearner] 保存进修笔记失败:', e);
  }
}

/**
 * 读取现有学习笔记
 *
 * 调用 invoke('read_json_file') 读取 research/ppt-study-notes.md，
 * 返回字符串内容（文件不存在时返回 "[]"，原样返回由调用方处理）。
 *
 * @returns markdown 字符串内容
 */
async function getStudyNotes(): Promise<string> {
  try {
    const content = await invoke<string>('read_json_file', { filename: STUDY_NOTES_PATH });
    // 文件不存在时后端返回 "[]"，转成空串便于上层展示
    return content === '[]' ? '' : content;
  } catch {
    // 读取失败返回空串
    return '';
  }
}

/**
 * 读取 pptagent-study-notes.md 历史评估记录并解析
 *
 * 该文件由 ppt-generator.ts 的 saveEvaluationToNotes 写入，markdown 格式：
 *   ## PPTAgent 反思评估记录
 *   - 时间: ...
 *   - 主题: ...
 *   - 用途: ...
 *   - 受众: ...
 *   - 评分: Content=8 Design=7 Coherence=9 总分=24
 *   - 改进建议: ...
 *
 * 用正则按块切分后逐字段提取，返回 EvaluationRecord 数组（按时间正序）。
 * 解析失败的字段用默认值兜底，不抛异常。
 *
 * @returns 评估记录数组
 */
async function getEvaluationHistory(): Promise<EvaluationRecord[]> {
  let raw = '';
  try {
    raw = await invoke<string>('read_json_file', { filename: EVALUATION_NOTES_PATH });
  } catch {
    return [];
  }
  if (!raw || raw === '[]') return [];

  // 按 "## PPTAgent 反思评估记录" 切分成块（第一块是文件头/空串，丢弃）
  const blocks = raw.split(/## PPTAgent 反思评估记录/).slice(1);
  const records: EvaluationRecord[] = [];

  for (const block of blocks) {
    // 逐字段正则提取，缺失字段用默认值兜底
    const timeMatch = block.match(/- 时间:\s*(.+)/);
    const topicMatch = block.match(/- 主题:\s*(.+)/);
    const purposeMatch = block.match(/- 用途:\s*(.+)/);
    const audienceMatch = block.match(/- 受众:\s*(.+)/);
    // 评分行：Content=8 Design=7 Coherence=9 总分=24
    const scoreMatch = block.match(
      /- 评分:\s*Content=(\d+)\s*Design=(\d+)\s*Coherence=(\d+)\s*总分=(\d+)/,
    );
    const suggestMatch = block.match(/- 改进建议:\s*(.+)/);

    // 没有评分行的块跳过（不是合法评估记录）
    if (!scoreMatch) continue;

    const suggestionsText = suggestMatch ? suggestMatch[1].trim() : '无';
    // 建议用中文分号/分号分隔，"无"视作空数组
    const suggestions =
      suggestionsText === '无'
        ? []
        : suggestionsText.split(/[；;]/).map((s) => s.trim()).filter((s) => s.length > 0);

    records.push({
      timestamp: timeMatch ? timeMatch[1].trim() : '',
      topic: topicMatch ? topicMatch[1].trim() : '',
      purpose: purposeMatch ? purposeMatch[1].trim() : '',
      audience: audienceMatch ? audienceMatch[1].trim() : '',
      content: parseInt(scoreMatch[1], 10) || 0,
      design: parseInt(scoreMatch[2], 10) || 0,
      coherence: parseInt(scoreMatch[3], 10) || 0,
      total: parseInt(scoreMatch[4], 10) || 0,
      suggestions,
    });
  }

  return records;
}

/**
 * 分析最近若干次评估，找出平均分最低的维度
 *
 * @param history 评估历史（按时间正序）
 * @param window  取最近多少次评估（默认 5）
 * @returns [维度名, 平均分, 改进建议拼接] 或 null（无历史）
 */
function analyzeWeakPoints(
  history: EvaluationRecord[],
  window = 5,
): { weakDimension: string; avgScore: number; latestSuggestions: string[] } | null {
  if (history.length === 0) return null;
  const recent = history.slice(-window);
  const n = recent.length;
  const avgContent = recent.reduce((s, r) => s + r.content, 0) / n;
  const avgDesign = recent.reduce((s, r) => s + r.design, 0) / n;
  const avgCoherence = recent.reduce((s, r) => s + r.coherence, 0) / n;

  // 三个维度按平均分升序，取最低
  const dimensions: Array<[string, number]> = [
    ['内容(content)', avgContent],
    ['设计(design)', avgDesign],
    ['连贯性(coherence)', avgCoherence],
  ];
  dimensions.sort((a, b) => a[1] - b[1]);

  return {
    weakDimension: dimensions[0][0],
    avgScore: dimensions[0][1],
    latestSuggestions: recent[n - 1].suggestions,
  };
}

/**
 * 综合学习笔记 + 评估弱项 + 小红书趋势，返回 PPT 生成 prompt 指导文本
 *
 * 流程：
 *   1. 获取内置趋势 → 拼接为 trendsPrompt
 *   2. 获取评估历史 → 找出最近 5 次评估中分数最低的维度 → 拼接为 weakPointsPrompt
 *   3. fullGuidance = trendsPrompt + '\n' + weakPointsPrompt
 *   4. 返回 DesignGuidance 对象
 *
 * 任何子步骤失败都不抛异常，对应 prompt 留空，保证生成器可继续工作。
 *
 * @returns 设计指导文本
 */
async function getDesignGuidance(): Promise<DesignGuidance> {
  // 1. 获取内置趋势 → 拼接为 trendsPrompt
  const trends = getBuiltinTrends();
  const grouped = new Map<string, DesignTrend[]>();
  for (const t of trends) {
    if (!grouped.has(t.category)) grouped.set(t.category, []);
    grouped.get(t.category)!.push(t);
  }
  const trendsLines: string[] = ['【小红书 PPT 设计趋势指导】'];
  for (const [category, items] of grouped) {
    trendsLines.push(`\n■ ${category}维度：`);
    for (const item of items) {
      trendsLines.push(`  - ${item.trend}：${item.description}（示例：${item.example}）`);
    }
  }
  const trendsPrompt = trendsLines.join('\n');

  // 2. 获取评估历史 → 找出最近 5 次评估中分数最低的维度 → 拼接为 weakPointsPrompt
  let weakPointsPrompt = '';
  try {
    const history = await getEvaluationHistory();
    const analysis = analyzeWeakPoints(history, 5);
    if (analysis) {
      weakPointsPrompt =
        `\n【评估弱项指导】\n` +
        `最近评估中，${analysis.weakDimension} 维度平均分最低（${analysis.avgScore.toFixed(1)} 分），` +
        `生成 PPT 时应重点改进该维度。`;
      if (analysis.latestSuggestions.length > 0) {
        weakPointsPrompt += `\n最近一次评估的改进建议：${analysis.latestSuggestions.join('；')}`;
      }
    }
  } catch {
    // 评估历史读取失败，弱项指导留空
  }

  // 3. 合并
  const fullGuidance = trendsPrompt + '\n' + weakPointsPrompt;

  // 4. 返回
  return { trendsPrompt, weakPointsPrompt, fullGuidance };
}

/**
 * 一站式进修流程
 *
 * 流程：
 *   1. 调用 studyTrends() 获取最新趋势
 *   2. 调用 getEvaluationHistory() 分析评估弱项
 *   3. 构造 StudyNote 对象，调用 saveStudyNotes() 保存
 *   4. 返回本次进修摘要字符串（包含趋势要点和弱项改进方向）
 *
 * @returns 本次进修摘要
 */
async function runStudySession(): Promise<string> {
  // 1. 进修最新趋势
  const trends = await studyTrends();

  // 2. 分析评估弱项
  let weakPoints = '暂无评估历史，待积累后定位弱项';
  let improvements = '持续生成 PPT 并评估，积累数据后再做针对性改进';
  try {
    const history = await getEvaluationHistory();
    const analysis = analyzeWeakPoints(history, 5);
    if (analysis) {
      weakPoints = `${analysis.weakDimension} 维度平均分最低（${analysis.avgScore.toFixed(1)} 分）`;
      improvements =
        `重点提升 ${analysis.weakDimension} 维度；` +
        (analysis.latestSuggestions.length > 0
          ? `参考最近建议：${analysis.latestSuggestions.join('；')}`
          : '暂无具体建议，结合趋势指导改进');
    }
  } catch {
    // 读取失败，用默认值
  }

  // 3. 构造笔记并保存
  const note: StudyNote = {
    timestamp: new Date().toISOString(),
    trends,
    weakPoints,
    improvements,
  };
  await saveStudyNotes(note);

  // 4. 返回本次进修摘要
  return (
    `【PPT 设计进修摘要 ${note.timestamp}】\n\n` +
    `一、趋势要点：\n${trends}\n\n` +
    `二、弱项分析：\n${weakPoints}\n\n` +
    `三、改进方向：\n${improvements}`
  );
}

// ============ 单例导出 ============

export const pptDesignLearner = {
  getBuiltinTrends,
  studyTrends,
  saveStudyNotes,
  getStudyNotes,
  getEvaluationHistory,
  getDesignGuidance,
  runStudySession,
};