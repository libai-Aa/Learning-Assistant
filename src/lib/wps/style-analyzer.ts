/**
 * 风格分析器 (StyleAnalyzer)
 *
 * @description "更懂你的WPS"风格学习系统的第一层：从单个文档/PPT/文章中
 *   提取可观察的风格特征，输出结构化的 DocumentStyle。
 *
 *   设计思路（说人话）：
 *     这一层是"品鉴师"——拿到一份文档，把它在视觉、文本、内容三个维度上
 *     "品"一遍，给出一份结构化的品鉴报告。后续 StyleLearner 拿这份报告
 *     去做综合学习，培养出懂用户品位的画像。
 *
 *   分析维度：
 *     1. 视觉风格：配色、字体、字号、布局、密度、图表/图片使用
 *     2. 文本风格：语气、句长、词汇难度、结构模式、正式/简洁程度
 *     3. 内容风格：主题偏好、例子使用、数据使用、引用风格
 *
 *   实现策略：
 *     - 启发式规则 + 关键词匹配（无需 ML 模型，纯函数便于单测与跨环境复用）
 *     - 信号缺失时给出合理默认值，confidence 反映信号强度
 *
 * @module src/lib/wps/style-analyzer
 */

import type {
  ColorScheme,
  ContentStyle,
  DataUsageType,
  DocumentStyle,
  ExampleUsageLevel,
  FontPreference,
  LayoutStyle,
  SizePreference,
  StyleAnalysisInput,
  StructurePattern,
  TextualStyle,
  ToneStyle,
  VocabularyLevel,
  VisualStyle,
  VisualDensityLevel,
  VisualUsageLevel,
} from '../../types/style';
import {
  TemplateCategory,
  type TemplateCategoryValue,
} from '../../types/template';

// ============ 颜色分析 ============

/**
 * 已知的语义颜色（hex，小写）
 * 用于把原始颜色列表归类到 primary/secondary/accent/background
 */
const SEMANTIC_COLORS = {
  // 常见主色
  primary: new Set([
    '#1a56db', '#2563eb', '#1d4ed8', '#dc2626', '#db2777',
    '#7c3aed', '#ea580c', '#0d9488', '#1e40af', '#3b82f6',
  ]),
  // 常见强调色
  accent: new Set([
    '#f59e0b', '#f97316', '#eab308', '#22c55e', '#10b981',
    '#ef4444', '#f43f5e', '#ec4899',
  ]),
  // 常见背景色
  background: new Set([
    '#ffffff', '#fffefe', '#f8fafc', '#f1f5f9', '#e5e7eb',
    '#000000', '#0f172a', '#1e293b',
  ]),
};

/**
 * 把 hex 颜色规范化为小写 6 位格式
 * 输入非法时返回 null
 */
export function normalizeHexColor(color: string): string | null {
  if (!color) return null;
  let c = color.trim().toLowerCase();
  if (c.startsWith('#')) c = c.slice(1);
  // 支持 3 位简写 #abc -> #aabbcc
  if (c.length === 3) {
    c = c.split('').map((ch) => ch + ch).join('');
  }
  if (c.length !== 6 || !/^[0-9a-f]{6}$/.test(c)) return null;
  return `#${c}`;
}

/**
 * 计算颜色亮度（0-255）
 * 使用标准 ITU-R BT.601 加权：0.299R + 0.587G + 0.114B
 */
export function colorBrightness(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return 128;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * 判断颜色是否为深色（亮度 < 128）
 */
export function isDarkColor(hex: string): boolean {
  return colorBrightness(hex) < 128;
}

/**
 * 推断调色板类型
 * 简化版：颜色少且色相接近 -> monochrome / analogous；否则 custom
 */
function inferPaletteType(colors: string[]): ColorScheme['paletteType'] {
  if (colors.length <= 1) return 'monochrome';
  if (colors.length === 2) return 'complementary';
  if (colors.length <= 4) return 'analogous';
  return 'custom';
}

/**
 * 分析配色方案
 * 把原始颜色列表按语义角色分组
 */
export function analyzeColorScheme(
  colors: string[] = [],
  isDarkTheme?: boolean
): ColorScheme {
  const normalized = colors
    .map(normalizeHexColor)
    .filter((c): c is string => c !== null);
  const unique = Array.from(new Set(normalized));

  const primary: string[] = [];
  const secondary: string[] = [];
  const accent: string[] = [];
  const background: string[] = [];

  for (const c of unique) {
    if (SEMANTIC_COLORS.background.has(c)) {
      background.push(c);
    } else if (SEMANTIC_COLORS.accent.has(c)) {
      accent.push(c);
    } else if (SEMANTIC_COLORS.primary.has(c)) {
      primary.push(c);
    } else {
      // 未命中语义表，按亮度兜底分类
      const brightness = colorBrightness(c);
      if (brightness > 230) {
        background.push(c);
      } else if (brightness < 60) {
        background.push(c);
      } else if (brightness > 180) {
        accent.push(c);
      } else {
        secondary.push(c);
      }
    }
  }

  // 兜底：若没有主色，把第一个非背景色当主色
  if (primary.length === 0) {
    const candidate = secondary.shift() || accent.shift();
    if (candidate) primary.push(candidate);
  }
  // 兜底：若没有背景色，根据主题给默认
  if (background.length === 0) {
    background.push(isDarkTheme ? '#0f172a' : '#ffffff');
  }

  const dark = isDarkTheme !== undefined
    ? isDarkTheme
    : background.some(isDarkColor);

  return {
    primary: primary.slice(0, 4),
    secondary: secondary.slice(0, 4),
    accent: accent.slice(0, 4),
    background: background.slice(0, 3),
    isDark: dark,
    paletteType: inferPaletteType(unique),
  };
}

// ============ 字体分析 ============

/**
 * 已知字体分类表
 */
const FONT_CATEGORIES: Array<{ patterns: RegExp; category: FontPreference['category'] }> = [
  { patterns: /(serif|宋体|楷体|仿宋|times|georgia|garamond)/i, category: 'serif' },
  { patterns: /(sans|黑体|微软雅黑|思源|arial|helvetica|roboto|open ?sans)/i, category: 'sans-serif' },
  { patterns: /(mono|consolas|courier|menlo|source ?code)/i, category: 'monospace' },
];

/**
 * 推断字体大类
 */
export function inferFontCategory(fonts: string[]): FontPreference['category'] {
  if (fonts.length === 0) return 'sans-serif';
  const categories = new Set<FontPreference['category']>();
  for (const font of fonts) {
    for (const { patterns, category } of FONT_CATEGORIES) {
      if (patterns.test(font)) {
        categories.add(category);
        break;
      }
    }
  }
  if (categories.size === 0) return 'sans-serif';
  if (categories.size === 1) return Array.from(categories)[0];
  return 'mixed';
}

/**
 * 推断字重偏好
 * 简化：从字体名中的 light/bold/regular 信号判断
 */
export function inferWeightPreference(fonts: string[]): FontPreference['weightPreference'] {
  const text = fonts.join(' ').toLowerCase();
  const hasLight = /light|细|thin/.test(text);
  const hasBold = /bold|粗|heavy|black/.test(text);
  const hasRegular = /regular|normal|常规/.test(text);
  if (hasLight && hasBold) return 'mixed';
  if (hasBold) return 'bold';
  if (hasLight) return 'light';
  if (hasRegular) return 'regular';
  return 'regular';
}

/**
 * 分析字体偏好
 */
export function analyzeFontPreference(fonts: string[] = []): FontPreference {
  const cleaned = fonts.filter(Boolean);
  return {
    primaryFont: cleaned[0] || 'sans-serif',
    secondaryFont: cleaned[1],
    category: inferFontCategory(cleaned),
    weightPreference: inferWeightPreference(cleaned),
  };
}

// ============ 字号分析 ============

/**
 * 分析字号偏好
 */
export function analyzeSizePreference(sizes: number[] = []): SizePreference {
  if (sizes.length === 0) {
    return { tendency: 'regular' };
  }
  const sorted = [...sizes].sort((a, b) => a - b);
  // 简化：最大的当标题、中位数当正文、最小的当注释
  const title = sorted[sorted.length - 1];
  const body = sorted[Math.floor(sorted.length / 2)];
  const caption = sorted[0];

  // 字号整体偏移判断（以 11pt 为正文基准）
  let tendency: SizePreference['tendency'] = 'regular';
  if (body < 10) tendency = 'small';
  else if (body > 14) tendency = 'large';

  return { title, body, caption, tendency };
}

// ============ 布局分析 ============

/**
 * 推断布局类型
 * PPT 常见 cover-center/grid/flow；Word 常见 sidebar/single-column
 */
function inferLayoutType(
  documentType: string,
  multiColumn?: boolean,
  avgWordsPerPage?: number
): string {
  if (documentType === 'ppt') {
    if (avgWordsPerPage !== undefined && avgWordsPerPage < 50) return 'cover-center';
    return 'grid';
  }
  if (documentType === 'word' || documentType === 'pdf') {
    return multiColumn ? 'multi-column' : 'single-column';
  }
  return 'single-column';
}

/**
 * 计算留白比例
 * 简化：基于平均每页字数启发式估计
 * - < 50 字/页：极疏朗（0.8）
 * - 50-100：疏朗（0.6）
 * - 100-200：中等（0.4）
 * - > 200：紧凑（0.2）
 */
export function estimateWhitespaceRatio(avgWordsPerPage?: number): number {
  if (avgWordsPerPage === undefined || avgWordsPerPage <= 0) return 0.4;
  if (avgWordsPerPage < 50) return 0.8;
  if (avgWordsPerPage < 100) return 0.6;
  if (avgWordsPerPage < 200) return 0.4;
  return 0.2;
}

/**
 * 分析布局风格
 */
export function analyzeLayoutStyle(
  documentType: string,
  multiColumn?: boolean,
  avgWordsPerPage?: number
): LayoutStyle {
  return {
    type: inferLayoutType(documentType, multiColumn, avgWordsPerPage),
    whitespaceRatio: estimateWhitespaceRatio(avgWordsPerPage),
    multiColumn: multiColumn === true,
    alignment: multiColumn ? 'justify' : 'left',
  };
}

// ============ 密度与使用强度 ============

/**
 * 推断视觉密度
 */
export function inferVisualDensity(avgWordsPerPage?: number): VisualDensityLevel {
  if (avgWordsPerPage === undefined || avgWordsPerPage <= 0) return 'medium';
  if (avgWordsPerPage < 80) return 'sparse';
  if (avgWordsPerPage <= 200) return 'medium';
  return 'dense';
}

/**
 * 推断图片使用强度
 * - 0 张：none
 * - 1-2 张/页：light
 * - 3-5 张/页：moderate
 * - >5 张/页：heavy
 */
export function inferImageUsage(
  imageCount?: number,
  pageCount?: number
): VisualUsageLevel {
  if (!imageCount || imageCount === 0) return 'none';
  const pages = pageCount && pageCount > 0 ? pageCount : 1;
  const ratio = imageCount / pages;
  if (ratio < 1) return 'light';
  if (ratio <= 3) return 'moderate';
  return 'heavy';
}

/**
 * 推断图表使用强度
 */
export function inferChartUsage(
  chartCount?: number,
  pageCount?: number
): VisualUsageLevel {
  if (!chartCount || chartCount === 0) return 'none';
  const pages = pageCount && pageCount > 0 ? pageCount : 1;
  const ratio = chartCount / pages;
  if (ratio < 0.5) return 'light';
  if (ratio <= 2) return 'moderate';
  return 'heavy';
}

// ============ 视觉风格聚合 ============

/**
 * 分析视觉风格
 */
export function analyzeVisualStyle(input: StyleAnalysisInput): VisualStyle {
  return {
    colorScheme: analyzeColorScheme(input.colors, input.isDarkTheme),
    fontFamily: analyzeFontPreference(input.fonts),
    fontSize: analyzeSizePreference(input.fontSizes),
    layoutStyle: analyzeLayoutStyle(
      input.documentType,
      input.multiColumn,
      input.avgWordsPerPage
    ),
    visualDensity: inferVisualDensity(input.avgWordsPerPage),
    imageUsage: inferImageUsage(input.imageCount, input.pageCount),
    chartUsage: inferChartUsage(input.chartCount, input.pageCount),
  };
}

// ============ 文本风格分析 ============

/**
 * 推断语气风格
 */
export function inferToneStyle(text: string): ToneStyle {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  const formalSignals = ['综上', '因此', '据此', '研究表明', 'furthermore', 'therefore', '综上所述', '据此可知'];
  const casualSignals = ['咱们', '搞定', '棒', 'awesome', "let's", '哈哈', '嗯嗯', '搞定'];
  const academicSignals = ['abstract', '参考文献', '引言', 'methodology', 'hypothesis', 'lemma', 'theorem', 'et al'];
  const persuasiveSignals = ['应该', '建议', '推荐', '务必', '必须', 'should', 'must', 'recommend'];

  const count = (signals: string[]) =>
    signals.reduce((acc, s) => acc + (lower.includes(s.toLowerCase()) ? 1 : 0), 0);

  const scores = {
    formal: count(formalSignals),
    casual: count(casualSignals),
    academic: count(academicSignals),
    persuasive: count(persuasiveSignals),
  };

  const max = Math.max(scores.formal, scores.casual, scores.academic, scores.persuasive);
  if (max === 0) return 'neutral';
  if (scores.academic === max) return 'academic';
  if (scores.persuasive === max) return 'persuasive';
  if (scores.formal === max) return 'formal';
  return 'casual';
}

/**
 * 推断句长分布
 * 按句号/问号/叹号切句，统计平均长度
 */
export function inferSentenceLength(text: string): TextualStyle['sentenceLength'] {
  if (!text) return 'medium';
  const sentences = text
    .split(/[。！？.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 'medium';

  const lengths = sentences.map((s) => s.length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((acc, l) => acc + (l - avg) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // 句长差异大 -> mixed
  if (stdDev / Math.max(avg, 1) > 0.6) return 'mixed';
  if (avg < 15) return 'short';
  if (avg < 40) return 'medium';
  return 'long';
}

/**
 * 推断词汇难度
 * 简化：基于生僻词/专业词比例
 */
export function inferVocabularyLevel(text: string): VocabularyLevel {
  if (!text) return 'intermediate';
  // 简单词特征：常用字、口语
  const simpleSignals = ['我们', '大家', '可以', '就是', '这样', '一个'];
  // 高级词特征：学术、专业术语
  const advancedSignals = [
    '范式', '拓扑', '渐近', '同构', '协方差', '正交',
    'ontology', 'paradigm', 'asymptotic', 'isomorphism',
  ];

  const lower = text.toLowerCase();
  const simpleCount = simpleSignals.reduce((acc, s) => acc + (lower.includes(s) ? 1 : 0), 0);
  const advancedCount = advancedSignals.reduce((acc, s) => acc + (lower.includes(s.toLowerCase()) ? 1 : 0), 0);

  if (simpleCount > 0 && advancedCount > 0) return 'mixed';
  if (advancedCount > simpleCount && advancedCount > 0) return 'advanced';
  if (simpleCount > advancedCount && simpleCount > 0) return 'simple';
  return 'intermediate';
}

/**
 * 推断结构模式
 */
export function inferStructurePattern(text: string): StructurePattern {
  if (!text) return 'custom';
  const hasProblem = /问题|痛点|挑战|背景|现状/.test(text);
  const hasSolution = /方案|解决|对策|建议|措施/.test(text);
  const hasChronological = /首先|其次|然后|最后|阶段一|阶段二|第一步|第二步/.test(text);
  const hasPyramid = /结论|核心观点|总-分|总分|概述|小结/.test(text);
  const hasParallel = /一方面|另一方面|其一是|其二是|同时|此外/.test(text);
  const hasProgressive = /不仅|而且|更进一步|进而|于是/.test(text);
  const hasComparison = /相比|对比| versus |vs\.|不同之处|差异/.test(text);

  // 优先级：problem-solution > pyramid > chronological > comparison > progressive > parallel
  if (hasProblem && hasSolution) return 'problem-solution';
  if (hasPyramid) return 'pyramid';
  if (hasChronological) return 'chronological';
  if (hasComparison) return 'comparison';
  if (hasProgressive) return 'progressive';
  if (hasParallel) return 'parallel';
  return 'custom';
}

/**
 * 计算正式程度 [0,1]
 * 综合语气信号与代词使用
 */
export function calculateFormalityLevel(text: string): number {
  if (!text) return 0.5;
  const lower = text.toLowerCase();
  const formalSignals = ['综上', '因此', '据此', '研究表明', 'furthermore', 'therefore', '综上所述'];
  const casualSignals = ['咱们', '搞定', '棒', 'awesome', "let's", '哈哈', '嗯嗯'];

  const formalCount = formalSignals.reduce((acc, s) => acc + (lower.includes(s.toLowerCase()) ? 1 : 0), 0);
  const casualCount = casualSignals.reduce((acc, s) => acc + (lower.includes(s.toLowerCase()) ? 1 : 0), 0);

  // 基准 0.5，正式信号 +0.1/个，非正式信号 -0.1/个
  const score = 0.5 + formalCount * 0.1 - casualCount * 0.1;
  return Math.max(0, Math.min(1, score));
}

/**
 * 计算简洁程度 [0,1]
 * 基于平均句长与冗余词频率
 */
export function calculateConciseness(text: string): number {
  if (!text) return 0.5;
  const sentences = text
    .split(/[。！？.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0.5;

  const avgLen = sentences.reduce((a, s) => a + s.length, 0) / sentences.length;
  // 句子越短越简洁：30 字 -> 0.5，10 字 -> 0.9，60 字 -> 0.1
  const lengthScore = Math.max(0, Math.min(1, 1 - (avgLen - 10) / 50));

  // 冗余词扣分
  const redundantSignals = ['也就是说', '换句话说', '其实', '基本上', '总的来说', '一句话'];
  const redundantCount = redundantSignals.reduce(
    (acc, s) => acc + (text.includes(s) ? 1 : 0),
    0
  );
  return Math.max(0, lengthScore - redundantCount * 0.05);
}

/**
 * 分析文本风格
 */
export function analyzeTextualStyle(text: string): TextualStyle {
  return {
    toneStyle: inferToneStyle(text),
    sentenceLength: inferSentenceLength(text),
    vocabularyLevel: inferVocabularyLevel(text),
    structurePattern: inferStructurePattern(text),
    formalityLevel: calculateFormalityLevel(text),
    conciseness: calculateConciseness(text),
  };
}

// ============ 内容风格分析 ============

/**
 * 主题推断关键词表
 */
const TOPIC_KEYWORDS: Array<{ keywords: string[]; topic: string }> = [
  { keywords: ['金融', '财务', '营收', '利润', '资产'], topic: '财务金融' },
  { keywords: ['技术', '架构', '系统', '工程', '代码'], topic: '技术工程' },
  { keywords: ['营销', '品牌', '增长', '转化', '获客'], topic: '市场营销' },
  { keywords: ['科研', '实验', '假设', '论证', '论文'], topic: '科研学术' },
  { keywords: ['运营', '流程', '效率', '优化', '指标'], topic: '运营管理' },
  { keywords: ['设计', '视觉', '体验', '原型', 'ui'], topic: '设计创意' },
  { keywords: ['数据', '分析', '统计', '趋势', '指标'], topic: '数据分析' },
  { keywords: ['产品', '迭代', 'roadmap', '需求', '用户'], topic: '产品规划' },
];

/**
 * 推断主题偏好
 */
export function inferTopicPreference(
  text: string,
  explicitTopics?: string[]
): string[] {
  const topics = new Set<string>();
  if (explicitTopics) {
    explicitTopics.forEach((t) => topics.add(t));
  }
  if (text) {
    const lower = text.toLowerCase();
    for (const { keywords, topic } of TOPIC_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        topics.add(topic);
      }
    }
  }
  return Array.from(topics);
}

/**
 * 推断例子使用频率
 */
export function inferExampleUsage(text: string): ExampleUsageLevel {
  if (!text) return 'rare';
  // 注意：'如' 过于宽泛（会匹配 '例如' 中的 '如'），故不单独使用
  const exampleSignals = ['例如', '比如', '举例', '案例', 'for example', 'e.g.'];
  const lower = text.toLowerCase();
  const count = exampleSignals.reduce((acc, s) => acc + (lower.includes(s.toLowerCase()) ? 1 : 0), 0);
  if (count >= 3) return 'frequent';
  if (count >= 1) return 'occasional';
  return 'rare';
}

/**
 * 推断数据使用类型
 */
export function inferDataUsage(text: string): DataUsageType {
  if (!text) return 'none';
  const lower = text.toLowerCase();
  const hasQuantitative = /\d+(\.\d+)?%|\d+万|\d+亿|\$|\d+\.\d+/.test(text) ||
    ['数据', '统计', '指标', '占比', '同比', '环比'].some((s) => lower.includes(s));
  const hasQualitative = ['体验', '感受', '反馈', '评价', '印象', '主观'].some((s) => lower.includes(s));
  if (hasQuantitative && hasQualitative) return 'mixed';
  if (hasQuantitative) return 'quantitative';
  if (hasQualitative) return 'qualitative';
  return 'none';
}

/**
 * 分析内容风格
 */
export function analyzeContentStyle(
  text: string,
  citationStyle?: string,
  topics?: string[]
): ContentStyle {
  return {
    topicPreference: inferTopicPreference(text, topics),
    exampleUsage: inferExampleUsage(text),
    dataUsage: inferDataUsage(text),
    citationStyle,
  };
}

// ============ 分类推断 ============

/**
 * 关键词 → 分类推断
 */
const CATEGORY_KEYWORDS: Array<{
  keywords: string[];
  category: TemplateCategoryValue;
}> = [
  { keywords: ['论文', '引用', 'abstract', '参考文献'], category: TemplateCategory.ACADEMIC },
  { keywords: ['商业', '计划', '融资', 'bp'], category: TemplateCategory.BUSINESS },
  { keywords: ['技术', '架构', '系统', '工程'], category: TemplateCategory.TECHNICAL },
  { keywords: ['创意', '设计', '灵感'], category: TemplateCategory.CREATIVE },
  { keywords: ['报告', '总结', '汇报'], category: TemplateCategory.REPORT },
  { keywords: ['演示', '演讲', '展示', 'slides'], category: TemplateCategory.PRESENTATION },
];

/**
 * 推断文档分类
 */
export function inferCategory(text: string): TemplateCategoryValue | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return category;
    }
  }
  return undefined;
}

// ============ 置信度计算 ============

/**
 * 计算分析置信度
 * 信号越充分置信度越高
 */
export function calculateAnalysisConfidence(input: StyleAnalysisInput): number {
  let signals = 0;
  let hits = 0;

  // 文本信号
  signals++;
  if (input.textContent && input.textContent.length > 50) hits++;

  // 颜色信号
  signals++;
  if (input.colors && input.colors.length > 0) hits++;

  // 字体信号
  signals++;
  if (input.fonts && input.fonts.length > 0) hits++;

  // 字号信号
  signals++;
  if (input.fontSizes && input.fontSizes.length > 0) hits++;

  // 页数信号
  signals++;
  if (input.pageCount && input.pageCount > 0) hits++;

  // 图片/图表信号
  signals++;
  if ((input.imageCount || 0) + (input.chartCount || 0) > 0) hits++;

  return signals === 0 ? 0 : hits / signals;
}


// ============ 主分析函数 ============

/**
 * 风格分析器类
 * 提供面向对象的接口；底层纯函数也已导出，便于单测
 */
export class StyleAnalyzer {
  /**
   * 分析文档风格
   *
   * @param input 文档可观察信号
   * @returns 结构化的文档风格画像
   */
  analyze(input: StyleAnalysisInput): DocumentStyle {
    const text = input.textContent || '';
    return {
      documentType: input.documentType,
      category: input.category || inferCategory(text),
      visual: analyzeVisualStyle(input),
      textual: analyzeTextualStyle(text),
      content: analyzeContentStyle(text, input.citationStyle, input.topics),
      confidence: calculateAnalysisConfidence(input),
    };
  }

  /**
   * 分析 PPT 风格（便捷方法）
   */
  analyzePPT(input: Omit<StyleAnalysisInput, 'documentType'>): DocumentStyle {
    return this.analyze({ ...input, documentType: 'ppt' });
  }

  /**
   * 分析 Word 文档风格（便捷方法）
   */
  analyzeWord(input: Omit<StyleAnalysisInput, 'documentType'>): DocumentStyle {
    return this.analyze({ ...input, documentType: 'word' });
  }

  /**
   * 分析文章风格（便捷方法，纯文本场景）
   */
  analyzeArticle(input: Omit<StyleAnalysisInput, 'documentType'>): DocumentStyle {
    return this.analyze({ ...input, documentType: 'word' });
  }
}

/**
 * 默认风格分析器单例
 */
export const styleAnalyzer = new StyleAnalyzer();