/**
 * PPT 制作辅助系统类型定义
 *
 * @description "更懂你的WPS"之PPT制作辅助核心数据结构。
 *   本系统通过"模板 + 偏好 + 知识库"三件套，让 AI 像一个懂用户品位的助理，
 *   自动产出符合用户习惯的 PPT，并最终调用本机 WPS 完成可编辑的制作。
 *
 *   核心抽象：
 *   - PPTGenerationRequest：用户需求（主题/用途/受众/页数…）
 *   - PPTOutline：PPT 大纲（总分总结构，含每页要点与备注）
 *   - PPTTheme：主题（模板 + 配色 + 字体 + 版式）
 *   - PPTGenerationResult：生成结果（大纲 + WPS 文档句柄 + 使用的素材）
 *   - PPTFeedback：用户反馈（用于迭代优化）
 *
 *   设计原则：
 *   1. 模板优先 —— 优先复用用户满意的模板作为基底
 *   2. 风格一致 —— 应用学习到的风格画像，保证品位统一
 *   3. 内容充实 —— 从知识库检索真实素材，不做空洞模板
 *   4. 可迭代     —— 用户反馈驱动重新生成，逐步逼近满意
 *   5. WPS 原生  —— 最终通过 WPS 完成制作，保证可编辑性
 *
 * @module src/types/ppt-generation
 */

import type {
  ColorScheme,
  FontPreference,
  UserStyleProfile,
} from './style';
import type { DocumentTemplate, TemplateCategoryValue } from './template';

// ============ 用途与受众 ============

/**
 * PPT 用途枚举
 * 不同用途对应不同结构模板与语气风格
 */
export const PPTPurpose = {
  REPORT: 'report',          // 工作汇报
  TEACHING: 'teaching',      // 教学课件
  SPEECH: 'speech',          // 演讲分享
  BUSINESS: 'business',      // 商务提案
  ACADEMIC: 'academic',      // 学术报告
  TRAINING: 'training',      // 培训宣讲
  PRODUCT: 'product',        // 产品介绍
  CUSTOM: 'custom',          // 自定义
} as const;

export type PPTPurposeValue = typeof PPTPurpose[keyof typeof PPTPurpose];

/**
 * 用途的中文显示名
 */
export const PPTPurposeNames: Record<PPTPurposeValue, string> = {
  report: '工作汇报',
  teaching: '教学课件',
  speech: '演讲分享',
  business: '商务提案',
  academic: '学术报告',
  training: '培训宣讲',
  product: '产品介绍',
  custom: '自定义',
};

/**
 * 用途 → 默认结构骨架
 * 骨骨架用幻灯片类型序列表达，生成器据此填充内容
 */
export const PPT_PURPOSE_SKELETON: Record<PPTPurposeValue, PPTSlideType[]> = {
  report: ['cover', 'section', 'content', 'content', 'chart', 'content', 'conclusion'],
  teaching: ['cover', 'section', 'content', 'image', 'content', 'content', 'conclusion'],
  speech: ['cover', 'content', 'content', 'image', 'content', 'conclusion'],
  business: ['cover', 'section', 'content', 'chart', 'content', 'chart', 'conclusion'],
  academic: ['cover', 'section', 'content', 'content', 'chart', 'content', 'conclusion'],
  training: ['cover', 'section', 'content', 'image', 'content', 'image', 'conclusion'],
  product: ['cover', 'content', 'image', 'chart', 'content', 'conclusion'],
  custom: ['cover', 'content', 'content', 'conclusion'],
};

// ============ 幻灯片 ============

/**
 * 幻灯片类型
 * - cover：封面
 * - section：章节分隔页
 * - content：文字内容页
 * - image：图片为主页
 * - chart：图表数据页
 * - conclusion：结论/致谢页
 */
export type PPTSlideType =
  | 'cover'
  | 'content'
  | 'section'
  | 'image'
  | 'chart'
  | 'conclusion';

/**
 * 幻灯片大纲
 * 单页 PPT 的结构化规划，由生成器产出，UI 可预览/编辑
 */
export interface PPTSlideOutline {
  /** 页码（从 1 开始） */
  index: number;
  /** 页面标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 幻灯片类型 */
  type: PPTSlideType;
  /** 关键要点（项目符号列表） */
  keyPoints: string[];
  /** 段落正文（可选，用于内容密集页） */
  content?: string;
  /** 演讲备注（演讲者视角的口语化补充） */
  notes?: string;
  /** 建议的视觉元素（如 "产品架构图" / "季度增长曲线"） */
  suggestedVisual?: string;
  /** 来源知识条目 ID 列表（用于追溯内容出处） */
  knowledgeRefs?: string[];
}

// ============ 主题 ============

/**
 * PPT 主题
 * 由所选模板 + 用户风格画像合成
 */
export interface PPTTheme {
  /** 主题名称（便于在 UI 中展示） */
  name: string;
  /** 模板 ID（若基于模板生成） */
  templateId: string;
  /** 配色方案 */
  colorScheme: ColorScheme;
  /** 字体偏好 */
  fontFamily: FontPreference;
  /** 布局风格（如 'grid' / 'flow' / 'sidebar' / 'cover-center'） */
  layoutStyle: string;
  /** 视觉密度（稀疏/中等/密集） */
  visualDensity?: 'sparse' | 'medium' | 'dense';
}

// ============ 大纲 ============

/**
 * PPT 大纲
 * 整份 PPT 的结构化规划，是生成器与 WPS 之间的中间产物
 */
export interface PPTOutline {
  /** PPT 主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 幻灯片大纲列表 */
  slides: PPTSlideOutline[];
  /** 主题 */
  theme: PPTTheme;
  /** 大纲生成时间（ISO 字符串） */
  createdAt: string;
}

// ============ 知识素材 ============

/**
 * 知识库检索到的素材片段
 * 由知识检索器（KnowledgeRetriever）产出
 */
export interface KnowledgeSnippet {
  /** 素材 ID（用于追溯） */
  id: string;
  /** 来源文件/条目名称 */
  source: string;
  /** 片段标题（如有） */
  title?: string;
  /** 片段正文 */
  text: string;
  /** 相关度分数 [0,1] */
  score: number;
  /** 命中关键词（用于高亮与解释） */
  matchedKeywords?: string[];
}

// ============ PPTAgent 反思评估 ============

/**
 * PPTAgent 反思评估结果（借鉴 PPTEval 三维框架）
 *
 * 三个维度（每项 0-100）：
 * - content：内容完整性、准确性、针对性、数据支撑
 * - design：视觉吸引力、排版专业、配色协调、留白合理
 * - coherence：逻辑流畅、结构清晰、过渡自然、详略得当
 *
 * total 为三维均分（0-100），suggestions 为改进建议列表
 */
export interface PPTEvaluation {
  /** 内容维度得分（0-100） */
  content: number;
  /** 设计维度得分（0-100） */
  design: number;
  /** 连贯性维度得分（0-100） */
  coherence: number;
  /** 三维均分总分（0-100） */
  total: number;
  /** 改进建议列表 */
  suggestions: string[];
}

// ============ 生成请求与结果 ============

/**
 * PPT 生成请求
 * 用户在面板上填写的需求描述
 */
export interface PPTGenerationRequest {
  /** PPT 主题 */
  topic: string;
  /** 用途 */
  purpose: PPTPurposeValue;
  /** 受众（如 "团队内部" / "客户决策层" / "学术评审"） */
  audience?: string;
  /** 期望页数（不传则按用途默认骨架生成） */
  slideCount?: number;
  /** 指定模板 ID（可选；不传则自动推荐） */
  templateId?: string;
  /** 额外要求（自由文本，会注入到生成提示中） */
  additionalRequirements?: string;
  /** 知识库查询关键词（不传则用 topic 作为查询） */
  knowledgeBaseQuery?: string;
  /** 是否调用 WPS 完成最终制作（默认 true） */
  openInWPS?: boolean;
  /** 输出文件路径（不传则使用 WPS 默认新建文档） */
  outputPath?: string;
}

/**
 * PPT 生成结果
 */
export interface PPTGenerationResult {
  /** 生成的大纲 */
  outline: PPTOutline;
  /** 生成的 PPT 文件路径（若已保存） */
  generatedPath?: string;
  /** WPS 文档 ID（若已调用 WPS 创建） */
  wpsDocumentId?: string;
  /** 应用的用户风格画像 */
  appliedStyle: UserStyleProfile | null;
  /** 使用的知识库素材 ID 列表 */
  knowledgeUsed: string[];
  /** 选用的模板（若基于模板） */
  appliedTemplate: DocumentTemplate | null;
  /** 生成耗时（毫秒） */
  durationMs: number;
  /** 生成时间戳（ISO 字符串） */
  createdAt: string;
  /** PPTAgent 反思评估结果（生成后自评估，可选） */
  evaluation?: PPTEvaluation;
}

// ============ 生成进度 ============

/**
 * 生成阶段枚举
 */
export const PPTGenerationStage = {
  ANALYZING: 'analyzing',           // 分析需求
  SELECTING_TEMPLATE: 'selecting_template',   // 选择模板
  APPLYING_STYLE: 'applying_style',           // 应用风格
  RETRIEVING_KNOWLEDGE: 'retrieving_knowledge', // 检索知识
  GENERATING_OUTLINE: 'generating_outline',   // 生成大纲
  GENERATING_CONTENT: 'generating_content',   // 生成内容
  CREATING_PPT: 'creating_ppt',               // 调用 WPS 创建
  COMPLETED: 'completed',                     // 已完成
  FAILED: 'failed',                           // 失败
} as const;

export type PPTGenerationStageValue =
  typeof PPTGenerationStage[keyof typeof PPTGenerationStage];

/**
 * 阶段的中文显示名
 */
export const PPTGenerationStageNames: Record<PPTGenerationStageValue, string> = {
  analyzing: '分析需求',
  selecting_template: '选择模板',
  applying_style: '应用风格偏好',
  retrieving_knowledge: '检索知识库',
  generating_outline: '生成大纲',
  generating_content: '生成每页内容',
  creating_ppt: '调用 WPS 制作',
  completed: '已完成',
  failed: '失败',
};

/**
 * 生成进度事件
 * 通过回调推送给 UI，驱动进度条与状态展示
 */
export interface PPTGenerationProgress {
  /** 当前阶段 */
  stage: PPTGenerationStageValue;
  /** 进度百分比 [0, 100] */
  percent: number;
  /** 阶段说明（人类可读） */
  message: string;
  /** 当前阶段产出的中间结果（可选） */
  data?: unknown;
  /** 错误信息（仅 stage=failed 时填充） */
  error?: string;
}

/**
 * 进度回调签名
 */
export type PPTProgressCallback = (progress: PPTGenerationProgress) => void;

// ============ 用户反馈 ============

/**
 * 反馈类型
 */
export type PPTFeedbackType =
  | 'satisfied'         // 满意，确认完成
  | 'adjust_style'      // 调整风格
  | 'adjust_content'    // 调整内容
  | 'adjust_structure'  // 调整结构
  | 'change_template'   // 更换模板
  | 'regenerate';       // 完全重新生成

/**
 * 用户反馈
 * 用于驱动迭代优化
 */
export interface PPTFeedback {
  /** 反馈类型 */
  type: PPTFeedbackType;
  /** 自由文本反馈（可选） */
  comment?: string;
  /** 指定要调整的幻灯片索引列表（可选，针对局部调整） */
  slideIndices?: number[];
  /** 指定新模板 ID（用于 change_template） */
  newTemplateId?: string;
  /** 风格调整提示（用于 adjust_style，如 "更正式一些" / "配色更暖"） */
  styleHint?: string;
  /** 评分 1-5（用于满意度的持续学习） */
  rating?: number;
}

// ============ 生成器配置 ============

/**
 * PPT 生成器配置
 */
export interface PPTGeneratorConfig {
  /** 默认每页要点上限（避免页面过载） */
  maxKeyPointsPerSlide: number;
  /** 默认每页正文字数上限 */
  maxContentCharsPerSlide: number;
  /** 知识库检索返回的最大片段数 */
  maxKnowledgeSnippets: number;
  /** 是否在大纲生成失败时降级为空骨架 */
  fallbackToEmptyOutline: boolean;
  /** 是否在生成完成后自动打开 WPS */
  autoOpenInWPS: boolean;
  /** 默认作者名（写入 PPT 元数据） */
  defaultAuthor?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_PPT_GENERATOR_CONFIG: PPTGeneratorConfig = {
  maxKeyPointsPerSlide: 5,
  maxContentCharsPerSlide: 600,
  maxKnowledgeSnippets: 8,
  fallbackToEmptyOutline: true,
  autoOpenInWPS: true,
};

// ============ 风格学习器适配接口 ============

/**
 * 风格学习器适配接口
 *
 * 为解耦 W3（风格学习系统）的实现细节，PPT 生成器仅依赖此最小接口。
 * W3 的 StyleLearner 实现可通过适配器满足该接口；
 * 若 W3 不可用，生成器将降级为不应用风格画像。
 */
export interface StyleLearnerAdapter {
  /** 获取当前用户的风格画像（无画像时返回 null） */
  getProfile(): UserStyleProfile | null;
  /** 根据场景推荐风格 */
  recommendStyle(request: {
    category?: TemplateCategoryValue;
    scenario?: string;
    topic?: string;
  }): UserStyleProfile | null;
}

// ============ 知识检索器适配接口 ============

/**
 * 知识检索器适配接口
 *
 * 默认实现对接 wiki-store.searchEntries；
 * 也可替换为向量检索等更高级实现
 */
export interface KnowledgeRetriever {
  /** 按关键词检索知识素材 */
  retrieve(query: string, limit?: number): KnowledgeSnippet[];
}

// ============ 大纲编辑 ============

/**
 * 大纲编辑操作
 * UI 层编辑大纲后传给生成器，用于重新生成或直接创建 PPT
 */
export interface PPTOutlineEdit {
  /** 修改后的幻灯片列表 */
  slides: PPTSlideOutline[];
  /** 修改后的主标题 */
  title?: string;
  /** 修改后的副标题 */
  subtitle?: string;
}

// ============ 辅助类型 ============

/**
 * 模板推荐上下文
 * 内部使用，用于把 PPT 需求映射到模板推荐场景
 */
export interface TemplateMatchContext {
  /** 主题 */
  topic: string;
  /** 用途 */
  purpose: PPTPurposeValue;
  /** 受众 */
  audience?: string;
  /** 期望分类 */
  category?: TemplateCategoryValue;
  /** 期望使用场景关键词 */
  useCases: string[];
  /** 期望适合主题关键词 */
  suitableFor: string[];
}

/**
 * 用途 → 模板分类映射
 * 用于把 PPT 用途映射到模板分类，辅助模板推荐
 */
export const PPT_PURPOSE_TO_CATEGORY: Record<PPTPurposeValue, TemplateCategoryValue> = {
  report: 'report',
  teaching: 'document',
  speech: 'presentation',
  business: 'business',
  academic: 'academic',
  training: 'document',
  product: 'business',
  custom: 'custom',
};

/**
 * 用途 → 默认使用场景关键词
 */
export const PPT_PURPOSE_TO_USE_CASES: Record<PPTPurposeValue, string[]> = {
  report: ['工作汇报', '季度总结'],
  teaching: ['培训教学', '课程讲解'],
  speech: ['演讲分享', '主题演讲'],
  business: ['商业计划', '产品规划'],
  academic: ['学术写作', '论文答辩'],
  training: ['培训教学', '技能培训'],
  product: ['产品介绍', '产品规划'],
  custom: [],
};