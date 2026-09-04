/**
 * 想法类型定义
 * 定义想法记录、实践状态、优先级相关的数据结构
 */

import type { ImportanceLevelValue, UrgencyLevelValue } from './knowledge';

// 重新导出重要性/紧急度等级类型，供外部模块使用
export type { ImportanceLevelValue, UrgencyLevelValue } from './knowledge';

/**
 * 实践状态枚举
 */
export const PracticeStatus = {
  NEW: 'new',
  PENDING: 'pending',
  ACTIVE: 'active',
  DONE: 'done',
  FALSIFIED: 'falsified'
} as const;

export type PracticeStatusValue = typeof PracticeStatus[keyof typeof PracticeStatus];

/**
 * 想法来源枚举
 */
export const IdeaSource = {
  READING: 'reading',
  ANNOTATION: 'annotation',
  RESEARCH: 'research',
  CHAT: 'chat',
  MANUAL: 'manual'
} as const;

export type IdeaSourceValue = typeof IdeaSource[keyof typeof IdeaSource];

/**
 * 想法数据接口
 */
export interface Idea {
  /** 唯一标识符 */
  id: string;
  /** 想法内容 */
  content: string;
  /** 实践状态 */
  practiceStatus: PracticeStatusValue;
  /** 来源类型 */
  source: IdeaSourceValue;
  /** 关联的知识条目ID (可选) */
  knowledgeId?: string;
  /** 关联的标注ID (可选) */
  annotationId?: string;
  /** 关联的研究问题ID (可选) */
  researchQuestionId?: string;
  /** 重要性等级 */
  importance: ImportanceLevelValue;
  /** 紧急度等级 */
  urgency: UrgencyLevelValue;
  /** 优先级分数 (用于排序) */
  priorityScore: number;
  /** 实践成果描述 */
  outcome?: string;
  /** 标签 */
  tags: string[];
  /** 创建者 */
  createdBy: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 状态变更时间 */
  statusChangedAt: string;
  /** 提醒时间 (可选) */
  reminderAt?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 想法创建请求
 */
export interface CreateIdeaRequest {
  content: string;
  source: IdeaSourceValue;
  knowledgeId?: string;
  annotationId?: string;
  researchQuestionId?: string;
  tags?: string[];
}

/**
 * 想法更新请求
 */
export interface UpdateIdeaRequest {
  content?: string;
  practiceStatus?: PracticeStatusValue;
  importance?: ImportanceLevelValue;
  urgency?: UrgencyLevelValue;
  outcome?: string;
  tags?: string[];
  reminderAt?: string;
}

/**
 * 想法过滤条件
 */
export interface IdeaFilter {
  practiceStatus?: PracticeStatusValue;
  source?: IdeaSourceValue;
  knowledgeId?: string;
  tag?: string;
  importance?: ImportanceLevelValue;
  urgency?: UrgencyLevelValue;
  createdAtFrom?: string;
  createdAtTo?: string;
  hasReminder?: boolean;
}

/**
 * 想法排序选项
 */
export interface IdeaSortOptions {
  sortBy: 'createdAt' | 'updatedAt' | 'priorityScore' | 'statusChangedAt';
  sortOrder: 'asc' | 'desc';
}

/**
 * 想法统计信息
 */
export interface IdeaStats {
  total: number;
  byStatus: Record<PracticeStatusValue, number>;
  bySource: Record<IdeaSourceValue, number>;
  byImportance: Record<ImportanceLevelValue, number>;
  byUrgency: Record<UrgencyLevelValue, number>;
}

/**
 * 实践状态转换
 */
export interface StatusTransition {
  from: PracticeStatusValue;
  to: PracticeStatusValue;
  timestamp: string;
  reason?: string;
}

/**
 * 想法分析接口
 */
export interface IdeaAnalysis {
  practiceStatus: PracticeStatusValue;
  confidence: number;
  keywords: string[];
  domain?: string;
  suggestedTags: string[];
  estimatedPriority: {
    importance: ImportanceLevelValue;
    urgency: UrgencyLevelValue;
  };
}

/**
 * 优先级计算结果
 */
export interface PriorityResult {
  importance: ImportanceLevelValue;
  urgency: UrgencyLevelValue;
  score: number;
  factors: {
    contentScore: number;
    behaviorScore: number;
    timeDecay: number;
  };
}