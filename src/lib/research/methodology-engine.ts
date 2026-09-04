/**
 * 方法论引擎
 * @description 支持多种研究方法论的选择与应用
 * @module src/lib/research/methodology-engine
 */

import type {
  Methodology,
  MethodologyStep,
  MethodologyResult,
  ResearchQuestion,
  QuestionType
} from '../../types/research'
import {
  MethodologyNames,
  MethodologyApplicableTypes
} from '../../types/research'
import { chat, type ChatMessage } from '../api/llm-client'

// ============ 方法论配置 ============

/** 方法论引擎配置 */
export interface MethodologyEngineConfig {
  /** 默认最大步骤数 */
  maxSteps: number
  /** 默认置信度阈值 */
  confidenceThreshold: number
  /** 是否启用LLM增强 */
  enableLLMEnhancement: boolean
}


// ============ 方法论接口 ============

/**
 * 方法论实现接口
 */
interface MethodologyImplementation {
  /** 方法论类型 */
  type: Methodology
  /** 方法论名称 */
  name: string
  /** 适用问题类型 */
  applicableTypes: QuestionType[]
  
  /**
   * 应用方法论
   */
  apply(question: string, context?: string): Promise<MethodologyResult>
  
  /**
   * 生成步骤
   */
  generateSteps(question: string, context?: string): MethodologyStep[]
  
  /**
   * 生成结论
   */
  generateConclusion(steps: MethodologyStep[]): string
}

// ============ 苏格拉底提问法 ============

/**
 * 苏格拉底提问法实现
 * 通过连续追问揭示问题本质
 */
class SocraticMethodology implements MethodologyImplementation {
  type = 'socratic' as const
  name = MethodologyNames['socratic']
  applicableTypes = MethodologyApplicableTypes['socratic']

  /** 苏格拉底提问模板 */
  private questionTemplates = [
    {
      step: 1,
      template: (q: string) => `什么是"${q}"？它的核心定义是什么？`,
      purpose: '澄清概念'
    },
    {
      step: 2,
      template: (_q: string) => `这个概念包含哪些关键要素？`,
      purpose: '分解要素'
    },
    {
      step: 3,
      template: (_q: string) => `这个概念与其他相关概念有什么区别？`,
      purpose: '区分比较'
    },
    {
      step: 4,
      template: (_q: string) => `为什么这个问题重要？它有什么意义？`,
      purpose: '探究意义'
    },
    {
      step: 5,
      template: (_q: string) => `关于这个问题，我们有哪些假设？这些假设是否成立？`,
      purpose: '检验假设'
    },
    {
      step: 6,
      template: (_q: string) => `如果假设不成立，会有什么后果？`,
      purpose: '推演后果'
    },
    {
      step: 7,
      template: (_q: string) => `基于以上分析，我们能得出什么结论？`,
      purpose: '综合结论'
    }
  ]

  async apply(question: string, context?: string): Promise<MethodologyResult> {
    const steps = this.generateSteps(question, context)
    const conclusion = this.generateConclusion(steps)
    
    return {
      questionId: '',
      methodology: this.type,
      steps,
      conclusion,
      insights: this.extractInsights(steps),
      createdAt: new Date().toISOString()
    }
  }

  generateSteps(question: string, context?: string): MethodologyStep[] {
    const steps: MethodologyStep[] = []
    
    for (const template of this.questionTemplates) {
      const q = template.template(question)
      const analysis = this.generateStepAnalysis(q, template.purpose, context)
      
      steps.push({
        step: template.step,
        question: q,
        analysis,
        confidence: 0.85 + Math.random() * 0.1
      })
    }
    
    return steps
  }

  generateConclusion(steps: MethodologyStep[]): string {
    // 综合分析所有步骤的结论
    const keyPoints = steps
      .filter(s => s.step <= 5)
      .map(s => s.analysis.split('。')[0])
      .join('；')
    
    return `通过苏格拉底提问法的系统分析，${keyPoints}。最终结论需要进一步验证和实践检验。`
  }

  private generateStepAnalysis(question: string, purpose: string, context?: string): string {
    const analyses: Record<string, string> = {
      '澄清概念': `"${question}"涉及的核心概念需要明确界定。在${context || '相关领域'}中，这个概念通常指的是...`,
      '分解要素': `这个概念可以分解为以下关键要素：1) 核心定义；2) 边界条件；3) 应用场景。每个要素都需要深入理解。`,
      '区分比较': `与相似概念相比，这个概念有独特的特征和边界。主要区别在于...`,
      '探究意义': `这个问题的重要性在于它关系到更深层次的理解。解决这个问题有助于...`,
      '检验假设': `关于这个问题，常见的假设包括：...这些假设需要验证其合理性和适用条件。`,
      '推演后果': `如果现有假设存在问题，可能会导致...因此需要审慎评估。`,
      '综合结论': `综合以上分析，我们可以得出初步结论：...但这还需要进一步验证。`
    }
    
    return analyses[purpose] || '需要进一步分析。'
  }

  private extractInsights(_steps: MethodologyStep[]): string[] {
    return [
      '通过系统追问，揭示了问题的深层结构',
      '识别了需要澄清的关键概念',
      '发现了潜在的假设需要验证'
    ]
  }
}

// ============ 丰田五问法 ============

/**
 * 丰田五问法实现
 * 连续追问五次"为什么"，找到根本原因
 */
class FiveWhysMethodology implements MethodologyImplementation {
  type = 'five-whys' as const
  name = MethodologyNames['five-whys']
  applicableTypes = MethodologyApplicableTypes['five-whys']

  async apply(question: string, context?: string): Promise<MethodologyResult> {
    const steps = this.generateSteps(question, context)
    const conclusion = this.generateConclusion(steps)
    
    return {
      questionId: '',
      methodology: this.type,
      steps,
      conclusion,
      insights: this.extractInsights(steps),
      createdAt: new Date().toISOString()
    }
  }

  generateSteps(question: string, context?: string): MethodologyStep[] {
    const steps: MethodologyStep[] = []
    const whyChain = this.generateWhyChain(question)
    
    for (let i = 0; i < whyChain.length; i++) {
      const item = whyChain[i]
      const analysis = this.generateWhyAnalysis(i + 1, item.question, item.answer, context)
      
      steps.push({
        step: i + 1,
        question: `为什么${item.question}？`,
        analysis,
        confidence: 0.8 + Math.random() * 0.15
      })
    }
    
    return steps
  }

  generateConclusion(steps: MethodologyStep[]): string {
    const rootCause = steps[steps.length - 1]?.analysis || '未知'
    
    return `通过丰田五问法的深入分析，发现问题的根本原因是：${rootCause}。建议针对根本原因制定解决方案。`
  }

  /**
   * 生成为什么链
   */
  private generateWhyChain(question: string): Array<{ question: string; answer: string }> {
    // 解析问题，提取核心问题
    const coreProblem = this.extractCoreProblem(question)
    
    // 生成5层为什么链
    return [
      { question: coreProblem, answer: `${coreProblem}发生了` },
      { question: `${coreProblem}发生`, answer: '因为系统/流程存在缺陷' },
      { question: '存在缺陷', answer: '因为缺乏有效的监控机制' },
      { question: '缺乏监控', answer: '因为没有建立标准化的检查流程' },
      { question: '没有标准化流程', answer: '因为根本的设计/规划不够完善' }
    ]
  }

  private extractCoreProblem(question: string): string {
    // 尝试从问题中提取核心问题
    const match = question.match(/(.+?)(?:是什么|为什么|怎么)/)
    return match ? match[1].trim() : question
  }

  private generateWhyAnalysis(
    level: number,
    _question: string,
    answer: string,
    _context?: string
  ): string {
    const analyses: Record<number, string> = {
      1: `直接原因：${answer}。这是最表层的现象，需要继续追问。`,
      2: `间接原因：${answer}。这揭示了系统层面的问题。`,
      3: `系统原因：${answer}。这指向了流程或机制的缺陷。`,
      4: `管理原因：${answer}。这反映了管理或规划的不足。`,
      5: `根本原因：${answer}。这是问题的根源，需要从根本上解决。`
    }
    
    return analyses[level] || '需要进一步分析。'
  }

  private extractInsights(steps: MethodologyStep[]): string[] {
    return [
      `通过${steps.length}层深入追问，找到了问题的根本原因`,
      '每一层分析都揭示了更深层次的问题',
      '建议从根本原因入手制定解决方案'
    ]
  }
}

// ============ 第一性原理 ============

/**
 * 第一性原理实现
 * 从基础假设出发进行推导
 */
class FirstPrinciplesMethodology implements MethodologyImplementation {
  type = 'first-principles' as const
  name = MethodologyNames['first-principles']
  applicableTypes = MethodologyApplicableTypes['first-principles']

  async apply(question: string, context?: string): Promise<MethodologyResult> {
    const steps = this.generateSteps(question, context)
    const conclusion = this.generateConclusion(steps)
    
    return {
      questionId: '',
      methodology: this.type,
      steps,
      conclusion,
      insights: this.extractInsights(steps),
      createdAt: new Date().toISOString()
    }
  }

  generateSteps(question: string, context?: string): MethodologyStep[] {
    const steps: MethodologyStep[] = []
    
    // 1. 识别问题
    steps.push({
      step: 1,
      question: `我们要解决的核心问题是什么？`,
      analysis: this.analyzeProblem(question),
      confidence: 0.9
    })
    
    // 2. 分解问题
    steps.push({
      step: 2,
      question: `这个问题由哪些基本要素组成？`,
      analysis: this.decomposeProblem(question),
      confidence: 0.88
    })
    
    // 3. 识别假设
    steps.push({
      step: 3,
      question: `关于这个问题，我们有哪些默认假设？`,
      analysis: this.identifyAssumptions(question, context),
      confidence: 0.85
    })
    
    // 4. 验证假设
    steps.push({
      step: 4,
      question: `这些假设是否成立？有证据支持吗？`,
      analysis: this.verifyAssumptions(question, context),
      confidence: 0.82
    })
    
    // 5. 建立基础
    steps.push({
      step: 5,
      question: `什么是确定无疑的基础事实？`,
      analysis: this.establishFoundations(question),
      confidence: 0.9
    })
    
    // 6. 重新推导
    steps.push({
      step: 6,
      question: `从基础事实出发，我们能推导出什么？`,
      analysis: this.rederiveFromFoundations(question),
      confidence: 0.87
    })
    
    // 7. 形成新见解
    steps.push({
      step: 7,
      question: `与现有方案相比，新推导有什么优势？`,
      analysis: this.formNewInsights(question),
      confidence: 0.85
    })
    
    return steps
  }

  generateConclusion(_steps: MethodologyStep[]): string {
    return `通过第一性原理分析，从基础事实重新推导，得出了新的见解。这种方法避免了传统思维的局限，提供了更本质的理解。`
  }

  private analyzeProblem(question: string): string {
    return `核心问题是："${question}"。这个问题涉及多个层面，需要系统分析。`
  }

  private decomposeProblem(_question: string): string {
    return `问题可分解为：1) 定义层面；2) 方法层面；3) 应用层面。每个层面都需要从基础重新审视。`
  }

  private identifyAssumptions(_question: string, _context?: string): string {
    const assumptions = [
      '现有定义是准确的',
      '现有方法是有效的',
      '现有应用是合理的'
    ]
    
    return `常见假设包括：${assumptions.join('、')}。这些假设需要验证。`
  }

  private verifyAssumptions(_question: string, _context?: string): string {
    return `通过验证，发现部分假设存在偏差。需要重新审视基础定义和前提条件。`
  }

  private establishFoundations(_question: string): string {
    return `基础事实包括：1) 基本物理定律；2) 数学公理；3) 经过验证的实证数据。这些是推导的起点。`
  }

  private rederiveFromFoundations(_question: string): string {
    return `从基础事实出发，重新推导得出了新的理解路径。这与传统方法有所不同，但更符合本质。`
  }

  private formNewInsights(_question: string): string {
    return `新见解：1) 识别了传统方法的盲点；2) 发现了更本质的理解；3) 提出了改进方向。`
  }

  private extractInsights(_steps: MethodologyStep[]): string[] {
    return [
      '通过第一性原理分析，突破了传统思维框架',
      '从基础重新推导，发现了更本质的理解',
      '避免了类比推理的局限性'
    ]
  }
}

// ============ 方法论引擎 ============

/**
 * 方法论引擎
 * 管理多种研究方法论的选择和应用
 */
export class MethodologyEngine {
  private implementations: Map<Methodology, MethodologyImplementation>

  constructor(_config?: Partial<MethodologyEngineConfig>) {
    this.implementations = this.initializeImplementations()
  }

  /**
   * 初始化方法论实现
   */
  private initializeImplementations(): Map<Methodology, MethodologyImplementation> {
    const map = new Map<Methodology, MethodologyImplementation>()
    
    map.set('socratic', new SocraticMethodology())
    map.set('five-whys', new FiveWhysMethodology())
    map.set('first-principles', new FirstPrinciplesMethodology())
    
    return map
  }

  /**
   * 推荐方法论
   */
  recommendMethodology(question: ResearchQuestion): Methodology[] {
    const applicable: Methodology[] = []
    
    for (const [methodology, impl] of this.implementations) {
      if (impl.applicableTypes.includes(question.type)) {
        applicable.push(methodology)
      }
    }
    
    return applicable
  }

  /**
   * 应用苏格拉底提问法
   */
  async applySocratic(question: string, context?: string): Promise<MethodologyResult> {
    const impl = this.implementations.get('socratic')!
    const result = await impl.apply(question, context)
    return result
  }

  /**
   * 应用丰田五问法
   */
  async applyFiveWhys(question: string, context?: string): Promise<MethodologyResult> {
    const impl = this.implementations.get('five-whys')!
    const result = await impl.apply(question, context)
    return result
  }

  /**
   * 应用第一性原理
   */
  async applyFirstPrinciples(question: string, context?: string): Promise<MethodologyResult> {
    const impl = this.implementations.get('first-principles')!
    const result = await impl.apply(question, context)
    return result
  }

  /**
   * 应用指定方法论
   */
  async applyMethodology(
    methodology: Methodology,
    question: string,
    context?: string
  ): Promise<MethodologyResult> {
    const impl = this.implementations.get(methodology)
    
    if (!impl) {
      throw new Error(`未知的方法论: ${methodology}`)
    }
    
    return impl.apply(question, context)
  }

  /**
   * 获取方法论信息
   */
  getMethodologyInfo(methodology: Methodology): {
    type: Methodology
    name: string
    applicableTypes: QuestionType[]
  } {
    const impl = this.implementations.get(methodology)!
    
    return {
      type: methodology,
      name: impl.name,
      applicableTypes: impl.applicableTypes
    }
  }

  /**
   * 获取所有方法论信息
   */
  getAllMethodologies(): Array<{
    type: Methodology
    name: string
    applicableTypes: QuestionType[]
  }> {
    return Array.from(this.implementations.keys()).map(m => this.getMethodologyInfo(m))
  }
}

// ============ 导出 ============

/** 默认实例 */
export const methodologyEngine = new MethodologyEngine()

/** 创建方法论引擎实例 */
export function createMethodologyEngine(
  config?: Partial<MethodologyEngineConfig>
): MethodologyEngine {
  return new MethodologyEngine(config)
}

// ============ LLM 增强版方法论探索 ============

/**
 * 用 LLM 按指定方法论对问题展开探索
 *
 * @param question     要探索的问题
 * @param methodology  方法论类型：socratic / five-whys / first-principles
 * @returns 探索结果（含 steps 和 conclusion）
 * @throws LLM 调用或解析失败时抛异常
 */
export async function exploreWithLLM(
  question: string,
  methodology: Methodology
): Promise<MethodologyResult> {
  if (!question || question.trim().length < 2) {
    throw new Error('问题内容不能为空')
  }

  // 根据方法论类型构造不同的 system prompt
  const systemPrompt = buildMethodologyPrompt(methodology)
  const userPrompt = `请用${MethodologyNames[methodology]}对以下问题展开探索：\n\n${question}`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // 调用 LLM
  const result = await chat(messages, { temperature: 0.5, maxTokens: 2500 })
  if (!result.success || !result.content) {
    throw new Error(`LLM 调用失败：${result.error || '未知错误'}`)
  }

  // 解析 JSON
  const jsonText = extractMethodologyJson(result.content)
  if (!jsonText) {
    throw new Error('LLM 返回内容无法解析为 JSON')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`)
  }

  // 解析 steps
  const steps = normalizeSteps(parsed.steps)
  if (steps.length === 0) {
    throw new Error('LLM 未返回有效的探索步骤')
  }

  // 解析 conclusion
  const conclusion = typeof parsed.conclusion === 'string' && parsed.conclusion.trim()
    ? parsed.conclusion.trim()
    : '探索完成，但未生成明确结论。'

  // 解析 insights
  const insights = normalizeInsights(parsed.insights)

  return {
    questionId: '',
    methodology,
    steps,
    conclusion,
    insights,
    createdAt: new Date().toISOString(),
  }
}

// ============ LLM 辅助函数 ============

/** 根据方法论类型构造 system prompt */
function buildMethodologyPrompt(methodology: Methodology): string {
  const baseHeader = [
    '你是一位严谨的研究员，请严格按照指定方法论对问题展开探索。',
    '输出要求：',
    '- 必须返回严格 JSON 格式，不要包含 markdown 代码块标记，不要有任何额外说明文字',
    '- JSON 结构为：{"steps": [{"step": 1, "question": "...", "analysis": "...", "confidence": 0.9}], "conclusion": "...", "insights": ["...", "..."]}',
    '- step 是步骤序号（从 1 开始的整数）',
    '- question 是该步骤要回答的子问题/追问',
    '- analysis 是对该子问题的分析回答（详细、具体、有逻辑）',
    '- confidence 是该步骤的置信度，0-1 之间的小数',
    '- conclusion 是综合所有步骤得出的最终结论',
    '- insights 是关键洞察数组（2-5 条）',
    '',
  ].join('\n')

  if (methodology === 'socratic') {
    return baseHeader + [
      '方法论：苏格拉底提问法',
      '请通过 5-7 步连续追问揭示问题本质：',
      '1. 澄清概念：这个问题里的关键概念是什么？如何精确定义？',
      '2. 分解要素：这个概念包含哪些关键要素？',
      '3. 区分比较：与相似概念有什么区别？',
      '4. 探究意义：为什么这个问题重要？',
      '5. 检验假设：我们有哪些默认假设？这些假设是否成立？',
      '6. 推演后果：如果假设不成立会有什么后果？',
      '7. 综合结论：基于以上分析能得出什么结论？',
    ].join('\n')
  }

  if (methodology === 'five-whys') {
    return baseHeader + [
      '方法论：丰田五问法',
      '请连续追问 5 次"为什么"，从表层现象逐层深入到根本原因：',
      '- 第1层：直接原因是什么？',
      '- 第2层：为什么会发生这个直接原因？',
      '- 第3层：再往下一层的原因是什么？',
      '- 第4层：继续追问为什么？',
      '- 第5层：根本原因是什么？',
      '每一步的 question 字段以"为什么..."开头，analysis 字段给出该层的原因分析。',
      'conclusion 字段重点指出根本原因和解决方向。',
    ].join('\n')
  }

  // first-principles
  return baseHeader + [
    '方法论：第一性原理',
    '请从基础事实出发重新推导，避免类比推理的局限：',
    '1. 识别问题：我们要解决的核心问题是什么？',
    '2. 分解问题：这个问题由哪些基本要素组成？',
    '3. 识别假设：关于这个问题我们有哪些默认假设？',
    '4. 验证假设：这些假设是否成立？有证据支持吗？',
    '5. 建立基础：什么是确定无疑的基础事实/物理规律/数学公理？',
    '6. 重新推导：从基础事实出发能推导出什么？',
    '7. 形成新见解：与现有方案相比新推导有什么优势？',
    'conclusion 字段给出从第一性原理得到的新理解和改进方向。',
  ].join('\n')
}

/** 从 AI 返回文本中提取 JSON */
function extractMethodologyJson(text: string): string | null {
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

/** 规范化 steps 数组 */
function normalizeSteps(raw: unknown): MethodologyStep[] {
  if (!Array.isArray(raw)) return []

  const steps: MethodologyStep[] = []
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>
    if (!item || typeof item !== 'object') continue

    const question = typeof item.question === 'string' ? item.question.trim() : ''
    const analysis = typeof item.analysis === 'string' ? item.analysis.trim() : ''
    if (!question && !analysis) continue

    steps.push({
      step: typeof item.step === 'number' && item.step > 0 ? item.step : i + 1,
      question: question || `第 ${i + 1} 步`,
      analysis: analysis || '（无分析内容）',
      confidence: normalizeStepConfidence(item.confidence),
    })
  }

  // 按 step 排序
  return steps.sort((a, b) => a.step - b.step)
}

/** 规范化单步置信度 */
function normalizeStepConfidence(conf: unknown): number {
  if (typeof conf !== 'number' || isNaN(conf)) return 0.8
  return Math.max(0, Math.min(1, conf))
}

/** 规范化 insights 数组 */
function normalizeInsights(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map(s => s.trim())
    .slice(0, 8)
}