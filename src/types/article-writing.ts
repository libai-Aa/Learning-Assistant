/**
 * 文章写作辅助系统类型定义
 *
 * @description "更懂你的WPS"之文章写作辅助核心数据结构。
 *   本系统通过"模板 + 偏好 + 知识库"三件套，让 AI 像一个懂用户品位的助理，
 *   自动产出符合用户习惯的文章，并最终调用本机 WPS 完成可编辑的制作。
 *
 *   核心抽象：
 *   - ArticleWritingRequest：用户需求（主题/类型/目的/受众/字数…）
 *   - ArticleOutline：文章大纲（含每章节要点、估计字数、引用素材）
 *   - ArticleSection：章节（标题/级别/要点/正文/引用）
 *   - ArticleWritingResult：生成结果（大纲 + 全文 + WPS 文档句柄）
 *   - ArticleFeedback：用户反馈（用于迭代优化）
 *
 *   设计原则：
 *   1. 模板优先 —— 优先复用用户满意的模板作为基底
 *   2. 风格一致 —— 应用学习到的风格画像，保证品位统一
 *   3. 内容充实 —— 从知识库检索真实素材，不做空洞填充
 *   4. 结构清晰 —— 大纲可编辑，用户掌控文章结构
 *   5. 可迭代     —— 用户反馈驱动重新生成，逐步逼近满意
 *   6. WPS 原生  —— 最终通过 WPS 完成制作，保证可编辑性
 *
 * @module src/types/article-writing
 */

import type { UserStyleProfile } from './style';
import type { DocumentTemplate, TemplateCategoryValue } from './template';

// ============ 文章类型 ============

/**
 * 文章类型枚举
 * 不同类型对应不同结构骨架与语气风格
 */
export const ArticleType = {
  ACADEMIC: 'academic',      // 学术论文
  TECHNICAL: 'technical',    // 技术文档
  BUSINESS: 'business',      // 商务报告
  ESSAY: 'essay',            // 随笔散文
  NEWS: 'news',              // 新闻稿
  TUTORIAL: 'tutorial',      // 教程
  REVIEW: 'review',          // 评论
  CUSTOM: 'custom',          // 自定义
} as const;

export type ArticleTypeValue = typeof ArticleType[keyof typeof ArticleType];

/**
 * 文章类型的中文显示名
 */
export const ArticleTypeNames: Record<ArticleTypeValue, string> = {
  academic: '学术论文',
  technical: '技术文档',
  business: '商务报告',
  essay: '随笔散文',
  news: '新闻稿',
  tutorial: '教程',
  review: '评论',
  custom: '自定义',
};

/**
 * 文章类型 → 默认章节骨架
 * 骨架用章节标题序列表达，生成器据此填充内容
 * 每个条目：[级别, 标题]
 */
export const ARTICLE_TYPE_SKELETON: Record<ArticleTypeValue, Array<[number, string]>> = {
  academic: [
    [1, '引言'],
    [1, '相关工作'],
    [1, '方法'],
    [1, '实验'],
    [1, '结果与讨论'],
    [1, '结论'],
    [1, '参考文献'],
  ],
  technical: [
    [1, '概述'],
    [1, '背景'],
    [1, '架构设计'],
    [1, '实现细节'],
    [1, '使用示例'],
    [1, '常见问题'],
  ],
  business: [
    [1, '执行摘要'],
    [1, '背景与目标'],
    [1, '现状分析'],
    [1, '方案与举措'],
    [1, '预期收益'],
    [1, '风险与应对'],
    [1, '下一步计划'],
  ],
  essay: [
    [1, '开篇'],
    [1, '所思'],
    [1, '所感'],
    [1, '收束'],
  ],
  news: [
    [1, '导语'],
    [1, '事件经过'],
    [1, '相关背景'],
    [1, '各方声音'],
    [1, '影响与展望'],
  ],
  tutorial: [
    [1, '简介'],
    [1, '准备工作'],
    [1, '基础步骤'],
    [1, '进阶用法'],
    [1, '小结'],
  ],
  review: [
    [1, '总体印象'],
    [1, '亮点'],
    [1, '不足'],
    [1, '建议'],
    [1, '总结'],
  ],
  custom: [
    [1, '引言'],
    [1, '正文'],
    [1, '结论'],
  ],
};

/**
 * 文章类型 → 模板分类映射
 * 用于把文章类型映射到模板分类，辅助模板推荐
 */
export const ARTICLE_TYPE_TO_CATEGORY: Record<ArticleTypeValue, TemplateCategoryValue> = {
  academic: 'academic',
  technical: 'technical',
  business: 'business',
  essay: 'creative',
  news: 'document',
  tutorial: 'document',
  review: 'document',
  custom: 'custom',
};

/**
 * 文章类型 → 默认使用场景关键词
 */
export const ARTICLE_TYPE_TO_USE_CASES: Record<ArticleTypeValue, string[]> = {
  academic: ['学术写作', '论文'],
  technical: ['技术文档', '工程文档'],
  business: ['商务报告', '工作汇报'],
  essay: ['随笔', '散文'],
  news: ['新闻稿', '宣传'],
  tutorial: ['培训教学', '操作指南'],
  review: ['评论', '评测'],
  custom: [],
};

// ============ 章节与大纲 ============

/**
 * 文章章节
 * 单个章节的结构化规划与生成结果
 */
export interface ArticleSection {
  /** 章节序号（从 1 开始） */
  index: number;
  /** 章节标题 */
  heading: string;
  /** 标题级别 1-4（1=一级标题，对应 Word Heading1） */
  level: number;
  /** 关键要点（用于驱动正文生成与项目符号列表） */
  keyPoints: string[];
  /** 估计字数 */
  estimatedWords: number;
  /** 生成的内容（生成阶段填充） */
  content?: string;
  /** 引用的知识库内容 ID 列表（用于追溯） */
  references?: string[];
}

/**
 * 文章大纲
 * 整篇文章的结构化规划，是生成器与 WPS 之间的中间产物
 */
export interface ArticleOutline {
  /** 文章主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 章节列表 */
  sections: ArticleSection[];
  /** 估计总字数 */
  estimatedWordCount: number;
  /** 应用的用户风格画像 */
  styleProfile: UserStyleProfile;
  /** 大纲生成时间（ISO 字符串） */
  createdAt: string;
}

// ============ 知识素材 ============

/**
 * 知识库检索到的素材片段
 * 由知识检索器产出
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

// ============ 生成请求与结果 ============

/**
 * 文章写作请求
 * 用户在面板上填写的需求描述
 */
export interface ArticleWritingRequest {
  /** 文章主题 */
  topic: string;
  /** 文章类型 */
  type: ArticleTypeValue;
  /** 写作目的（如 "申请项目资助" / "向客户介绍方案"） */
  purpose?: string;
  /** 目标读者（如 "学术评审" / "客户决策层" / "普通读者"） */
  audience?: string;
  /** 期望字数（不传则按类型默认估算） */
  wordCount?: number;
  /** 指定模板 ID（可选；不传则自动推荐） */
  templateId?: string;
  /** 额外要求（自由文本，会注入到生成提示中） */
  additionalRequirements?: string;
  /** 知识库查询关键词（不传则用 topic 作为查询） */
  knowledgeBaseQuery?: string;
  /** 用户给定的大纲（可选；不传则自动生成） */
  outline?: string[];
  /** 是否调用 WPS 完成最终制作（默认 true） */
  openInWPS?: boolean;
  /** 输出文件路径（不传则使用 WPS 默认新建文档） */
  outputPath?: string;
}

/**
 * 文章写作结果
 */
export interface ArticleWritingResult {
  /** 生成的大纲 */
  outline: ArticleOutline;
  /** 完整文章文本（含标题与正文，已按章节拼接） */
  fullText: string;
  /** 生成的文档路径（若已保存） */
  generatedPath?: string;
  /** WPS 文档 ID（若已调用 WPS 创建） */
  wpsDocumentId?: string;
  /** 应用的用户风格画像 */
  appliedStyle: UserStyleProfile;
  /** 使用的知识库素材 ID 列表 */
  knowledgeUsed: string[];
  /** 实际字数 */
  wordCount: number;
  /** 选用的模板（若基于模板） */
  appliedTemplate: DocumentTemplate | null;
  /** 生成耗时（毫秒） */
  durationMs: number;
  /** 生成时间戳（ISO 字符串） */
  createdAt: string;
}

// ============ 生成进度 ============

/**
 * 生成阶段枚举
 */
export const ArticleGenerationStage = {
  ANALYZING: 'analyzing',                    // 分析需求
  SELECTING_TEMPLATE: 'selecting_template',  // 选择模板
  APPLYING_STYLE: 'applying_style',          // 应用风格
  RETRIEVING_KNOWLEDGE: 'retrieving_knowledge', // 检索知识
  GENERATING_OUTLINE: 'generating_outline',  // 生成大纲
  GENERATING_CONTENT: 'generating_content',  // 生成章节内容
  CONSISTENCY_CHECK: 'consistency_check',    // 风格一致性检查
  CREATING_DOCUMENT: 'creating_document',    // 调用 WPS 创建文档
  COMPLETED: 'completed',                    // 已完成
  FAILED: 'failed',                          // 失败
} as const;

export type ArticleGenerationStageValue =
  typeof ArticleGenerationStage[keyof typeof ArticleGenerationStage];

/**
 * 阶段的中文显示名
 */
export const ArticleGenerationStageNames: Record<ArticleGenerationStageValue, string> = {
  analyzing: '分析需求',
  selecting_template: '选择模板',
  applying_style: '应用风格偏好',
  retrieving_knowledge: '检索知识库',
  generating_outline: '生成大纲',
  generating_content: '逐章节生成内容',
  consistency_check: '风格一致性检查',
  creating_document: '调用 WPS 创建文档',
  completed: '已完成',
  failed: '失败',
};

/**
 * 生成进度事件
 * 通过回调推送给 UI，驱动进度条与状态展示
 */
export interface ArticleGenerationProgress {
  /** 当前阶段 */
  stage: ArticleGenerationStageValue;
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
export type ArticleProgressCallback = (progress: ArticleGenerationProgress) => void;

// ============ 用户反馈 ============

/**
 * 反馈类型
 */
export type ArticleFeedbackType =
  | 'satisfied'          // 满意，确认完成
  | 'adjust_style'       // 调整风格
  | 'adjust_content'     // 调整内容
  | 'adjust_structure'   // 调整结构
  | 'change_template'    // 更换模板
  | 'regenerate';        // 完全重新生成

/**
 * 用户反馈
 * 用于驱动迭代优化
 */
export interface ArticleFeedback {
  /** 反馈类型 */
  type: ArticleFeedbackType;
  /** 自由文本反馈（可选） */
  comment?: string;
  /** 指定要调整的章节索引列表（可选，针对局部调整） */
  sectionIndices?: number[];
  /** 指定新模板 ID（用于 change_template） */
  newTemplateId?: string;
  /** 风格调整提示（用于 adjust_style，如 "更正式一些" / "更口语化"） */
  styleHint?: string;
  /** 评分 1-5（用于满意度的持续学习） */
  rating?: number;
}

// ============ 生成器配置 ============

/**
 * 文章生成器配置
 */
export interface ArticleWriterConfig {
  /** 默认每章节要点上限 */
  maxKeyPointsPerSection: number;
  /** 默认每章节正文字数上限 */
  maxWordsPerSection: number;
  /** 知识库检索返回的最大片段数 */
  maxKnowledgeSnippets: number;
  /** 是否在大纲生成失败时降级为空骨架 */
  fallbackToEmptyOutline: boolean;
  /** 是否在生成完成后自动打开 WPS */
  autoOpenInWPS: boolean;
  /** 默认作者名（写入文档元数据） */
  defaultAuthor?: string;
  /** 默认用户 ID（用于风格画像查询） */
  defaultUserId?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_ARTICLE_WRITER_CONFIG: ArticleWriterConfig = {
  maxKeyPointsPerSection: 6,
  maxWordsPerSection: 800,
  maxKnowledgeSnippets: 10,
  fallbackToEmptyOutline: true,
  autoOpenInWPS: true,
  defaultUserId: 'default_user',
};

// ============ 适配器接口 ============

/**
 * 风格学习器适配接口
 *
 * 为解耦 W3（风格学习系统）的实现细节，文章生成器仅依赖此最小接口。
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
 * UI 层编辑大纲后传给生成器，用于重新生成或直接创建文档
 */
export interface ArticleOutlineEdit {
  /** 修改后的章节列表 */
  sections: ArticleSection[];
  /** 修改后的主标题 */
  title?: string;
  /** 修改后的副标题 */
  subtitle?: string;
}

// ============ 辅助类型 ============

/**
 * 模板匹配上下文
 * 内部使用，把文章需求映射到模板推荐场景
 */
export interface TemplateMatchContext {
  /** 主题 */
  topic: string;
  /** 文章类型 */
  type: ArticleTypeValue;
  /** 写作目的 */
  purpose?: string;
  /** 目标读者 */
  audience?: string;
  /** 期望分类 */
  category?: TemplateCategoryValue;
  /** 期望使用场景关键词 */
  useCases: string[];
  /** 期望适合主题关键词 */
  suitableFor: string[];
}