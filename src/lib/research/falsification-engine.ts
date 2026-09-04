/**
 * 自我证伪引擎
 * @description 支持知识的自我生长与证伪机制
 * @module src/lib/research/falsification-engine
 */

import type {
  FalsificationRecord,
  FalsificationResult,
  FalsificationAnalysis,
  KnowledgeGrowthRecord,
  KnowledgeGrowthStats
} from '../../types/research'
import { chat, type ChatMessage } from '../api/llm-client'

// ============ 证伪配置 ============

/** 证伪引擎配置 */
export interface FalsificationEngineConfig {
  /** 默认检查周期（天） */
  defaultCheckIntervalDays: number
  /** 置信度阈值 */
  confidenceThreshold: number
  /** 是否启用自动证伪 */
  enableAutoFalsification: boolean
  /** 最大历史记录数 */
  maxHistoryRecords: number
}

/** 默认配置 */
const DEFAULT_CONFIG: FalsificationEngineConfig = {
  defaultCheckIntervalDays: 7,
  confidenceThreshold: 0.8,
  enableAutoFalsification: false,
  maxHistoryRecords: 100
}

// ============ 证伪证据类型 ============

/** 新证据来源 */
export interface EvidenceSource {
  /** 来源类型 */
  type: 'research' | 'literature' | 'experiment' | 'observation' | 'user'
  /** 来源描述 */
  description: string
  /** 来源URL或引用 */
  reference?: string
  /** 发现时间 */
  discoveredAt: string
}

/** 证据项 */
export interface EvidenceItem {
  /** 证据ID */
  id: string
  /** 证据内容 */
  content: string
  /** 来源 */
  source: EvidenceSource
  /** 与结论的相关性 (0-1) */
  relevance: number
  /** 证据强度 (0-1) */
  strength: number
}

// ============ 证伪引擎类 ============

/**
 * 证伪引擎
 * 实现知识的自我生长与证伪机制
 */
export class FalsificationEngine {
  private config: FalsificationEngineConfig
  private records: Map<string, FalsificationRecord[]>
  private growthRecords: Map<string, KnowledgeGrowthRecord[]>

  constructor(config?: Partial<FalsificationEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.records = new Map()
    this.growthRecords = new Map()
  }

  /**
   * 检查知识是否需要更新
   */
  async checkUpdate(knowledgeId: string): Promise<{
    needsUpdate: boolean
    reasons: string[]
    confidence: number
  }> {
    const reasons: string[] = []
    let confidence = 0

    // 检查1：时间因素
    const timeResult = await this.checkTimeFactor(knowledgeId)
    if (timeResult.needsAttention) {
      reasons.push(timeResult.reason)
      confidence += 0.3
    }

    // 检查2：外部知识更新
    const externalResult = await this.checkExternalUpdates(knowledgeId)
    if (externalResult.hasUpdates) {
      reasons.push(externalResult.reason)
      confidence += 0.4
    }

    // 检查3：内部一致性
    const consistencyResult = await this.checkConsistency(knowledgeId)
    if (!consistencyResult.isConsistent) {
      reasons.push(consistencyResult.reason)
      confidence += 0.3
    }

    return {
      needsUpdate: reasons.length > 0 && confidence >= this.config.confidenceThreshold,
      reasons,
      confidence: Math.min(confidence, 1)
    }
  }

  /**
   * 执行证伪审查
   */
  async performFalsification(knowledgeId: string): Promise<FalsificationRecord> {
    // 1. 获取原结论
    const originalConclusion = await this.getOriginalConclusion(knowledgeId)

    // 2. 收集新证据
    const evidences = await this.collectEvidences(knowledgeId)

    // 3. 分析证据
    const analysis = this.analyzeEvidences(originalConclusion, evidences)

    // 4. 判定证伪结果
    const result = this.determineFalsificationResult(analysis)

    // 5. 生成新结论（如果需要）
    const newConclusion = result === 'falsified' 
      ? this.generateNewConclusion(originalConclusion, analysis)
      : undefined

    // 6. 创建记录
    const record: FalsificationRecord = {
      id: this.generateId(),
      knowledgeId,
      originalConclusion,
      newEvidence: analysis.newEvidences.join('; '),
      result,
      newConclusion,
      confidence: this.calculateConfidence(analysis),
      createdAt: new Date().toISOString()
    }

    // 7. 保存记录
    this.saveRecord(knowledgeId, record)

    // 8. 如果证伪成功，触发生长记录
    if (result === 'falsified') {
      await this.createGrowthRecord(knowledgeId, originalConclusion, newConclusion!, analysis)
    }

    return record
  }

  /**
   * 获取证伪历史
   */
  getFalsificationHistory(knowledgeId: string): FalsificationRecord[] {
    return this.records.get(knowledgeId) || []
  }

  /**
   * 获取知识生长统计
   */
  getGrowthStats(knowledgeId: string): KnowledgeGrowthStats {
    const growths = this.growthRecords.get(knowledgeId) || []
    
    return {
      knowledgeId,
      totalGrowths: growths.length,
      lastGrowthAt: growths.length > 0 ? growths[growths.length - 1].createdAt : '',
      growthByType: {
        update: growths.filter(g => g.type === 'update').length,
        extension: growths.filter(g => g.type === 'extension').length,
        refinement: growths.filter(g => g.type === 'refinement').length
      }
    }
  }

  /**
   * 获取知识生长历史
   */
  getGrowthHistory(knowledgeId: string): KnowledgeGrowthRecord[] {
    return this.growthRecords.get(knowledgeId) || []
  }

  // ============ 私有方法 ============

  /**
   * 检查时间因素
   */
  private async checkTimeFactor(knowledgeId: string): Promise<{
    needsAttention: boolean
    reason: string
  }> {
    // 获取知识最后更新时间
    const lastUpdated = await this.getLastUpdated(knowledgeId)
    const daysSinceUpdate = this.calculateDaysSince(lastUpdated)

    if (daysSinceUpdate > 30) {
      return {
        needsAttention: true,
        reason: `知识已 ${Math.floor(daysSinceUpdate)} 天未更新，可能存在过时风险`
      }
    }

    return {
      needsAttention: false,
      reason: ''
    }
  }

  /**
   * 检查外部更新
   */
  private async checkExternalUpdates(_knowledgeId: string): Promise<{
    hasUpdates: boolean
    reason: string
  }> {
    // 这里可以集成外部API（如AMiner）
    // 目前返回模拟数据
    return {
      hasUpdates: false,
      reason: ''
    }
  }

  /**
   * 检查一致性
   */
  private async checkConsistency(_knowledgeId: string): Promise<{
    isConsistent: boolean
    reason: string
  }> {
    // 检查知识与相关知识的一致性
    // 这里可以扩展更复杂的一致性检查逻辑
    return {
      isConsistent: true,
      reason: ''
    }
  }

  /**
   * 获取原结论
   */
  private async getOriginalConclusion(_knowledgeId: string): Promise<string> {
    // 这里应该从知识库获取
    // 目前返回模拟数据
    return '这是关于该主题的原始结论和观点'
  }

  /**
   * 收集证据
   */
  private async collectEvidences(_knowledgeId: string): Promise<EvidenceItem[]> {
    // 这里应该从多个来源收集证据
    // 目前返回模拟数据
    return [
      {
        id: this.generateId(),
        content: '新的研究表明之前的结论可能需要修正',
        source: {
          type: 'research',
          description: '最新学术论文',
          discoveredAt: new Date().toISOString()
        },
        relevance: 0.85,
        strength: 0.75
      },
      {
        id: this.generateId(),
        content: '实验数据与之前的结论存在偏差',
        source: {
          type: 'experiment',
          description: '实验验证结果',
          discoveredAt: new Date().toISOString()
        },
        relevance: 0.9,
        strength: 0.8
      }
    ]
  }

  /**
   * 分析证据
   */
  private analyzeEvidences(
    originalConclusion: string,
    evidences: EvidenceItem[]
  ): FalsificationAnalysis {
    const originalAssertions = this.extractAssertions(originalConclusion)
    const newEvidences = evidences.map(e => e.content)
    
    const conflicts: FalsificationAnalysis['conflicts'] = []

    for (const evidence of evidences) {
      // 分析每个证据与原结论的关系
      const conflictType = this.analyzeConflict(originalAssertions, evidence)
      
      if (conflictType) {
        conflicts.push({
          assertion: originalAssertions[0] || '未知断言',
          evidence: evidence.content,
          conflictType
        })
      }
    }

    // 生成建议
    let recommendation: string
    if (conflicts.filter(c => c.conflictType === 'contradiction').length > 0) {
      recommendation = '发现直接矛盾，建议重新审视原结论并进行证伪'
    } else if (conflicts.filter(c => c.conflictType === 'weakening').length > 0) {
      recommendation = '发现削弱证据，建议对原结论进行修正'
    } else {
      recommendation = '新证据与原结论一致，无需修改'
    }

    return {
      originalAssertions,
      newEvidences,
      conflicts,
      recommendation
    }
  }

  /**
   * 提取断言
   */
  private extractAssertions(conclusion: string): string[] {
    // 简化实现：按句号分割
    return conclusion.split(/[。.!?]/).filter(s => s.trim().length > 0)
  }

  /**
   * 分析冲突
   */
  private analyzeConflict(
    _assertions: string[],
    evidence: EvidenceItem
  ): 'contradiction' | 'weakening' | 'irrelevant' | null {
    // 简化实现：根据相关性判断
    if (evidence.strength > 0.7 && evidence.relevance > 0.8) {
      return 'contradiction'
    } else if (evidence.strength > 0.5 && evidence.relevance > 0.6) {
      return 'weakening'
    }
    
    return null
  }

  /**
   * 判定证伪结果
   */
  private determineFalsificationResult(analysis: FalsificationAnalysis): FalsificationResult {
    const contradictions = analysis.conflicts.filter(c => c.conflictType === 'contradiction')
    const weakenings = analysis.conflicts.filter(c => c.conflictType === 'weakening')

    if (contradictions.length >= 1) {
      return 'falsified'
    } else if (weakenings.length >= 2) {
      return 'falsified'
    } else if (weakenings.length === 1) {
      return 'inconclusive'
    }

    return 'supported'
  }

  /**
   * 生成新结论
   */
  private generateNewConclusion(
    originalConclusion: string,
    analysis: FalsificationAnalysis
  ): string {
    // 简化实现：生成修正后的结论
    return `基于新的证据分析，原结论需要修正。\n\n原结论：${originalConclusion}\n\n新发现：${analysis.newEvidences.join('；')}\n\n修正后的结论：需要进一步研究和验证。`
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(analysis: FalsificationAnalysis): number {
    if (analysis.conflicts.length === 0) return 0.9

    const totalStrength = analysis.conflicts.reduce((sum, c) => {
      if (c.conflictType === 'contradiction') return sum + 0.4
      if (c.conflictType === 'weakening') return sum + 0.2
      return sum
    }, 0)

    return Math.min(0.5 + totalStrength, 0.95)
  }

  /**
   * 保存证伪记录
   */
  private saveRecord(knowledgeId: string, record: FalsificationRecord): void {
    const existing = this.records.get(knowledgeId) || []
    
    // 限制历史记录数量
    if (existing.length >= this.config.maxHistoryRecords) {
      existing.shift()
    }
    
    existing.push(record)
    this.records.set(knowledgeId, existing)
  }

  /**
   * 创建生长记录
   */
  private async createGrowthRecord(
    knowledgeId: string,
    originalSummary: string,
    newSummary: string,
    analysis: FalsificationAnalysis
  ): Promise<void> {
    const record: KnowledgeGrowthRecord = {
      id: this.generateId(),
      knowledgeId,
      type: 'refinement',
      originalSummary,
      newSummary,
      changes: analysis.conflicts.map(c => `${c.conflictType}: ${c.evidence}`),
      source: 'falsification',
      createdAt: new Date().toISOString()
    }

    const existing = this.growthRecords.get(knowledgeId) || []
    existing.push(record)
    this.growthRecords.set(knowledgeId, existing)
  }

  /**
   * 获取最后更新时间
   */
  private async getLastUpdated(_knowledgeId: string): Promise<string> {
    // 这里应该从知识库获取
    // 目前返回模拟数据
    return new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  }

  /**
   * 计算距离今天的天数
   */
  private calculateDaysSince(dateString: string): number {
    const date = new Date(dateString)
    const now = new Date()
    return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `falsification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============ 导出 ============

/** 默认实例 */
export const falsificationEngine = new FalsificationEngine()

/** 创建证伪引擎实例 */
export function createFalsificationEngine(
  config?: Partial<FalsificationEngineConfig>
): FalsificationEngine {
  return new FalsificationEngine(config)
}

// ============ LLM 增强版证伪 ============

/**
 * 用 LLM 分析新证据是否证伪原结论
 *
 * @param conclusion   原结论
 * @param newEvidence  新证据
 * @returns 证伪分析结果
 * @throws LLM 调用或解析失败时抛异常
 */
export async function falsifyWithLLM(
  conclusion: string,
  newEvidence: string
): Promise<FalsificationAnalysis> {
  if (!conclusion || conclusion.trim().length < 2) {
    throw new Error('原结论不能为空')
  }
  if (!newEvidence || newEvidence.trim().length < 2) {
    throw new Error('新证据不能为空')
  }

  const systemPrompt = [
    '你是一位严谨的科学哲学家，擅长用证伪主义方法审视已有结论。',
    '请分析用户提供的"新证据"是否证伪"原结论"。',
    '',
    '分析要求：',
    '1) originalAssertions: 从原结论中提取 1-5 条关键断言（数组）',
    '2) newEvidences: 从新证据中提取 1-5 条关键证据（数组）',
    '3) conflicts: 找出原断言与新证据之间的冲突点，每条冲突包含：',
    '   - assertion: 被挑战的原断言',
    '   - evidence:  对应的新证据',
    '   - conflictType: 冲突类型，取值为 contradiction（直接矛盾）、weakening（削弱但未推翻）、irrelevant（无关）',
    '4) recommendation: 给出一句话建议：是否需要修正原结论、如何修正',
    '',
    '输出要求：',
    '- 必须返回严格 JSON 格式，不要包含 markdown 代码块标记，不要有任何额外说明文字',
    '- JSON 结构为：{"originalAssertions": ["..."], "newEvidences": ["..."], "conflicts": [{"assertion": "...", "evidence": "...", "conflictType": "contradiction"}], "recommendation": "..."}',
    '- 如果新证据与原结论一致无冲突，conflicts 返回空数组，recommendation 说明"无冲突，原结论得到支持"',
  ].join('\n')

  const userPrompt = [
    '原结论：',
    conclusion,
    '',
    '新证据：',
    newEvidence,
  ].join('\n')

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // 调用 LLM
  const result = await chat(messages, { temperature: 0.3, maxTokens: 2000 })
  if (!result.success || !result.content) {
    throw new Error(`LLM 调用失败：${result.error || '未知错误'}`)
  }

  // 解析 JSON
  const jsonText = extractFalsificationJson(result.content)
  if (!jsonText) {
    throw new Error('LLM 返回内容无法解析为 JSON')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // 规范化各字段
  const originalAssertions = normalizeStringArray(parsed.originalAssertions)
  const newEvidences = normalizeStringArray(parsed.newEvidences)
  const conflicts = normalizeConflicts(parsed.conflicts)
  const recommendation = typeof parsed.recommendation === 'string' && parsed.recommendation.trim()
    ? parsed.recommendation.trim()
    : (conflicts.length > 0 ? '发现冲突，建议重新审视原结论' : '未发现冲突，原结论暂时成立')

  // 兜底：如果 AI 没提取出断言，至少把原结论放进去
  if (originalAssertions.length === 0) {
    originalAssertions.push(conclusion.trim())
  }
  if (newEvidences.length === 0) {
    newEvidences.push(newEvidence.trim())
  }

  return {
    originalAssertions,
    newEvidences,
    conflicts,
    recommendation,
  }
}

// ============ LLM 辅助函数 ============

/** 从 AI 返回文本中提取 JSON */
function extractFalsificationJson(text: string): string | null {
  const trimmed = text.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1)
  }

  return null
}

/** 规范化字符串数组 */
function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim())
    .slice(0, 10)
}

/** 规范化 conflicts 数组 */
function normalizeConflicts(raw: unknown): FalsificationAnalysis['conflicts'] {
  if (!Array.isArray(raw)) return []

  const validTypes = ['contradiction', 'weakening', 'irrelevant'] as const
  const result: FalsificationAnalysis['conflicts'] = []

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Record<string, unknown>

    const assertion = typeof obj.assertion === 'string' ? obj.assertion.trim() : ''
    const evidence = typeof obj.evidence === 'string' ? obj.evidence.trim() : ''
    if (!assertion && !evidence) continue

    const conflictType = validTypes.includes(obj.conflictType as typeof validTypes[number])
      ? (obj.conflictType as typeof validTypes[number])
      : 'weakening'

    result.push({
      assertion: assertion || '（未指明断言）',
      evidence: evidence || '（未指明证据）',
      conflictType,
    })
  }

  return result
}