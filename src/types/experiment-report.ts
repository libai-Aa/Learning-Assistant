/**
 * 实验报告类型定义
 *
 * @description 借鉴物理实验报告模板，为 Research 区每个想法/问题探索
 *   单独配置实验报告，记录贯穿始终的探索过程、试错经验与证伪证据。
 *
 * 设计原则：
 * - 不是日记：记录要有思考深度，记录想法的演变、试错的教训
 * - 贯穿始终：从探索开始到结束全程记录
 * - 支持证伪：明确记录支持/反对假设的证据
 * - 知识积累：探索完成后沉淀为知识
 * - 可追溯：每个结论都能追溯到具体的探索过程
 *
 * @module src/types/experiment-report
 */

import type { Methodology } from './research';

// ============ 探索状态 ============

/** 探索状态：贯穿探索生命周期 */
export type ExplorationStatus =
  | 'in_progress' // 进行中
  | 'completed' // 已完成（假设得到验证）
  | 'shelved' // 已搁置（暂时停止，未来可能重启）
  | 'falsified' // 已证伪（假设被反驳）
  | 'inconclusive'; // 无法定论

/** 探索状态名称映射 */
export const ExplorationStatusNames: Record<ExplorationStatus, string> = {
  in_progress: '进行中',
  completed: '已完成',
  shelved: '已搁置',
  falsified: '已证伪',
  inconclusive: '无法定论',
};

/** 探索状态颜色（用于UI展示） */
export const ExplorationStatusColors: Record<ExplorationStatus, string> = {
  in_progress: '#1890ff',
  completed: '#52c41a',
  shelved: '#8c8c8c',
  falsified: '#f5222d',
  inconclusive: '#faad14',
};

// ============ 探索记录条目类型 ============

/**
 * 探索记录条目类型
 *
 * 不同类型的记录对应探索过程中不同的认知活动，
 * 借鉴"实验内容+数据记录"部分，但更强调思考深度。
 */
export type ExplorationEntryType =
  | 'idea' // 想法：新冒出的思路、灵感
  | 'attempt' // 尝试：具体执行了某个验证方法
  | 'discovery' // 发现：意外得到的洞察或证据
  | 'setback' // 挫折：方法失败、走不通的路
  | 'breakthrough' // 突破：关键性进展
  | 'reflection' // 反思：对前述记录的回顾与重新理解
  | 'pivot' // 转向：思路的根本性转变
  | 'evidence_support' // 证据：支持假设
  | 'evidence_against' // 证据：反对假设（证伪证据）
  | 'question' // 新问题：探索中冒出的新疑问
  | 'note'; // 备注：辅助性记录

/** 探索记录类型名称映射 */
export const ExplorationEntryTypeNames: Record<ExplorationEntryType, string> = {
  idea: '想法',
  attempt: '尝试',
  discovery: '发现',
  setback: '挫折',
  breakthrough: '突破',
  reflection: '反思',
  pivot: '转向',
  evidence_support: '支持证据',
  evidence_against: '反对证据',
  question: '新问题',
  note: '备注',
};

/** 探索记录类型对应的视觉样式（emoji + 颜色） */
export const ExplorationEntryTypeStyles: Record<
  ExplorationEntryType,
  { icon: string; color: string; bg: string }
> = {
  idea: { icon: '💡', color: '#722ed1', bg: '#f9f0ff' },
  attempt: { icon: '🔧', color: '#1890ff', bg: '#e6f7ff' },
  discovery: { icon: '🔍', color: '#13c2c2', bg: '#e6fffb' },
  setback: { icon: '⚠️', color: '#fa8c16', bg: '#fff7e6' },
  breakthrough: { icon: '🎯', color: '#52c41a', bg: '#f6ffed' },
  reflection: { icon: '🤔', color: '#595959', bg: '#f5f5f5' },
  pivot: { icon: '🔄', color: '#eb2f96', bg: '#fff0f6' },
  evidence_support: { icon: '✅', color: '#52c41a', bg: '#f6ffed' },
  evidence_against: { icon: '❌', color: '#f5222d', bg: '#fff1f0' },
  question: { icon: '❓', color: '#faad14', bg: '#fffbe6' },
  note: { icon: '📝', color: '#8c8c8c', bg: '#fafafa' },
};

// ============ 探索记录条目 ============

/** 探索记录条目：探索过程的核心记录单位 */
export interface ExplorationEntry {
  /** 唯一标识符 */
  id: string;
  /** 所属实验报告ID */
  reportId: string;
  /** 记录类型 */
  type: ExplorationEntryType;
  /** 标题（简短概括，便于在时间线扫描） */
  title: string;
  /** 内容：详细记录这一步的想法、做法、结果 */
  content: string;
  /** 反思：对这一步的元认知（不是必填，但有则体现思考深度） */
  reflection?: string;
  /** 关联的先前条目ID（用于建立"思路转变"的追溯链） */
  relatedEntryId?: string;
  /** 关联的证据ID（当 type 为 evidence_* 时填写） */
  evidenceId?: string;
  /** 使用的工具（如 AMiner、网页搜索、本地知识库） */
  tools?: string[];
  /** 耗时（分钟） */
  durationMinutes?: number;
  /** 标签 */
  tags?: string[];
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/** 创建探索记录条目输入 */
export interface CreateExplorationEntryInput {
  type: ExplorationEntryType;
  title: string;
  content: string;
  reflection?: string;
  relatedEntryId?: string;
  evidenceId?: string;
  tools?: string[];
  durationMinutes?: number;
  tags?: string[];
}

/** 更新探索记录条目输入 */
export interface UpdateExplorationEntryInput {
  type?: ExplorationEntryType;
  title?: string;
  content?: string;
  reflection?: string;
  relatedEntryId?: string;
  evidenceId?: string;
  tools?: string[];
  durationMinutes?: number;
  tags?: string[];
}

// ============ 证据条目 ============

/** 证据类型 */
export type EvidenceType =
  | 'data' // 数据：可量化的测量结果
  | 'citation' // 引用：文献中的论断
  | 'observation' // 观察：定性观察结果
  | 'experiment' // 实验：自己执行的验证
  | 'counter_example' // 反例：直接证伪的例子
  | 'logical_argument'; // 逻辑论证

/** 证据条目：发现与数据部分的核心单元 */
export interface EvidenceItem {
  /** 唯一标识符 */
  id: string;
  /** 所属报告ID */
  reportId: string;
  /** 证据类型 */
  type: EvidenceType;
  /** 立场：支持还是反对原假设 */
  stance: 'support' | 'against' | 'neutral';
  /** 简短描述 */
  description: string;
  /** 详细内容 */
  content: string;
  /** 来源（URL、文献、观察场景等） */
  source?: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 关联的探索记录条目ID */
  relatedEntryId?: string;
  /** 创建时间 */
  createdAt: string;
}

// ============ 探索报告各部分 ============

/**
 * 探索基本信息（对应"封面信息"）
 */
export interface ExplorationBasicInfo {
  /** 探索主题（想法/问题） */
  topic: string;
  /** 探索者（用户标识） */
  explorer: string;
  /** 探索状态 */
  status: ExplorationStatus;
  /** 开始时间 */
  startedAt: string;
  /** 最后更新时间 */
  lastUpdatedAt: string;
  /** 完成时间（探索结束时填） */
  completedAt?: string;
  /** 关联的想法ID */
  ideaId?: string;
  /** 关联的研究问题ID */
  researchQuestionId?: string;
  /** 关联的知识条目ID（探索沉淀为知识时填） */
  knowledgeId?: string;
  /** 标签 */
  tags: string[];
}

/**
 * 探索动机与目标（对应"实验目的"）
 */
export interface ExplorationMotivation {
  /** 为什么想要探索这个想法？ */
  why: string;
  /** 希望验证什么假设？ */
  hypothesis: string;
  /** 期望达到什么目标？ */
  expectedGoal: string;
  /** 想法的来源（从哪个对话/链接/想法产生） */
  origin?: string;
  /** 来源链接 */
  originUrl?: string;
}

/**
 * 理论基础与假设（对应"实验原理"）
 */
export interface ExplorationTheory {
  /** 初始假设是什么？ */
  initialAssumption: string;
  /** 基于什么知识/理论？ */
  basedOn: string;
  /** 预期的可能结果有哪些？ */
  expectedOutcomes: string[];
  /** 使用的研究方法论 */
  methodology: Methodology;
  /** 方法论选择理由 */
  methodologyReason?: string;
}

/**
 * 探索工具与资源（对应"实验仪器"）
 */
export interface ExplorationTools {
  /** 使用了哪些工具？ */
  tools: string[];
  /** 参考了哪些文献？ */
  references: Array<{
    title: string;
    url?: string;
    note?: string;
  }>;
  /** 用到了哪些已有知识？ */
  priorKnowledge: string[];
}

/**
 * 发现与数据（对应"数据处理"）
 */
export interface ExplorationFindings {
  /** 收集到的证据 */
  evidences: EvidenceItem[];
  /** 数据分析结果 */
  analysis: string;
  /** 支持假设的证据摘要 */
  supportingSummary: string;
  /** 反对假设的证据摘要（证伪证据） */
  againstSummary: string;
  /** 矛盾点和冲突 */
  contradictions: string[];
}

/**
 * 结论与反思（对应"结果陈述+总结"）
 */
export interface ExplorationConclusion {
  /** 探索结论 */
  result: 'confirmed' | 'falsified' | 'partial' | 'inconclusive';
  /** 结论详述 */
  conclusion: string;
  /** 关键洞察 */
  keyInsights: string[];
  /** 经验教训 */
  lessonsLearned: string[];
  /** 未解决的问题 */
  unresolvedQuestions: string[];
  /** 新产生的想法/问题 */
  newIdeas: string[];
  /** 后续探索方向 */
  futureDirections: string[];
}

/**
 * 思考题与延伸
 */
export interface ExplorationReflection {
  /** 这个探索引发的新问题 */
  newQuestions: string[];
  /** 可以推广到其他领域吗？ */
  generalizations: string[];
  /** 与已有知识的连接 */
  connections: string[];
}

// ============ 实验报告 ============

/**
 * 实验报告：贯穿一个想法/问题探索始终的完整记录
 *
 * 借鉴物理实验报告模板的八条结构，但改造为研究探索语境：
 * 1. 基本信息（封面）
 * 2. 动机与目标（实验目的）
 * 3. 理论基础与假设（实验原理）
 * 4. 工具与资源（实验仪器）
 * 5. 探索过程记录（实验内容+数据记录）⭐核心
 * 6. 发现与数据（数据处理）
 * 7. 结论与反思（结果陈述+总结）
 * 8. 思考题与延伸
 */
export interface ExperimentReport {
  /** 唯一标识符 */
  id: string;
  /** 基本信息 */
  basicInfo: ExplorationBasicInfo;
  /** 探索动机与目标 */
  motivation: ExplorationMotivation;
  /** 理论基础与假设 */
  theory: ExplorationTheory;
  /** 探索工具与资源 */
  tools: ExplorationTools;
  /** 探索过程记录（按时间排序的条目列表） */
  entries: ExplorationEntry[];
  /** 发现与数据 */
  findings: ExplorationFindings;
  /** 结论与反思 */
  conclusion: ExplorationConclusion;
  /** 思考题与延伸 */
  reflection: ExplorationReflection;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============ 创建/更新输入 ============

/** 创建实验报告输入 */
export interface CreateExperimentReportInput {
  topic: string;
  explorer?: string;
  ideaId?: string;
  researchQuestionId?: string;
  tags?: string[];
  motivation?: Partial<ExplorationMotivation>;
  theory?: Partial<ExplorationTheory>;
}

/** 更新报告各部分输入 */
export interface UpdateExperimentReportInput {
  basicInfo?: Partial<ExplorationBasicInfo>;
  motivation?: Partial<ExplorationMotivation>;
  theory?: Partial<ExplorationTheory>;
  tools?: Partial<ExplorationTools>;
  findings?: Partial<ExplorationFindings>;
  conclusion?: Partial<ExplorationConclusion>;
  reflection?: Partial<ExplorationReflection>;
}

// ============ 过滤与统计 ============

/** 报告过滤条件 */
export interface ExperimentReportFilter {
  status?: ExplorationStatus;
  ideaId?: string;
  researchQuestionId?: string;
  knowledgeId?: string;
  tag?: string;
  explorer?: string;
  startedFrom?: string;
  startedTo?: string;
}

/** 条目过滤条件 */
export interface ExplorationEntryFilter {
  type?: ExplorationEntryType;
  types?: ExplorationEntryType[];
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
}

/** 报告统计 */
export interface ExperimentReportStats {
  total: number;
  byStatus: Record<ExplorationStatus, number>;
  totalEntries: number;
  totalEvidences: number;
  averageEntriesPerReport: number;
}

/** 条目统计 */
export interface ExplorationEntryStats {
  total: number;
  byType: Record<ExplorationEntryType, number>;
  totalDurationMinutes: number;
  supportEvidenceCount: number;
  againstEvidenceCount: number;
}