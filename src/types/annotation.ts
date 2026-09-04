/**
 * 标注类型定义
 * 定义高亮、批注等标注相关的数据结构
 */

/**
 * 标注类型枚举
 */
export const AnnotationType = {
  HIGHLIGHT: 'highlight',
  NOTE: 'note',
  IDEA: 'idea'
} as const;

export type AnnotationTypeValue = typeof AnnotationType[keyof typeof AnnotationType];

/**
 * 高亮颜色选项
 */
export const HighlightColor = {
  YELLOW: 'yellow',
  GREEN: 'green',
  BLUE: 'blue',
  PINK: 'pink',
  PURPLE: 'purple'
} as const;

export type HighlightColorValue = typeof HighlightColor[keyof typeof HighlightColor];

/**
 * 文本位置接口
 */
export interface TextPosition {
  /** 起始偏移量 */
  startOffset: number;
  /** 结束偏移量 */
  endOffset: number;
  /** 起始容器XPath */
  startContainerXPath: string;
  /** 结束容器XPath */
  endContainerXPath: string;
  /** 文本片段 */
  textFragment: string;
}

/**
 * 标注数据接口
 */
export interface Annotation {
  /** 唯一标识符 */
  id: string;
  /** 关联的知识条目ID */
  knowledgeId: string;
  /** 标注类型 */
  type: AnnotationTypeValue;
  /** 标注内容 */
  content: string;
  /** 高亮颜色 (仅高亮类型) */
  highlightColor?: HighlightColorValue;
  /** 文本位置信息 */
  position?: TextPosition;
  /** 创建者 */
  createdBy: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 标签 */
  tags: string[];
}

/**
 * 标注创建请求
 */
export interface CreateAnnotationRequest {
  knowledgeId: string;
  type: AnnotationTypeValue;
  content: string;
  highlightColor?: HighlightColorValue;
  position?: TextPosition;
  tags?: string[];
}

/**
 * 标注更新请求
 */
export interface UpdateAnnotationRequest {
  content?: string;
  highlightColor?: HighlightColorValue;
  tags?: string[];
}

/**
 * 标注过滤条件
 */
export interface AnnotationFilter {
  knowledgeId?: string;
  type?: AnnotationTypeValue;
  highlightColor?: HighlightColorValue;
  tag?: string;
  createdBy?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
}

/**
 * 标注统计信息
 */
export interface AnnotationStats {
  total: number;
  byType: Record<AnnotationTypeValue, number>;
  byColor: Record<HighlightColorValue, number>;
  byKnowledge: Record<string, number>;
}

/**
 * 高亮渲染数据
 */
export interface HighlightRenderData {
  id: string;
  color: HighlightColorValue;
  textFragment: string;
  startOffset: number;
  endOffset: number;
  className: string;
}