/**
 * 研究模块类型定义
 * @description 研究型知识管理相关类型定义
 */

// ============ 问题类型 ============

/** 问题类型 */
export type QuestionType = 'conceptual' | 'methodological' | 'applied'

/** 问题类型名称映射 */
export const QuestionTypeNames: Record<QuestionType, string> = {
  conceptual: '概念型',
  methodological: '方法型',
  applied: '应用型'
}

/** 问题类型描述 */
export const QuestionTypeDescriptions: Record<QuestionType, string> = {
  conceptual: '关于概念、定义、原理的问题，如"什么是X"、"X和Y的区别"',
  methodological: '关于方法、技术、流程的问题，如"如何做X"、"X的方法"',
  applied: '关于应用、实践、场景的问题，如"X在Y中的应用"'
}

// ============ 研究状态 ============

/** 研究状态 */
export type ResearchStatus = 
  | 'discovered'   // 已发现
  | 'analyzing'    // 分析中
  | 'researching'  // 研究中
  | 'synthesized'  // 已综合
  | 'verified'     // 已验证
  | 'falsified'    // 已证伪

/** 研究状态名称映射 */
export const ResearchStatusNames: Record<ResearchStatus, string> = {
  discovered: '已发现',
  analyzing: '分析中',
  researching: '研究中',
  synthesized: '已综合',
  verified: '已验证',
  falsified: '已证伪'
}

// ============ 方法论 ============

/** 方法论类型 */
export type Methodology = 
  | 'socratic'         // 苏格拉底提问法
  | 'five-whys'        // 丰田五问
  | 'first-principles' // 第一性原理

/** 方法论名称映射 */
export const MethodologyNames: Record<Methodology, string> = {
  socratic: '苏格拉底提问法',
  'five-whys': '丰田五问法',
  'first-principles': '第一性原理'
}

/** 方法论描述 */
export const MethodologyDescriptions: Record<Methodology, string> = {
  socratic: '通过连续追问揭示问题本质，适合探索性研究',
  'five-whys': '连续追问五次"为什么"，适合根因分析',
  'first-principles': '从基础假设出发进行推导，适合创新性问题'
}

/** 方法论适用问题类型 */
export const MethodologyApplicableTypes: Record<Methodology, QuestionType[]> = {
  socratic: ['conceptual', 'methodological'],
  'five-whys': ['methodological', 'applied'],
  'first-principles': ['conceptual', 'methodological', 'applied']
}

// ============ 研究问题 ============

/** 研究问题 */
export interface ResearchQuestion {
  /** 唯一标识符 */
  id: string
  /** 问题内容 */
  question: string
  /** 问题类型 */
  type: QuestionType
  /** 来源 */
  source: 'conversation' | 'idea' | 'manual'
  /** 来源ID */
  sourceId?: string
  /** 方法论 */
  methodology?: Methodology
  /** 状态 */
  status: ResearchStatus
  /** 价值评分 (1-10) */
  valueScore?: number
  /** 可行性评分 (1-10) */
  feasibilityScore?: number
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
}

/** 创建研究问题输入 */
export interface CreateResearchQuestionInput {
  question: string
  type?: QuestionType
  source: 'conversation' | 'idea' | 'manual'
  sourceId?: string
}

// ============ 方法论结果 ============

/** 方法论步骤 */
export interface MethodologyStep {
  /** 步骤序号 */
  step: number
  /** 问题/假设 */
  question: string
  /** 分析内容 */
  analysis: string
  /** 子步骤 */
  children?: MethodologyStep[]
  /** 置信度 (0-1) */
  confidence?: number
}

/** 方法论结果 */
export interface MethodologyResult {
  /** 问题ID */
  questionId: string
  /** 方法论 */
  methodology: Methodology
  /** 分析步骤 */
  steps: MethodologyStep[]
  /** 结论 */
  conclusion: string
  /** 关键洞察 */
  insights?: string[]
  /** 创建时间 */
  createdAt: string
}

// ============ 证伪记录 ============

/** 证伪结果 */
export type FalsificationResult = 'falsified' | 'supported' | 'inconclusive'

/** 证伪记录 */
export interface FalsificationRecord {
  /** 唯一标识符 */
  id: string
  /** 知识条目ID */
  knowledgeId: string
  /** 原结论 */
  originalConclusion: string
  /** 新证据 */
  newEvidence: string
  /** 证伪结果 */
  result: FalsificationResult
  /** 新结论 */
  newConclusion?: string
  /** 置信度 (0-1) */
  confidence: number
  /** 创建时间 */
  createdAt: string
}

/** 证伪分析结果 */
export interface FalsificationAnalysis {
  /** 原结论关键断言 */
  originalAssertions: string[]
  /** 新发现证据 */
  newEvidences: string[]
  /** 冲突点 */
  conflicts: Array<{
    assertion: string
    evidence: string
    conflictType: 'contradiction' | 'weakening' | 'irrelevant'
  }>
  /** 建议 */
  recommendation: string
}

// ============ 问题发现 ============

/** 发现的问题来源 */
export interface DiscoveredQuestionSource {
  /** 来源类型 */
  type: 'conversation' | 'idea'
  /** 来源ID */
  sourceId: string
  /** 原始内容 */
  rawContent: string
  /** 提取位置 */
  position?: {
    start: number
    end: number
  }
}

/** 问题发现方式 */
export type QuestionDiscoveryType = 'explicit' | 'contradiction' | 'gap'

/** 发现的问题 */
export interface DiscoveredQuestion {
  /** 问题内容 */
  question: string
  /** 问题类型 */
  type: QuestionType
  /** 类型置信度 (0-1) */
  typeConfidence: number
  /** 来源：显式问题时为原始来源对象，矛盾/缺口问题时为发现方式字符串 */
  source: DiscoveredQuestionSource | QuestionDiscoveryType
  /** 价值评分 (1-10) */
  valueScore: number
  /** 价值评估理由 */
  valueReason: string
  /** 推荐方法论 */
  recommendedMethodologies: Methodology[]
}

// ============ AMiner集成 ============

/** AMiner技能类型 */
export type AminerSkill = 
  | 'academic-search'    // aminer-academic-search
  | 'daily-paper'        // aminer-daily-paper
  | 'deep-search'        // aminer-deep-search
  | 'free-academic'      // aminer-free-academic
  | 'citation-faithfulness' // citation-faithfulness
  | 'paper-source-trace' // paper-source-trace
  | 'pdf-citation-verifier' // pdf-citation-verifier

/** AMiner配置 */
export interface AminerConfig {
  /** API Key */
  apiKey: string
  /** 基础URL */
  baseUrl?: string
  /** 超时时间 (ms) */
  timeout?: number
  /** 重试次数 */
  maxRetries?: number
  /** 重试间隔 (ms) */
  retryDelay?: number
}

/** 学术搜索结果 */
export interface AcademicSearchResult {
  /** 论文ID */
  paperId: string
  /** 标题 */
  title: string
  /** 作者 */
  authors: string[]
  /** 摘要 */
  abstract: string
  /** 发表年份 */
  year: number
  /** 引用数 */
  citationCount: number
  /** URL */
  url: string
  /** DOI */
  doi?: string
  /** 期刊/会议 */
  venue?: string
}

/** 引用验证结果 */
export interface CitationVerificationResult {
  /** 引用ID */
  citationId: string
  /** 是否忠实 */
  isFaithful: boolean
  /** 置信度 (0-1) */
  confidence: number
  /** 问题描述 */
  issues?: string[]
  /** 建议 */
  suggestions?: string[]
}

// ============ 夜间维护 ============

/** 维护任务配置 */
export interface MaintenanceConfig {
  /** 是否启用 */
  enabled: boolean
  /** 执行时间 (HH:mm) */
  scheduleTime: string
  /** 时区 */
  timezone?: string
  /** 检查的知识库范围 */
  knowledgeScope?: 'all' | 'recent' | 'specified'
  /** 指定知识ID列表 */
  specifiedKnowledgeIds?: string[]
  /** 最大检查数量 */
  maxCheckCount?: number
}

/** 维护任务报告 */
export interface MaintenanceReport {
  /** 报告ID */
  id: string
  /** 执行时间 */
  executedAt: string
  /** 检查的知识条目数 */
  checkedCount: number
  /** 发现更新的条目数 */
  updatedCount: number
  /** 发现证伪的条目数 */
  falsifiedCount: number
  /** 更新摘要 */
  summaries: Array<{
    knowledgeId: string
    title: string
    updates: string[]
  }>
  /** 错误信息 */
  errors: Array<{
    knowledgeId: string
    error: string
  }>
  /** 耗时 (ms) */
  duration: number
}

// ============ 知识生长 ============

/** 知识生长记录 */
export interface KnowledgeGrowthRecord {
  /** 唯一标识符 */
  id: string
  /** 知识条目ID */
  knowledgeId: string
  /** 生长类型 */
  type: 'update' | 'extension' | 'refinement'
  /** 原内容摘要 */
  originalSummary: string
  /** 新内容摘要 */
  newSummary: string
  /** 变化详情 */
  changes: string[]
  /** 来源 */
  source: string
  /** 创建时间 */
  createdAt: string
}

/** 知识生长统计 */
export interface KnowledgeGrowthStats {
  /** 知识条目ID */
  knowledgeId: string
  /** 总生长次数 */
  totalGrowths: number
  /** 最后生长时间 */
  lastGrowthAt: string
  /** 生长类型分布 */
  growthByType: Record<KnowledgeGrowthRecord['type'], number>
}