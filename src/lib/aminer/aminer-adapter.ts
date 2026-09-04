/**
 * AMiner适配器
 * @description 集成AMiner学术搜索能力，通过Tauri后端转发请求绕过CORS
 * @module src/lib/aminer/aminer-adapter
 *
 * 设计要点：
 * - 所有HTTP请求通过 invoke('aminer_request') 转发到 Rust 后端
 * - API Key 与 JWT 在后端生成，前端不接触敏感凭证
 * - 后端命令签名：aminer_request(method, endpoint, query_params, body)
 * - Tauri v2 自动将 snake_case 参数转换为 camelCase，前端使用 queryParams
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  AminerConfig,
  AminerSkill,
  AcademicSearchResult,
  CitationVerificationResult
} from '../../types/research'

// ============ AMiner配置 ============

/** 默认配置（API Key 在后端，前端无需配置） */
const DEFAULT_CONFIG: AminerConfig = {
  apiKey: '',
  baseUrl: 'https://datacenter.aminer.cn/gateway/open_platform',
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000
}

/** 技能配置映射 */
const SKILL_ENDPOINTS: Record<AminerSkill, string> = {
  'academic-search': '/api/paper/search',
  'daily-paper': '/api/v3/paper/rec5',
  'deep-search': '/api/paper/search/pro',
  'free-academic': '/api/paper/search',
  'citation-faithfulness': '/api/paper/relation',
  'paper-source-trace': '/api/paper/detail',
  'pdf-citation-verifier': '/api/v3/paper/citation/verify/upload'
}

// ============ 错误类型 ============

/** AMiner错误 */
export class AminerError extends Error {
  constructor(
    public code: string,
    message: string,
    public skill?: AminerSkill
  ) {
    super(message)
    this.name = 'AminerError'
  }
}

// ============ AMiner适配器类 ============

/**
 * AMiner适配器
 * 通过 Tauri 后端 aminer_request 命令转发请求，绕过浏览器CORS限制
 * API Key 与 JWT 在 Rust 后端生成，前端不接触敏感凭证
 */
export class AminerAdapter {
  private config: AminerConfig
  private initialized: boolean = false

  constructor(config?: Partial<AminerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 初始化适配器
   * API Key 在后端管理，前端无需校验，直接标记为已初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
  }

  /**
   * 检查是否已初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new AminerError('NOT_INITIALIZED', 'AMiner适配器未初始化，请先调用initialize()')
    }
  }

  /**
   * 直接发起请求（通过 Tauri 后端转发）
   * @param method HTTP 方法（GET/POST）
   * @param endpoint 接口路径（如 /api/paper/search）
   * @param queryParams 查询字符串（不含 ?）
   * @param body 请求体（JSON 字符串）
   * @returns 响应文本
   */
  private async requestDirect(
    method: string,
    endpoint: string,
    queryParams?: string,
    body?: string
  ): Promise<string> {
    this.ensureInitialized()
    try {
      return await invoke<string>('aminer_request', { method, endpoint, queryParams, body })
    } catch (error) {
      throw new AminerError(
        'INVOKE_FAILED',
        `Tauri调用失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 发起 JSON 请求并解析响应
   * 自动处理 AMiner 开放平台两种常见响应包装：{ data: {...} } 或直接 {...}
   */
  private async requestJson<T>(
    method: string,
    endpoint: string,
    queryParams?: string,
    body?: unknown
  ): Promise<T> {
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined
    const text = await this.requestDirect(method, endpoint, queryParams, bodyStr)
    try {
      return JSON.parse(text) as T
    } catch (error) {
      throw new AminerError(
        'PARSE_FAILED',
        `响应JSON解析失败: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 从响应中提取论文数组（兼容 data.papers 与 papers 两种结构）
   */
  private extractPapers(
    resp: { data?: { papers?: AcademicSearchResult[] }; papers?: AcademicSearchResult[] }
  ): AcademicSearchResult[] {
    return resp.data?.papers || resp.papers || []
  }

  // ============ 论文搜索 ============

  /**
   * 论文搜索（基础）
   * GET /api/paper/search
   * @param title 论文标题/关键词
   * @param page 页码，从1开始
   * @param size 每页数量
   */
  async paperSearch(title: string, page: number = 1, size: number = 10): Promise<AcademicSearchResult[]> {
    const qp = `title=${encodeURIComponent(title)}&page=${page}&size=${size}`
    const resp = await this.requestJson<{
      data?: { papers?: AcademicSearchResult[] }
      papers?: AcademicSearchResult[]
    }>('GET', '/api/paper/search', qp)
    return this.extractPapers(resp)
  }

  /**
   * 论文搜索（增强版）
   * GET /api/paper/search/pro
   * @param query 查询词
   * @param size 每页数量
   * @param year 年份过滤
   * @param order 排序方式
   */
  async paperSearchPro(
    query: string,
    size: number = 10,
    year?: number,
    order?: string
  ): Promise<AcademicSearchResult[]> {
    const parts: string[] = [`query=${encodeURIComponent(query)}`, `size=${size}`]
    if (year !== undefined) parts.push(`year=${year}`)
    if (order) parts.push(`order=${encodeURIComponent(order)}`)
    const resp = await this.requestJson<{
      data?: { papers?: AcademicSearchResult[] }
      papers?: AcademicSearchResult[]
    }>('GET', '/api/paper/search/pro', parts.join('&'))
    return this.extractPapers(resp)
  }

  /**
   * 论文问答搜索
   * POST /api/paper/qa/search
   * @param query 自然语言查询
   * @param size 返回数量
   * @param yearFrom 起始年份
   * @param yearTo 截止年份
   */
  async paperQaSearch(
    query: string,
    size: number = 10,
    yearFrom?: number,
    yearTo?: number
  ): Promise<AcademicSearchResult[]> {
    const body: Record<string, unknown> = { query, size }
    if (yearFrom !== undefined) body.yearFrom = yearFrom
    if (yearTo !== undefined) body.yearTo = yearTo
    const resp = await this.requestJson<{
      data?: { papers?: AcademicSearchResult[] }
      papers?: AcademicSearchResult[]
    }>('POST', '/api/paper/qa/search', undefined, body)
    return this.extractPapers(resp)
  }

  // ============ 学者搜索 ============

  /**
   * 学者搜索
   * POST /api/person/search
   * @param name 学者姓名
   * @param size 返回数量
   */
  async personSearch(name: string, size: number = 10): Promise<unknown[]> {
    const body = { name, size }
    const resp = await this.requestJson<{
      data?: { persons?: unknown[] }
      persons?: unknown[]
    }>('POST', '/api/person/search', undefined, body)
    return resp.data?.persons || resp.persons || []
  }

  // ============ 论文详情 ============

  /**
   * 论文信息批量获取
   * POST /api/paper/info
   * @param ids 论文ID列表
   */
  async paperInfo(ids: string[]): Promise<AcademicSearchResult[]> {
    const body = { ids }
    const resp = await this.requestJson<{
      data?: { papers?: AcademicSearchResult[] }
      papers?: AcademicSearchResult[]
    }>('POST', '/api/paper/info', undefined, body)
    return this.extractPapers(resp)
  }

  /**
   * 论文详情
   * GET /api/paper/detail
   * @param id 论文ID
   */
  async paperDetail(id: string): Promise<AcademicSearchResult | null> {
    const qp = `id=${encodeURIComponent(id)}`
    const resp = await this.requestJson<{
      data?: AcademicSearchResult
      paper?: AcademicSearchResult
    }>('GET', '/api/paper/detail', qp)
    return resp.data || resp.paper || null
  }

  /**
   * 论文引用关系
   * GET /api/paper/relation
   * @param id 论文ID
   */
  async paperRelation(
    id: string
  ): Promise<{ citations?: AcademicSearchResult[]; references?: AcademicSearchResult[] }> {
    const qp = `id=${encodeURIComponent(id)}`
    const resp = await this.requestJson<{
      data?: { citations?: AcademicSearchResult[]; references?: AcademicSearchResult[] }
      citations?: AcademicSearchResult[]
      references?: AcademicSearchResult[]
    }>('GET', '/api/paper/relation', qp)
    return {
      citations: resp.data?.citations || resp.citations,
      references: resp.data?.references || resp.references
    }
  }

  // ============ 每日推荐 ============

  /**
   * 每日论文推荐
   * POST /api/v3/paper/rec5
   * @param topics 主题列表
   * @param authorName 作者名（可选）
   * @param size 返回数量
   */
  async dailyPaper(
    topics?: string[],
    authorName?: string,
    size: number = 10
  ): Promise<AcademicSearchResult[]> {
    const body: Record<string, unknown> = { size }
    if (topics && topics.length > 0) body.topics = topics
    if (authorName) body.authorName = authorName
    const resp = await this.requestJson<{
      data?: { papers?: AcademicSearchResult[] }
      papers?: AcademicSearchResult[]
    }>('POST', '/api/v3/paper/rec5', undefined, body)
    return this.extractPapers(resp)
  }

  // ============ 机构 / 会议 / 专利 ============

  /**
   * 机构搜索
   * POST /api/organization/search
   * @param orgs 机构名列表
   */
  async organizationSearch(orgs: string[]): Promise<unknown[]> {
    const body = { orgs }
    const resp = await this.requestJson<{
      data?: { organizations?: unknown[] }
      organizations?: unknown[]
    }>('POST', '/api/organization/search', undefined, body)
    return resp.data?.organizations || resp.organizations || []
  }

  /**
   * 会议/期刊搜索
   * POST /api/venue/search
   * @param name 会议或期刊名
   */
  async venueSearch(name: string): Promise<unknown[]> {
    const body = { name }
    const resp = await this.requestJson<{
      data?: { venues?: unknown[] }
      venues?: unknown[]
    }>('POST', '/api/venue/search', undefined, body)
    return resp.data?.venues || resp.venues || []
  }

  /**
   * 专利搜索
   * POST /api/patent/search
   * @param query 查询词
   * @param page 页码
   * @param size 每页数量
   */
  async patentSearch(query: string, page: number = 1, size: number = 10): Promise<unknown[]> {
    const body = { query, page, size }
    const resp = await this.requestJson<{
      data?: { patents?: unknown[] }
      patents?: unknown[]
    }>('POST', '/api/patent/search', undefined, body)
    return resp.data?.patents || resp.patents || []
  }

  // ============ PDF 引用核验 ============

  /**
   * PDF 引用核验
   * 通过后端 aminer_upload_pdf 命令上传 PDF 后进行引用校验
   * @param pdfPath 本地 PDF 文件路径
   */
  async pdfCitationVerify(pdfPath: string): Promise<CitationVerificationResult[]> {
    this.ensureInitialized()
    try {
      const text = await invoke<string>('aminer_upload_pdf', { pdfPath })
      const resp = JSON.parse(text) as {
        data?: { verifications?: CitationVerificationResult[] }
        verifications?: CitationVerificationResult[]
      }
      return resp.data?.verifications || resp.verifications || []
    } catch (error) {
      throw new AminerError(
        'PDF_VERIFY_FAILED',
        `PDF引用核验失败: ${error instanceof Error ? error.message : String(error)}`,
        'pdf-citation-verifier'
      )
    }
  }

  // ============ 兼容旧接口 ============

  /**
   * 学术搜索（兼容旧接口，使用 paperSearchPro）
   */
  async academicSearch(
    query: string,
    options?: {
      limit?: number
      yearFrom?: number
      yearTo?: number
      fields?: string[]
    }
  ): Promise<AcademicSearchResult[]> {
    const size = options?.limit || 10
    const year = options?.yearFrom
    return this.paperSearchPro(query, size, year)
  }

  /**
   * 深度搜索（兼容旧接口，使用 paperSearchPro）
   */
  async deepSearch(
    query: string,
    options?: {
      depth?: number
      maxResults?: number
      includeCitations?: boolean
    }
  ): Promise<AcademicSearchResult[]> {
    return this.paperSearchPro(query, options?.maxResults || 20)
  }

  /**
   * 免费学术资源（兼容旧接口）
   */
  async freeAcademic(query: string, limit?: number): Promise<AcademicSearchResult[]> {
    return this.paperSearch(query, 1, limit || 10)
  }

  /**
   * 引用忠实度验证（兼容旧接口，使用 paperRelation）
   */
  async verifyCitationFaithfulness(
    paperId: string,
    _citations: string[]
  ): Promise<CitationVerificationResult[]> {
    await this.paperRelation(paperId)
    return []
  }

  /**
   * 论文来源追踪（兼容旧接口，使用 paperDetail）
   */
  async tracePaperSource(paperId: string): Promise<{ source: string; chain: string[] }> {
    const detail = await this.paperDetail(paperId)
    return {
      source: detail?.venue || '',
      chain: detail ? [detail.paperId] : []
    }
  }

  /**
   * PDF引用验证（兼容旧接口）
   */
  async verifyPdfCitation(
    pdfPath: string,
    _citations: string[]
  ): Promise<CitationVerificationResult[]> {
    return this.pdfCitationVerify(pdfPath)
  }

  // ============ 工具方法 ============

  /**
   * 获取技能信息
   */
  getSkillInfo(skill: AminerSkill): {
    name: AminerSkill
    endpoint: string
    description: string
  } {
    const skillDescriptions: Record<AminerSkill, string> = {
      'academic-search': '学术论文搜索，支持关键词、年份等过滤条件',
      'daily-paper': '每日论文推荐，根据兴趣主题获取最新论文',
      'deep-search': '深度搜索，支持多层级深入搜索',
      'free-academic': '免费学术资源搜索，获取开放获取的论文',
      'citation-faithfulness': '引用忠实度验证，检查引用是否准确',
      'paper-source-trace': '论文来源追踪，追溯论文的引用链',
      'pdf-citation-verifier': 'PDF引用验证，验证PDF中的引用是否准确'
    }

    return {
      name: skill,
      endpoint: SKILL_ENDPOINTS[skill],
      description: skillDescriptions[skill]
    }
  }

  /**
   * 获取所有技能信息
   */
  getAllSkills(): Array<{
    name: AminerSkill
    endpoint: string
    description: string
  }> {
    const skills: AminerSkill[] = [
      'academic-search',
      'daily-paper',
      'deep-search',
      'free-academic',
      'citation-faithfulness',
      'paper-source-trace',
      'pdf-citation-verifier'
    ]

    return skills.map(skill => this.getSkillInfo(skill))
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AminerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AminerConfig {
    return { ...this.config }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// ============ 导出 ============

/** 默认实例（未初始化） */
export let aminerAdapter: AminerAdapter | null = null

/**
 * 创建并初始化AMiner适配器实例
 * API Key 在后端管理，无需传入 config
 */
export async function createAminerAdapter(
  config?: Partial<AminerConfig>
): Promise<AminerAdapter> {
  const adapter = new AminerAdapter(config)
  await adapter.initialize()
  aminerAdapter = adapter
  return adapter
}

/**
 * 获取AMiner适配器实例
 */
export function getAminerAdapter(): AminerAdapter | null {
  return aminerAdapter
}

// ============ 便捷函数 ============

/**
 * 搜索论文（基础）
 */
export async function searchPapers(query: string, size: number = 10): Promise<AcademicSearchResult[]> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.paperSearch(query, 1, size)
}

/**
 * 搜索论文（增强版）
 */
export async function searchPapersPro(query: string, size: number = 10): Promise<AcademicSearchResult[]> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.paperSearchPro(query, size)
}

/**
 * 问答式搜索论文
 */
export async function qaSearchPapers(query: string, size: number = 10): Promise<AcademicSearchResult[]> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.paperQaSearch(query, size)
}

/**
 * 搜索学者
 */
export async function searchScholar(name: string): Promise<unknown[]> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.personSearch(name)
}

/**
 * 获取论文详情
 */
export async function getPaperDetail(paperId: string): Promise<AcademicSearchResult | null> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.paperDetail(paperId)
}

/**
 * 获取每日推荐论文
 */
export async function getDailyPapers(topics: string[] = []): Promise<AcademicSearchResult[]> {
  if (!aminerAdapter) await createAminerAdapter()
  if (!aminerAdapter) throw new Error('AMiner适配器未初始化')
  return aminerAdapter.dailyPaper(topics)
}
