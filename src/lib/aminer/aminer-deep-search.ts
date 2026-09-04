/**
 * AMiner Deep Search Skill
 * @description 深度搜索技能，支持多轮搜索、去重、引用扩展
 * @module src/lib/aminer/aminer-deep-search
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from '../aminer-skill'
import type { AcademicSearchResult } from './aminer-academic-search'

// ============ 类型定义 ============

/**
 * 深度搜索参数
 */
export interface DeepSearchParams {
  /** 搜索关键词 */
  query: string
  /** 搜索深度 (1-5) */
  depth?: number
  /** 最大结果数 */
  maxResults?: number
  /** 是否包含引用关系 */
  includeCitations?: boolean
  /** 是否包含参考文献 */
  includeReferences?: boolean
  /** 是否对结果去重 */
  deduplicate?: boolean
  /** 多轮搜索的轮数 */
  rounds?: number
  /** 时间范围 */
  yearRange?: {
    from: number
    to: number
  }
  /** 领域过滤 */
  fields?: string[]
}

/**
 * 深度搜索结果节点
 */
export interface DeepSearchNode {
  /** 论文信息 */
  paper: AcademicSearchResult
  /** 引用该论文的论文 */
  citations?: DeepSearchNode[]
  /** 该论文引用的论文 */
  references?: DeepSearchNode[]
  /** 搜索层级 */
  level: number
}

/**
 * 深度搜索响应
 */
export interface DeepSearchResponse {
  /** 搜索结果树 */
  resultTree: DeepSearchNode
  /** 总节点数 */
  totalNodes: number
  /** 搜索耗时 (ms) */
  took: number
  /** 搜索路径 */
  searchPath: string[]
  /** 去重后的论文数 */
  uniqueCount?: number
}

// ============ Skill实现 ============

/**
 * AMiner Deep Search Skill
 * @description 提供深度学术搜索功能，支持多轮搜索、去重、引用扩展
 */
export class AminerDeepSearch extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'aminer-deep-search'
  /** API端点 */
  private static readonly ENDPOINT = '/api/search/deep'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(AminerDeepSearch.SKILL_NAME, AminerDeepSearch.ENDPOINT)
  }

  /**
   * 深度搜索
   * @param params 搜索参数
   * @param options 请求选项
   * @returns 搜索结果
   */
  async search(
    params: DeepSearchParams,
    options?: RequestOptions
  ): Promise<DeepSearchResponse> {
    // 参数验证
    if (!params.query || params.query.trim().length === 0) {
      throw new AminerError(
        'INVALID_QUERY',
        '搜索关键词不能为空',
        this.skillName
      )
    }

    // 验证深度参数
    const depth = Math.min(Math.max(params.depth || 2, 1), 5)

    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      query: params.query.trim(),
      depth,
      max_results: params.maxResults || 20,
      include_citations: params.includeCitations !== false,
      include_references: params.includeReferences !== false,
      deduplicate: params.deduplicate !== false,
      rounds: params.rounds || 1
    }

    // 可选参数
    if (params.yearRange) {
      requestParams.year_from = params.yearRange.from
      requestParams.year_to = params.yearRange.to
    }
    if (params.fields && params.fields.length > 0) {
      requestParams.fields = params.fields
    }

    try {
      const response = await this.request<DeepSearchResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        resultTree: response.resultTree || {
          paper: {} as AcademicSearchResult,
          level: 0
        },
        totalNodes: response.totalNodes || 0,
        took: response.took || 0,
        searchPath: response.searchPath || [],
        uniqueCount: response.uniqueCount
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'DEEP_SEARCH_FAILED',
        `深度搜索失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 快速深度搜索（简化版）
   * @param query 搜索关键词
   * @param depth 搜索深度
   * @returns 论文列表
   */
  async quickSearch(
    query: string,
    depth: number = 2
  ): Promise<AcademicSearchResult[]> {
    const response = await this.search({ query, depth })
    return this.extractPapers(response.resultTree)
  }

  /**
   * 多轮搜索
   * @param query 搜索关键词
   * @param rounds 搜索轮数
   * @param depth 每轮搜索深度
   * @returns 累积搜索结果
   */
  async multiRoundSearch(
    query: string,
    rounds: number = 3,
    depth: number = 2
  ): Promise<AcademicSearchResult[]> {
    const response = await this.search({ query, rounds, depth, deduplicate: true })
    return this.extractPapers(response.resultTree)
  }

  /**
   * 从搜索树中提取所有论文
   * @param node 搜索树节点
   * @returns 论文列表
   */
  private extractPapers(node: DeepSearchNode): AcademicSearchResult[] {
    const papers: AcademicSearchResult[] = [node.paper]

    if (node.citations) {
      for (const citation of node.citations) {
        papers.push(...this.extractPapers(citation))
      }
    }

    if (node.references) {
      for (const reference of node.references) {
        papers.push(...this.extractPapers(reference))
      }
    }

    return papers
  }

  /**
   * 获取引用网络
   * @param query 搜索关键词
   * @param depth 搜索深度
   * @returns 引用网络图
   */
  async getCitationNetwork(
    query: string,
    depth: number = 2
  ): Promise<{
    nodes: AcademicSearchResult[]
    edges: Array<{ source: string; target: string; type: 'citation' | 'reference' }>
  }> {
    const response = await this.search({
      query,
      depth,
      includeCitations: true,
      includeReferences: true
    })

    const nodes: AcademicSearchResult[] = []
    const edges: Array<{ source: string; target: string; type: 'citation' | 'reference' }> = []

    this.extractNetwork(response.resultTree, nodes, edges)

    return { nodes, edges }
  }

  /**
   * 从搜索树中提取网络结构
   * @param node 搜索树节点
   * @param nodes 节点列表
   * @param edges 边列表
   */
  private extractNetwork(
    node: DeepSearchNode,
    nodes: AcademicSearchResult[],
    edges: Array<{ source: string; target: string; type: 'citation' | 'reference' }>
  ): void {
    nodes.push(node.paper)

    if (node.citations) {
      for (const citation of node.citations) {
        edges.push({
          source: citation.paper.paperId,
          target: node.paper.paperId,
          type: 'citation'
        })
        this.extractNetwork(citation, nodes, edges)
      }
    }

    if (node.references) {
      for (const reference of node.references) {
        edges.push({
          source: node.paper.paperId,
          target: reference.paper.paperId,
          type: 'reference'
        })
        this.extractNetwork(reference, nodes, edges)
      }
    }
  }
}

// ============ 工厂函数 ============

/**
 * 创建深度搜索Skill实例
 */
export function createDeepSearch(config: AminerConfig): AminerDeepSearch {
  return new AminerDeepSearch(config)
}