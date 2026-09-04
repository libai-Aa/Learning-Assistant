/**
 * 风格学习系统类型定义
 *
 * @description "更懂你的WPS"风格学习的核心数据结构。
 *   风格学习系统从用户满意的模板中提取风格特征，培养懂用户品位的智能体。
 *
 *   核心抽象：
 *   - DocumentStyle：单个文档/PPT 的可观察风格（视觉 + 文本 + 内容）
 *   - UserStyleProfile：用户综合风格画像，含权重、置信度、演变轨迹
 *   - StyleChange：风格演变事件，记录用户品位的变化
 *
 *   设计原则：
 *   1. 从满意中学习 —— 只从评分≥4 或用户标记满意的模板学习
 *   2. 场景感知     —— 不同场景使用不同风格权重
 *   3. 持续进化     —— 每次新模板都更新风格画像
 *   4. 可解释       —— 能说明为什么推荐某种风格
 *
 * @module src/types/style
 */

import type {
  DocumentTypeValue,
  TemplateCategoryValue,
} from './template';

// ============ 视觉风格 ============

/**
 * 配色方案
 * 把模板里出现的颜色按"角色"分组，便于跨模板对比与推荐
 */
export interface ColorScheme {
  /** 主色调（hex 列表，如 ['#1a56db']） */
  primary: string[];
  /** 辅助色 */
  secondary: string[];
  /** 强调色（用于按钮、关键数据等） */
  accent: string[];
  /** 背景色 */
  background: string[];
  /** 是否深色主题 */
  isDark: boolean;
  /** 调色板类型 */
  paletteType: 'monochrome' | 'complementary' | 'analogous' | 'custom';
}

/**
 * 字体偏好
 */
export interface FontPreference {
  /** 主字体（如 '思源黑体'） */
  primaryFont: string;
  /** 次字体（如 'Times New Roman'） */
  secondaryFont?: string;
  /** 字体大类 */
  category: 'serif' | 'sans-serif' | 'monospace' | 'mixed';
  /** 字重偏好 */
  weightPreference: 'light' | 'regular' | 'bold' | 'mixed';
}

/**
 * 字号偏好
 * 用区间描述字号分布，避免单点丢失信息
 */
export interface SizePreference {
  /** 标题字号（pt） */
  title?: number;
  /** 正文字号（pt） */
  body?: number;
  /** 注释/脚注字号（pt） */
  caption?: number;
  /** 字号整体偏移：负=偏小、0=常规、正=偏大 */
  tendency: 'small' | 'regular' | 'large';
}

/**
 * 布局风格
 */
export interface LayoutStyle {
  /** 布局类型（如 'grid' / 'flow' / 'sidebar' / 'cover-center'） */
  type: string;
  /** 留白比例 [0,1]，越大越疏朗 */
  whitespaceRatio: number;
  /** 是否多栏 */
  multiColumn: boolean;
  /** 对齐方式偏好 */
  alignment: 'left' | 'center' | 'justify' | 'mixed';
}

/**
 * 视觉密度
 * 描述页面信息密度
 */
export type VisualDensityLevel = 'sparse' | 'medium' | 'dense';

/**
 * 图表/图片使用强度
 */
export type VisualUsageLevel = 'heavy' | 'moderate' | 'light' | 'none';

/**
 * 视觉风格聚合
 */
export interface VisualStyle {
  /** 配色方案 */
  colorScheme: ColorScheme;
  /** 字体偏好 */
  fontFamily: FontPreference;
  /** 字号偏好 */
  fontSize: SizePreference;
  /** 布局风格 */
  layoutStyle: LayoutStyle;
  /** 视觉密度 */
  visualDensity: VisualDensityLevel;
  /** 图片使用强度 */
  imageUsage: VisualUsageLevel;
  /** 图表使用强度 */
  chartUsage: VisualUsageLevel;
}

// ============ 文本风格 ============

/**
 * 语气风格
 * formal=正式、casual=随意、academic=学术、persuasive=说服、neutral=中性
 */
export type ToneStyle = 'formal' | 'casual' | 'academic' | 'persuasive' | 'neutral';

/**
 * 句长分布
 */
export type SentenceLengthLevel = 'short' | 'medium' | 'long' | 'mixed';

/**
 * 词汇难度
 */
export type VocabularyLevel = 'simple' | 'intermediate' | 'advanced' | 'mixed';

/**
 * 结构模式
 * - problem-solution：问题-方案
 * - chronological：时间顺序
 * - pyramid：金字塔（总分总）
 * - parallel：并列
 * - progressive：递进
 * - comparison：对比
 * - custom：自定义/其他
 */
export type StructurePattern =
  | 'problem-solution'
  | 'chronological'
  | 'pyramid'
  | 'parallel'
  | 'progressive'
  | 'comparison'
  | 'custom';

/**
 * 文本风格聚合
 */
export interface TextualStyle {
  /** 语气风格 */
  toneStyle: ToneStyle;
  /** 句长分布 */
  sentenceLength: SentenceLengthLevel;
  /** 词汇难度 */
  vocabularyLevel: VocabularyLevel;
  /** 结构模式 */
  structurePattern: StructurePattern;
  /** 正式程度 [0,1] */
  formalityLevel: number;
  /** 简洁程度 [0,1] */
  conciseness: number;
}

// ============ 内容风格 ============

/**
 * 例子使用频率
 */
export type ExampleUsageLevel = 'frequent' | 'occasional' | 'rare';

/**
 * 数据使用类型
 */
export type DataUsageType = 'quantitative' | 'qualitative' | 'mixed' | 'none';

/**
 * 内容风格聚合
 */
export interface ContentStyle {
  /** 主题偏好（如 ['数据分析', '市场调研']） */
  topicPreference: string[];
  /** 例子使用频率 */
  exampleUsage: ExampleUsageLevel;
  /** 数据使用类型 */
  dataUsage: DataUsageType;
  /** 引用风格（如 'APA' / 'GB/T 7714' / 'inline'） */
  citationStyle?: string;
}

// ============ 文档风格 ============

/**
 * 单个文档的完整风格画像
 * 由 StyleAnalyzer 从原始文档中提取
 */
export interface DocumentStyle {
  /** 文档类型 */
  documentType: DocumentTypeValue;
  /** 文档分类（可选，未分类时由分析器推断） */
  category?: TemplateCategoryValue;
  /** 视觉风格 */
  visual: VisualStyle;
  /** 文本风格 */
  textual: TextualStyle;
  /** 内容风格 */
  content: ContentStyle;
  /** 分析置信度 [0,1]，反映提取信号强度 */
  confidence: number;
}

// ============ 风格演变 ============

/**
 * 风格变化事件
 * 记录用户品位随时间的演变，用于追踪偏好漂移
 */
export interface StyleChange {
  /** 事件 ID */
  id: string;
  /** 变化时间（ISO 字符串） */
  timestamp: string;
  /** 触发变化的模板 ID */
  templateId: string;
  /** 变化维度 */
  dimension: 'visual' | 'textual' | 'content';
  /** 变化字段名（如 'toneStyle' / 'colorScheme'） */
  field: string;
  /** 旧值（序列化为字符串便于记录） */
  oldValue: string;
  /** 新值 */
  newValue: string;
  /** 变化幅度 [0,1]，越大变化越显著 */
  magnitude: number;
}

// ============ 风格权重 ============

/**
 * 风格权重表
 * 不同场景下用户偏好可能不同，按维度分别计权
 */
export interface StyleWeights {
  /** 按文档类别加权（如 academic: 0.8, business: 0.3） */
  byCategory: Record<string, number>;
  /** 按使用场景加权（如 '工作汇报': 0.6） */
  byScenario: Record<string, number>;
  /** 按主题加权（如 '数据分析': 0.5） */
  byTopic: Record<string, number>;
}

// ============ 学习历史 ============

/**
 * 风格学习历史
 */
export interface StyleLearningHistory {
  /** 已分析的模板数 */
  templatesAnalyzed: number;
  /** 最后更新时间（ISO 字符串） */
  lastUpdated: string;
  /** 置信度 [0,1]，反映画像成熟度 */
  confidenceLevel: number;
}

// ============ 用户风格画像 ============

/**
 * 用户综合风格画像
 * 由 StyleLearner 从多个满意模板中学习得到
 */
export interface UserStyleProfile {
  /** 用户 ID */
  userId: string;

  /** 学习到的风格偏好（聚合后的代表风格） */
  preferredStyles: {
    visual: VisualStyle;
    textual: TextualStyle;
    content: ContentStyle;
  };

  /** 风格权重（不同场景下的偏好强度） */
  styleWeights: StyleWeights;

  /** 学习历史 */
  learningHistory: StyleLearningHistory;

  /** 风格演变轨迹（按时间顺序） */
  styleEvolution: StyleChange[];

  /** 创建时间（ISO 字符串） */
  createdAt: string;
}

// ============ 风格推荐 ============

/**
 * 风格推荐请求
 */
export interface StyleRecommendationRequest {
  /** 文档类型（可选，用于过滤） */
  documentType?: DocumentTypeValue;
  /** 文档分类（可选） */
  category?: TemplateCategoryValue;
  /** 使用场景（可选） */
  scenario?: string;
  /** 主题（可选） */
  topic?: string;
  /** 返回前 K 个推荐（默认 3） */
  topK?: number;
}

/**
 * 风格推荐结果
 */
export interface StyleRecommendation {
  /** 推荐的文档风格 */
  style: DocumentStyle;
  /** 匹配分数 [0,1] */
  score: number;
  /** 推荐理由（人类可读，用于可解释性） */
  reasons: string[];
}

// ============ 风格相似度 ============

/**
 * 风格相似度分量
 * 用于可解释的相似度分解
 */
export interface StyleSimilarityBreakdown {
  /** 视觉相似度 [0,1] */
  visual: number;
  /** 文本相似度 [0,1] */
  textual: number;
  /** 内容相似度 [0,1] */
  content: number;
  /** 综合相似度 [0,1] */
  overall: number;
}

// ============ 风格学习配置 ============

/**
 * 风格学习器配置
 */
export interface StyleLearnerConfig {
  /** 满意阈值：评分 ≥ 此值才纳入学习（默认 4） */
  satisfactionThreshold?: number;
  /** 最小模板数：达到此数才计算置信度（默认 3） */
  minTemplatesForConfidence?: number;
  /** 最大置信度（默认 0.95） */
  maxConfidence?: number;
  /** 置信度增长因子（默认 0.1） */
  confidenceGrowthFactor?: number;
  /** 风格演变记录上限（默认 100） */
  evolutionHistoryLimit?: number;
  /** 风格变化幅度阈值：超过此值才记录演变事件（默认 0.15） */
  changeMagnitudeThreshold?: number;
}

/**
 * 风格学习器配置的完整形式（带默认值）
 */
export type RequiredStyleLearnerConfig = Required<StyleLearnerConfig>;

// ============ 风格分析输入 ============

/**
 * 风格分析输入
 * 从原始文档/PPT/文章中提取的可观察信号
 */
export interface StyleAnalysisInput {
  /** 文档类型 */
  documentType: DocumentTypeValue;
  /** 文档分类（可选，未提供则由分析器推断） */
  category?: TemplateCategoryValue;
  /** 文档纯文本内容 */
  textContent?: string;
  /** 提取到的颜色列表（hex） */
  colors?: string[];
  /** 提取到的字体列表 */
  fonts?: string[];
  /** 字号列表（pt） */
  fontSizes?: number[];
  /** 页面/幻灯片数量 */
  pageCount?: number;
  /** 平均每页字数 */
  avgWordsPerPage?: number;
  /** 图片数量 */
  imageCount?: number;
  /** 图表数量 */
  chartCount?: number;
  /** 是否多栏布局 */
  multiColumn?: boolean;
  /** 是否深色主题 */
  isDarkTheme?: boolean;
  /** 检测到的引用风格 */
  citationStyle?: string;
  /** 检测到的主题标签 */
  topics?: string[];
}

/**
 * 默认风格学习配置
 */
export const DEFAULT_STYLE_LEARNER_CONFIG: RequiredStyleLearnerConfig = {
  satisfactionThreshold: 4,
  minTemplatesForConfidence: 3,
  maxConfidence: 0.95,
  confidenceGrowthFactor: 0.1,
  evolutionHistoryLimit: 100,
  changeMagnitudeThreshold: 0.15,
};