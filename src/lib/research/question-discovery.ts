/**
 * 问题发现引擎
 * @description 从对话和想法中自动发现研究问题
 * @module src/lib/research/question-discovery
 */

import type {
  DiscoveredQuestion,
  DiscoveredQuestionSource,
  QuestionType,
  Methodology,
} from '../../types/research'
import {
  MethodologyApplicableTypes
} from '../../types/research'
import { chat, type ChatMessage } from '../api/llm-client'

// ============ 问题发现配置 ============

/** 问题发现配置 */
export interface QuestionDiscoveryConfig {
  /** 最小问题长度 */
  minQuestionLength: number
  /** 最大发现数量 */
  maxDiscoveries: number
  /** 价值评分阈值 */
  valueThreshold: number
  /** 是否启用LLM辅助分析 */
  enableLLMAnalysis: boolean
  /** LLM配置 */
  llmConfig?: {
    model: string
    temperature: number
  }
}

/** 默认配置 */
const DEFAULT_CONFIG: QuestionDiscoveryConfig = {
  minQuestionLength: 10,
  maxDiscoveries: 10,
  valueThreshold: 5,
  enableLLMAnalysis: false
}

// ============ 问题模式定义 ============

/** 疑问句模式 */
const QUESTION_PATTERNS = [
  // 中文疑问句模式
  { pattern: /(.+?)是什么？/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)什么是/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)怎么理解/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)如何理解/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)和(.+?)的区别/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)有什么不同/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)有哪些类型/g, type: 'conceptual' as QuestionType },
  { pattern: /(.+?)是什么关系/g, type: 'conceptual' as QuestionType },
  
  // 方法型问题
  { pattern: /(.+?)如何做/g, type: 'methodological' as QuestionType },
  { pattern: /(.+?)怎么做/g, type: 'methodological' as QuestionType },
  { pattern: /(.+?)怎么实现/g, type: 'methodological' as QuestionType },
  { pattern: /(.+?)怎么处理/g, type: 'methodological' as QuestionType },
  { pattern: /(.+?)有什么方法/g, type: 'methodological' as QuestionType },
  { pattern: /(.+?)有哪些方法/g, type: 'methodological' as QuestionType },
  { pattern: /如何(.+?)？/g, type: 'methodological' as QuestionType },
  { pattern: /怎么(.+?)？/g, type: 'methodological' as QuestionType },
  
  // 应用型问题
  { pattern: /(.+?)在(.+?)中的应用/g, type: 'applied' as QuestionType },
  { pattern: /(.+?)如何应用于/g, type: 'applied' as QuestionType },
  { pattern: /(.+?)适用于/g, type: 'applied' as QuestionType },
  { pattern: /(.+?)能用来/g, type: 'applied' as QuestionType },
  { pattern: /(.+?)有什么用/g, type: 'applied' as QuestionType },
  { pattern: /(.+?)怎么用/g, type: 'applied' as QuestionType },
  
  // 英文疑问句模式
  { pattern: /(.+?)\?$/g, type: 'conceptual' as QuestionType },
  { pattern: /What is (.+?)\?/g, type: 'conceptual' as QuestionType },
  { pattern: /How to (.+?)\?/g, type: 'methodological' as QuestionType },
  { pattern: /How does (.+?) work/g, type: 'methodological' as QuestionType },
  { pattern: /What are the (.+?) of/g, type: 'conceptual' as QuestionType }
]

/** 矛盾关键词 */
const CONTRADICTION_KEYWORDS = [
  '但是', '然而', '却', '相反', '矛盾', '不一致',
  'but', 'however', 'contradict', 'paradox'
]

/** 知识缺口关键词 */
const GAP_KEYWORDS = [
  '不清楚', '不了解', '不够清楚', '不够了解', '未知', '未解决', '待研究', '需要研究',
  'unclear', 'unknown', 'unsolved', 'need to research'
]

/** 研究价值关键词 */
const VALUE_KEYWORDS = [
  '重要', '关键', '核心', '基础', '突破', '创新',
  'important', 'critical', 'key', 'fundamental', 'breakthrough'
]

// ============ 问题发现引擎类 ============

/**
 * 问题发现引擎
 * 从对话和想法中自动发现值得研究的问题
 */
export class QuestionDiscoveryEngine {
  private config: QuestionDiscoveryConfig

  constructor(config?: Partial<QuestionDiscoveryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 从文本中发现研究问题
   */
  async discoverFromText(
    text: string,
    source: DiscoveredQuestionSource
  ): Promise<DiscoveredQuestion[]> {
    const questions: DiscoveredQuestion[] = []

    // 1. 提取疑问句
    const extractedQuestions = this.extractQuestions(text)
    
    // 2. 提取矛盾点
    const contradictionQuestions = this.extractContradictions(text)
    
    // 3. 发现知识缺口
    const gapQuestions = this.discoverKnowledgeGaps(text)

    // 合并所有发现
    const allQuestions = [
      ...extractedQuestions.map(q => ({ question: q, source: 'explicit' as const })),
      ...contradictionQuestions.map(q => ({ question: q, source: 'contradiction' as const })),
      ...gapQuestions.map(q => ({ question: q, source: 'gap' as const }))
    ]

    // 按 question 去重，保留首次出现（显式优先于矛盾/缺口）
    const seen = new Set<string>()
    const uniqueQuestions = allQuestions.filter(item => {
      if (seen.has(item.question)) return false
      seen.add(item.question)
      return true
    })

    // 对每个问题进行分类和评估
    for (const item of uniqueQuestions) {
      const type = this.classifyQuestion(item.question)
      const typeConfidence = this.calculateTypeConfidence(item.question, type)
      const valueScore = this.evaluateValue(item.question, item.source)
      const valueReason = this.generateValueReason(item.question, item.source)
      const recommendedMethodologies = this.recommendMethodologies(type)

      // 显式问题保留原始来源对象；
      // 矛盾/缺口问题：若原始来源为 conversation/idea（带 sourceId），保留对象以便追溯；
      // 若原始来源为 text（无 sourceId），使用发现方式字符串
      const isTraceableSource = source.type === 'idea' || source.type === 'conversation'
      const questionSource = item.source === 'explicit' || isTraceableSource
        ? source
        : item.source

      questions.push({
        question: item.question,
        type,
        typeConfidence,
        source: questionSource,
        valueScore,
        valueReason,
        recommendedMethodologies
      })
    }

    // 过滤和排序
    return this.filterAndSort(questions)
  }

  /**
   * 从对话中发现研究问题
   */
  async discoverFromConversation(
    conversation: string,
    conversationId: string
  ): Promise<DiscoveredQuestion[]> {
    const source: DiscoveredQuestionSource = {
      type: 'conversation',
      sourceId: conversationId,
      rawContent: conversation
    }

    return this.discoverFromText(conversation, source)
  }

  /**
   * 从想法中发现研究问题
   */
  async discoverFromIdea(
    ideaContent: string,
    ideaId: string
  ): Promise<DiscoveredQuestion[]> {
    const source: DiscoveredQuestionSource = {
      type: 'idea',
      sourceId: ideaId,
      rawContent: ideaContent
    }

    return this.discoverFromText(ideaContent, source)
  }

  // ============ 私有方法 ============

  /**
   * 提取疑问句
   */
  private extractQuestions(text: string): string[] {
    const questions: string[] = []
    const sentences = this.splitSentences(text)

    for (const sentence of sentences) {
      // 检查是否是疑问句
      if (this.isQuestionSentence(sentence)) {
        // 提取问题内容
        const question = this.extractQuestionContent(sentence)
        if (question && question.length >= this.config.minQuestionLength) {
          questions.push(question)
        }
      }

      // 使用模式匹配
      for (const { pattern } of QUESTION_PATTERNS) {
        const matches = sentence.match(pattern)
        if (matches) {
          for (const match of matches) {
            const cleaned = this.cleanQuestion(match)
            if (cleaned && cleaned.length >= this.config.minQuestionLength) {
              questions.push(cleaned)
            }
          }
        }
      }
    }

    // 去重
    return [...new Set(questions)]
  }

  /**
   * 提取矛盾点
   */
  private extractContradictions(text: string): string[] {
    const contradictions: string[] = []
    const sentences = this.splitSentences(text)

    for (const sentence of sentences) {
      const hasContradiction = CONTRADICTION_KEYWORDS.some(keyword => 
        sentence.includes(keyword)
      )

      if (hasContradiction) {
        // 尝试从矛盾句中提取问题
        const question = this.extractContradictionQuestion(sentence)
        if (question) {
          contradictions.push(question)
        }
      }
    }

    return contradictions
  }

  /**
   * 发现知识缺口
   */
  private discoverKnowledgeGaps(text: string): string[] {
    const gaps: string[] = []
    const sentences = this.splitSentences(text)

    for (const sentence of sentences) {
      const hasGap = GAP_KEYWORDS.some(keyword => 
        sentence.includes(keyword)
      )

      if (hasGap) {
        const question = this.formulateGapQuestion(sentence)
        if (question) {
          gaps.push(question)
        }
      }
    }

    return gaps
  }

  /**
   * 分类问题
   */
  private classifyQuestion(question: string): QuestionType {
    // 统计每种类型的匹配数
    const typeScores: Record<QuestionType, number> = {
      conceptual: 0,
      methodological: 0,
      applied: 0
    }

    // 补回被 splitSentences 去掉的结尾标点，保证以"？"结尾的模式能匹配
    const q = question.endsWith('？') || question.endsWith('?') ? question : question + '？'

    for (const { pattern, type } of QUESTION_PATTERNS) {
      if (pattern.test(q)) {
        typeScores[type]++
      }
    }

    // 返回得分最高的类型
    const maxType = Object.entries(typeScores).sort((a, b) => b[1] - a[1])[0]
    return maxType[0] as QuestionType || 'conceptual'
  }

  /**
   * 计算类型置信度
   */
  private calculateTypeConfidence(
    question: string,
    type: QuestionType
  ): number {
    // 补回被 splitSentences 去掉的结尾标点
    const q = question.endsWith('？') || question.endsWith('?') ? question : question + '？'

    const matchingPatterns = QUESTION_PATTERNS.filter(
      p => p.type === type && p.pattern.test(q)
    )
    
    const totalPatterns = QUESTION_PATTERNS.filter(
      p => p.pattern.test(q)
    )

    if (totalPatterns.length === 0) return 0.5

    return Math.min(0.5 + (matchingPatterns.length / totalPatterns.length) * 0.5, 0.95)
  }

  /**
   * 评估研究价值
   */
  private evaluateValue(question: string, source: 'explicit' | 'contradiction' | 'gap'): number {
    let baseScore = 5

    // 来源加权
    if (source === 'contradiction') baseScore += 1.5
    if (source === 'gap') baseScore += 1

    // 关键词加权
    for (const keyword of VALUE_KEYWORDS) {
      if (question.includes(keyword)) {
        baseScore += 0.5
      }
    }

    // 长度加权（更长的问题通常更具体）
    if (question.length > 50) baseScore += 0.5
    if (question.length > 100) baseScore += 0.5

    // 限制在1-10范围内
    return Math.max(1, Math.min(10, Math.round(baseScore)))
  }

  /**
   * 生成价值评估理由
   */
  private generateValueReason(question: string, source: 'explicit' | 'contradiction' | 'gap'): string {
    const reasons: string[] = []

    if (source === 'contradiction') {
      reasons.push('发现矛盾点，解决后可推进知识一致性')
    }
    if (source === 'gap') {
      reasons.push('识别到知识缺口，填补后可完善知识体系')
    }

    for (const keyword of VALUE_KEYWORDS) {
      if (question.includes(keyword)) {
        reasons.push(`包含关键词"${keyword}"，表明研究价值`)
      }
    }

    if (question.length > 50) {
      reasons.push('问题描述详细，研究目标明确')
    }

    return reasons.length > 0 
      ? reasons.join('；') 
      : '一般性问题，需进一步评估研究价值'
  }

  /**
   * 推荐方法论
   */
  private recommendMethodologies(type: QuestionType): Methodology[] {
    const methodologies: Methodology[] = ['socratic', 'five-whys', 'first-principles']
    
    return methodologies.filter(m => 
      MethodologyApplicableTypes[m].includes(type)
    )
  }

  /**
   * 过滤和排序
   */
  private filterAndSort(questions: DiscoveredQuestion[]): DiscoveredQuestion[] {
    return questions
      .filter(q => q.valueScore >= this.config.valueThreshold)
      .sort((a, b) => {
        // 先按价值评分排序
        if (b.valueScore !== a.valueScore) {
          return b.valueScore - a.valueScore
        }
        // 再按类型置信度排序
        return b.typeConfidence - a.typeConfidence
      })
      .slice(0, this.config.maxDiscoveries)
  }

  // ============ 辅助方法 ============

  /**
   * 分割句子
   */
  private splitSentences(text: string): string[] {
    return text
      .split(/[。！？.!?\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  /**
   * 判断是否是疑问句
   */
  private isQuestionSentence(sentence: string): boolean {
    // 中文疑问词
    const chineseQuestionWords = ['什么', '怎么', '如何', '为什么', '吗', '呢', '哪', '谁', '几', '多少']
    // 英文疑问词
    const englishQuestionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which']
    
    // 以问号结尾
    if (sentence.endsWith('？') || sentence.endsWith('?')) {
      return true
    }

    // 包含中文疑问词
    const lowerSentence = sentence.toLowerCase()
    if (chineseQuestionWords.some(w => sentence.includes(w)) ||
        englishQuestionWords.some(w => lowerSentence.startsWith(w))) {
      return true
    }

    // 包含研究价值关键词（如"重要"、"核心"等），视为值得研究的问题
    if (VALUE_KEYWORDS.some(w => sentence.includes(w))) {
      return true
    }

    // 长句子（>30字符）通常包含足够上下文，视为值得研究的问题
    if (sentence.length > 30) {
      return true
    }

    return false
  }

  /**
   * 提取问题内容
   */
  private extractQuestionContent(sentence: string): string {
    // 移除多余的空白
    let content = sentence.trim()
    
    // 如果句子以疑问词开头，保留完整句子
    // 否则尝试提取核心问题
    if (!/^(什么|怎么|如何|为什么|What|How|Why)/.test(content)) {
      // 尝试从陈述句中提取问题部分
      const match = content.match(/(.+?)(?:是什么|是什么意思|怎么理解)/)
      if (match) {
        content = match[1] + '是什么？'
      } else {
        // 尝试从"X未知"中提取问题
        const unknownMatch = content.match(/(.+?)未知/)
        if (unknownMatch && unknownMatch[1].trim().length > 0) {
          content = unknownMatch[1].trim() + '是什么？'
        }
      }
    }

    return content
  }

  /**
   * 清理问题
   */
  private cleanQuestion(question: string): string {
    return question
      .replace(/\s+/g, ' ')
      .replace(/^[，,。！？:：]+/, '')
      .replace(/[，,。！？:：]+$/, '')
      .trim()
  }

  /**
   * 从矛盾句中提取问题
   */
  private extractContradictionQuestion(sentence: string): string | null {
    // 尝试识别矛盾的两个部分
    const parts = sentence.split(/(但是|然而|却|相反|矛盾|不一致|but|however)/)
    
    if (parts.length >= 3) {
      const part1 = parts[0].trim()
      const part2 = parts.slice(2).join('').trim()
      
      // 形成研究问题
      return `如何理解"${part1.slice(0, 30)}..."与"${part2.slice(0, 30)}..."之间的关系？`
    }

    return null
  }

  /**
   * 形成知识缺口问题
   */
  private formulateGapQuestion(sentence: string): string | null {
    // 提取上下文
    const context = sentence
      .replace(/(不清楚|不了解|不够清楚|不够了解|未知|未解决|待研究|需要研究)/g, '')
      .trim()

    if (context.length > 0) {
      return `${context}是什么？`
    }

    return null
  }
}

// ============ 导出 ============

/** 默认实例 */
export const questionDiscovery = new QuestionDiscoveryEngine()

/** 创建问题发现引擎实例 */
export function createQuestionDiscoveryEngine(
  config?: Partial<QuestionDiscoveryConfig>
): QuestionDiscoveryEngine {
  return new QuestionDiscoveryEngine(config)
}

// ============ LLM 增强版问题发现 ============

/**
 * 用 LLM 从对话/想法文本中提取值得研究的问题
 *
 * @param text   原始文本（对话内容或想法内容）
 * @param source 来源类型：'conversation' 表示对话，'idea' 表示想法
 * @returns 发现的问题数组；LLM 失败或解析失败时返回空数组（不抛异常）
 */
export async function discoverQuestionsWithLLM(
  text: string,
  source: 'conversation' | 'idea'
): Promise<DiscoveredQuestion[]> {
  // 空文本直接返回
  if (!text || text.trim().length < 5) {
    return []
  }

  // 构造 system prompt：要求 AI 返回严格 JSON，不要包含 markdown 代码块标记
  const systemPrompt = [
    '你是一位研究型知识管理助手，擅长从对话和想法中识别值得深入研究的问题。',
    '请从用户提供的文本中提取 1-8 个值得研究的问题。',
    '对每个问题，请判断：',
    '1) type: 问题类型，取值为 conceptual（概念型/原理型）、methodological（方法型/技术型）、applied（应用型/实践型）',
    '2) valueScore: 研究价值评分，1-10 的整数，分数越高越值得研究',
    '3) valueReason: 一句话说明给出该评分的理由',
    '4) typeConfidence: 类型判断置信度，0-1 之间的小数',
    '5) recommendedMethodologies: 推荐方法论数组，可选项为 socratic、five-whys、first-principles',
    '',
    '输出要求：',
    '- 必须返回严格 JSON 格式，不要包含 markdown 代码块标记，不要有任何额外说明文字',
    '- JSON 结构为：{"questions": [{"question": "...", "type": "...", "valueScore": 8, "valueReason": "...", "typeConfidence": 0.9, "recommendedMethodologies": ["socratic"]}]}',
    '- question 字段必须是完整的问题句子，结尾加问号',
    '- 如果文本中没有值得研究的问题，返回 {"questions": []}',
  ].join('\n')

  const userPrompt = `请从以下${source === 'conversation' ? '对话' : '想法'}中提取值得研究的问题：\n\n${text}`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  try {
    const result = await chat(messages, { temperature: 0.3, maxTokens: 2000 })
    if (!result.success || !result.content) {
      return []
    }

    // 解析 JSON：先尝试直接 parse，失败则尝试从文本中提取 JSON
    const jsonText = extractJsonFromText(result.content)
    if (!jsonText) {
      return []
    }

    const parsed = JSON.parse(jsonText) as { questions?: Array<Record<string, unknown>> }
    if (!parsed || !Array.isArray(parsed.questions)) {
      return []
    }

    // 构造来源对象
    const sourceObj: DiscoveredQuestionSource = {
      type: source,
      sourceId: `llm_${Date.now()}`,
      rawContent: text,
    }

    // 把 AI 返回的每条问题映射为 DiscoveredQuestion
    const questions: DiscoveredQuestion[] = []
    for (const item of parsed.questions) {
      const question = typeof item.question === 'string' ? item.question.trim() : ''
      if (question.length < 5) continue

      const type = normalizeQuestionType(item.type as string)
      const valueScore = normalizeValueScore(item.valueScore as number)
      const typeConfidence = normalizeConfidence(item.typeConfidence as number)
      const valueReason = typeof item.valueReason === 'string' ? item.valueReason : 'LLM 评估'
      const recommendedMethodologies = normalizeMethodologies(item.recommendedMethodologies, type)

      questions.push({
        question,
        type,
        typeConfidence,
        source: sourceObj,
        valueScore,
        valueReason,
        recommendedMethodologies,
      })
    }

    return questions
  } catch (err) {
    // 任何异常都降级为空数组，不让 UI 崩溃
    console.warn('[discoverQuestionsWithLLM] LLM 调用或解析失败：', err)
    return []
  }
}

// ============ LLM 辅助函数 ============

/**
 * 从 AI 返回文本中提取 JSON 字符串
 * 支持：纯 JSON、被 ```json ... ``` 包裹、被 ``` ... ``` 包裹
 */
function extractJsonFromText(text: string): string | null {
  const trimmed = text.trim()

  // 1. 直接尝试 parse
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed
  }

  // 2. 尝试去掉 markdown 代码块标记
  //    匹配 ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim()
  }

  // 3. 尝试从文本中找到第一个 { ... } 块
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1)
  }

  return null
}

/** 规范化问题类型 */
function normalizeQuestionType(type: string): QuestionType {
  if (type === 'conceptual' || type === 'methodological' || type === 'applied') {
    return type
  }
  // 默认归为概念型
  return 'conceptual'
}

/** 规范化价值评分（1-10 整数） */
function normalizeValueScore(score: number): number {
  if (typeof score !== 'number' || isNaN(score)) return 5
  return Math.max(1, Math.min(10, Math.round(score)))
}

/** 规范化置信度（0-1） */
function normalizeConfidence(conf: number): number {
  if (typeof conf !== 'number' || isNaN(conf)) return 0.7
  return Math.max(0, Math.min(1, conf))
}

/** 规范化方法论数组 */
function normalizeMethodologies(
  methods: unknown,
  type: QuestionType
): Methodology[] {
  const validMethods: Methodology[] = ['socratic', 'five-whys', 'first-principles']
  let result: Methodology[] = []

  if (Array.isArray(methods)) {
    result = methods.filter((m): m is Methodology =>
      typeof m === 'string' && validMethods.includes(m as Methodology)
    )
  }

  // 如果 AI 没给出有效方法论，按问题类型推荐
  if (result.length === 0) {
    result = validMethods.filter(m => MethodologyApplicableTypes[m].includes(type))
  }

  return result
}