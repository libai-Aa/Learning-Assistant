/**
 * AMiner Academic Search Skill
 * @description 学术论文搜索技能，支持关键词、年份、领域等过滤条件
 * @module src/lib/aminer/aminer-academic-search
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from '../aminer-skill'

// ============ 类型定义 ============

/**
 * 学术搜索参数
 */
export interface AcademicSearchParams {
  /** 搜索关键词 */
  query: string
  /** 返回结果数量限制 */
  limit?: number
  /** 起始年份 */
  yearFrom?: number
  /** 结束年份 */
  yearTo?: number
  /** 领域/字段过滤 */
  fields?: string[]
  /** 作者过滤 */
  authors?: string[]
  /** 排序方式 */
  sortBy?: 'relevance' | 'year' | 'citations'
  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc'
}

/**
 * 学术搜索结果
 */
export interface AcademicSearchResult {
  /** 论文ID */
  paperId: string
  /** 标题 */
  title: string
  /** 作者列表 */
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
  /** 关键词 */
  keywords?: string[]
  /** 领域标签 */
  fields?: string[]
}

/**
 * 学术搜索响应
 */
export interface AcademicSearchResponse {
  /** 论文列表 */
  papers: AcademicSearchResult[]
  /** 总结果数 */
  total: number
  /** 搜索耗时 (ms) */
  took: number
}

// ============ Skill实现 ============

/**
 * AMiner Academic Search Skill
 * @description 提供学术论文搜索功能，支持论文、学者、机构、会议、专利等多类型检索
 */
export class AminerAcademicSearch extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'aminer-academic-search'
  /** API端点 */
  private static readonly ENDPOINT = '/api/search/academic'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(AminerAcademicSearch.SKILL_NAME, AminerAcademicSearch.ENDPOINT)
  }

  /**
   * 学术论文搜索
   * @param params 搜索参数
   * @param options 请求选项
   * @returns 搜索结果
   */
  async search(
    params: AcademicSearchParams,
    options?: RequestOptions
  ): Promise<AcademicSearchResponse> {
    // 参数验证
    if (!params.query || params.query.trim().length === 0) {
      throw new AminerError(
        'INVALID_QUERY',
        '搜索关键词不能为空',
        this.skillName
      )
    }

    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      query: params.query.trim(),
      limit: params.limit || 10,
      sort_by: params.sortBy || 'relevance',
      sort_order: params.sortOrder || 'desc'
    }

    // 可选参数
    if (params.yearFrom !== undefined) {
      requestParams.year_from = params.yearFrom
    }
    if (params.yearTo !== undefined) {
      requestParams.year_to = params.yearTo
    }
    if (params.fields && params.fields.length > 0) {
      requestParams.fields = params.fields
    }
    if (params.authors && params.authors.length > 0) {
      requestParams.authors = params.authors
    }

    try {
      const response = await this.request<AcademicSearchResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        papers: response.papers || [],
        total: response.total || 0,
        took: response.took || 0
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'SEARCH_FAILED',
        `学术搜索失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 快速搜索（简化版）
   * @param query 搜索关键词
   * @param limit 返回数量
   * @returns 搜索结果
   */
  async quickSearch(
    query: string,
    limit: number = 10
  ): Promise<AcademicSearchResult[]> {
    const response = await this.search({ query, limit })
    return response.papers
  }

  /**
   * 按年份搜索
   * @param query 搜索关键词
   * @param year 年份
   * @param limit 返回数量
   * @returns 搜索结果
   */
  async searchByYear(
    query: string,
    year: number,
    limit: number = 10
  ): Promise<AcademicSearchResult[]> {
    const response = await this.search({
      query,
      yearFrom: year,
      yearTo: year,
      limit
    })
    return response.papers
  }

  /**
   * 搜索特定领域的论文
   * @param query 搜索关键词
   * @param fields 领域列表
   * @param limit 返回数量
   * @returns 搜索结果
   */
  async searchByFields(
    query: string,
    fields: string[],
    limit: number = 10
  ): Promise<AcademicSearchResult[]> {
    const response = await this.search({
      query,
      fields,
      limit
    })
    return response.papers
  }
}

// ============ 工厂函数 ============

/**
 * 创建学术搜索Skill实例
 */
export function createAcademicSearch(config: AminerConfig): AminerAcademicSearch {
  return new AminerAcademicSearch(config)
}