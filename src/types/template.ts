/**
 * 文档模板类型定义
 *
 * @description 定义"更懂你的WPS"模板管理系统的核心数据结构。
 *   模板代表用户自己觉得满意的文档/PPT，用于积累品位偏好、
 *   培养懂用户的智能体。所有字段均围绕"用户满意导向"设计：
 *   - 风格特征 (styleFeatures)：自动分析模板的视觉与文本风格
 *   - 使用场景 (useCases / suitableFor)：用于场景匹配推荐
 *   - 使用反馈 (usageCount / userRating)：用于持续学习用户品位
 *
 * @module src/types/template
 */

/**
 * 模板分类枚举
 * 涵盖学术、商务、技术、创意、报告、演示、文档、自定义等典型场景
 */
export const TemplateCategory = {
  ACADEMIC: 'academic',          // 学术
  BUSINESS: 'business',          // 商务
  TECHNICAL: 'technical',        // 技术
  CREATIVE: 'creative',          // 创意
  REPORT: 'report',              // 报告
  PRESENTATION: 'presentation',  // 演示
  DOCUMENT: 'document',          // 文档
  CUSTOM: 'custom',              // 自定义
} as const;

export type TemplateCategoryValue =
  typeof TemplateCategory[keyof typeof TemplateCategory];

/**
 * 模板分类的中文显示名（用于 UI 渲染）
 */
export const TemplateCategoryNames: Record<TemplateCategoryValue, string> = {
  academic: '学术',
  business: '商务',
  technical: '技术',
  creative: '创意',
  report: '报告',
  presentation: '演示',
  document: '文档',
  custom: '自定义',
};

/**
 * 文档类型枚举（对应 WPS 支持的格式）
 */
export const DocumentType = {
  PPT: 'ppt',
  WORD: 'word',
  PDF: 'pdf',
  EXCEL: 'excel',
} as const;

export type DocumentTypeValue = typeof DocumentType[keyof typeof DocumentType];

/**
 * 模板来源枚举
 * - user_upload: 用户主动上传的满意文档
 * - generated: 由大模型生成、用户认可后保存
 * - imported: 从外部模板库导入
 */
export const TemplateSource = {
  USER_UPLOAD: 'user_upload',
  GENERATED: 'generated',
  IMPORTED: 'imported',
} as const;

export type TemplateSourceValue =
  typeof TemplateSource[keyof typeof TemplateSource];

/**
 * 视觉密度枚举（描述模板的信息密度）
 */
export const VisualDensity = {
  SPARSE: 'sparse',    // 稀疏：留白多、信息少
  MEDIUM: 'medium',    // 中等：常规密度
  DENSE: 'dense',      // 密集：信息量大、紧凑
} as const;

export type VisualDensityValue =
  typeof VisualDensity[keyof typeof VisualDensity];

/**
 * 风格特征
 * 自动从模板内容中分析得到，用于相似推荐与品位建模
 */
export interface TemplateStyleFeatures {
  /** 配色方案（主色 hex 列表，如 ['#1a56db', '#ffffff']） */
  colorScheme?: string[];
  /** 字体偏好（如 ['思源黑体', 'Times New Roman']） */
  fontFamily?: string[];
  /** 布局风格（如 'grid' / 'flow' / 'sidebar' / 'cover-center'） */
  layoutStyle?: string;
  /** 语气风格（如 'formal' / 'casual' / 'academic' / 'persuasive'） */
  toneStyle?: string;
  /** 结构模式（如 'problem-solution' / 'chronological' / 'pyramid'） */
  structurePattern?: string;
  /** 视觉密度 */
  visualDensity?: VisualDensityValue;
}

/**
 * 文档模板核心数据结构
 */
export interface DocumentTemplate {
  /** 唯一标识符 */
  id: string;
  /** 模板名称（用户可读） */
  name: string;
  /** 文档类型 */
  type: DocumentTypeValue;
  /** 模板分类 */
  category: TemplateCategoryValue;
  /** 用户自定义标签 */
  tags: string[];
  /** 模板文件存储路径 */
  filePath: string;
  /** 缩略图路径（用于预览） */
  thumbnailPath?: string;

  /** 风格特征（自动分析 + 用户可修正） */
  styleFeatures: TemplateStyleFeatures;

  /** 适用场景（如 ['季度汇报', '产品评审']） */
  useCases: string[];
  /** 适合的主题类型（如 ['数据分析', '市场调研']） */
  suitableFor: string[];

  /** 创建时间（ISO 字符串，便于持久化） */
  createdAt: string;
  /** 更新时间（ISO 字符串） */
  updatedAt: string;
  /** 使用次数（每次基于该模板生成新文档时 +1） */
  usageCount: number;
  /** 用户评分 1-5（可选，未评分为 undefined） */
  userRating?: number;
  /** 用户备注（可选） */
  notes?: string;

  /** 来源 */
  source: TemplateSourceValue;
  /** 原始文件路径（保留原文件位置，便于追溯） */
  originalPath?: string;
}

/**
 * 创建模板请求
 * 仅包含创建时必填或可选字段，由管理器自动补全 id/时间戳/usageCount 等
 */
export interface CreateTemplateRequest {
  name: string;
  type: DocumentTypeValue;
  category: TemplateCategoryValue;
  filePath: string;
  thumbnailPath?: string;
  tags?: string[];
  styleFeatures?: TemplateStyleFeatures;
  useCases?: string[];
  suitableFor?: string[];
  notes?: string;
  source?: TemplateSourceValue;
  originalPath?: string;
}

/**
 * 更新模板请求
 * 所有字段可选，仅传递需要变更的字段
 */
export interface UpdateTemplateRequest {
  name?: string;
  category?: TemplateCategoryValue;
  tags?: string[];
  filePath?: string;
  thumbnailPath?: string;
  styleFeatures?: TemplateStyleFeatures;
  useCases?: string[];
  suitableFor?: string[];
  notes?: string;
  userRating?: number;
}

/**
 * 模板过滤条件
 * 全部字段可选，组合使用
 */
export interface TemplateFilter {
  /** 按分类过滤 */
  category?: TemplateCategoryValue;
  /** 按文档类型过滤 */
  type?: DocumentTypeValue;
  /** 按标签过滤（包含该标签即命中） */
  tag?: string;
  /** 按使用场景过滤 */
  useCase?: string;
  /** 按适合主题过滤 */
  suitableFor?: string;
  /** 按来源过滤 */
  source?: TemplateSourceValue;
  /** 仅返回评分 >= 该值的模板 */
  minRating?: number;
  /** 仅返回使用次数 >= 该值的模板 */
  minUsageCount?: number;
  /** 创建时间下界（ISO 字符串） */
  createdAtFrom?: string;
  /** 创建时间上界（ISO 字符串） */
  createdAtTo?: string;
}

/**
 * 模板排序选项
 */
export interface TemplateSortOptions {
  sortBy:
    | 'createdAt'
    | 'updatedAt'
    | 'usageCount'
    | 'userRating'
    | 'name';
  sortOrder: 'asc' | 'desc';
}

/**
 * 模板统计信息
 */
export interface TemplateStats {
  /** 总数 */
  total: number;
  /** 按分类统计 */
  byCategory: Record<TemplateCategoryValue, number>;
  /** 按文档类型统计 */
  byType: Record<DocumentTypeValue, number>;
  /** 按来源统计 */
  bySource: Record<TemplateSourceValue, number>;
  /** 平均评分（无评分时为 0） */
  averageRating: number;
  /** 总使用次数 */
  totalUsageCount: number;
  /** 所有标签出现频次（按标签名聚合） */
  tagFrequency: Record<string, number>;
}

/**
 * 相似模板推荐结果
 */
export interface TemplateRecommendation {
  /** 推荐的模板 */
  template: DocumentTemplate;
  /** 相似度分数 [0, 1]，越高越相似 */
  score: number;
  /** 命中的相似因素（用于解释推荐理由） */
  reasons: string[];
}

/**
 * 风格特征提取输入
 * 从原始文档中提取的可观察信息，由分析器消费
 */
export interface StyleExtractionInput {
  /** 文档类型 */
  type: DocumentTypeValue;
  /** 文档纯文本内容（用于推断语气、结构） */
  textContent?: string;
  /** 提取到的颜色列表（hex） */
  colors?: string[];
  /** 提取到的字体列表 */
  fonts?: string[];
  /** 页面/幻灯片数量 */
  pageCount?: number;
  /** 平均每页字数 */
  avgWordsPerPage?: number;
}

/**
 * 风格特征提取结果
 */
export interface StyleExtractionResult {
  styleFeatures: TemplateStyleFeatures;
  /** 推断的适用场景（基于内容启发式） */
  inferredUseCases: string[];
  /** 推断的适合主题 */
  inferredSuitableFor: string[];
  /** 推断的分类（若用户未指定） */
  inferredCategory?: TemplateCategoryValue;
}