/**
 * AMiner Free Academic Skill
 * @description 免费学术API技能，提供论文、学者筛选与开放获取资源搜索
 * @module src/lib/aminer/aminer-free-academic
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from '../aminer-skill'
import type { AcademicSearchResult } from './aminer-academic-search'

// ============ 类型定义 ============

/**
 * 免费学术搜索参数
 */
export interface FreeAcademicParams {
  /** 搜索关键词 */
  query: string
  /** 返回结果数量 */
  limit?: number
  /** 是否只返回开放获取论文 */
  openAccessOnly?: boolean
  /** 数据源过滤 */
  sources?: string[]
  /** 时间范围 */
  yearRange?: {
    from: number
    to: number
  }
  /** 学者过滤 */
  scholarIds?: string[]
  /** 机构过滤 */
  affiliations?: string[]
  /** 最低引用数 */
  minCitations?: number
}

/**
 * 免费学术资源
 */
export interface FreeAcademicResource {
  /** 论文信息 */
  paper: AcademicSearchResult
  /** 开放获取链接 */
  openAccessUrl?: string
  /** PDF下载链接 */
  pdfUrl?: string
  /** 许可证类型 */
  license?: string
  /** 数据源 */
  source: string
}

/**
 * 学者信息
 */
export interface ScholarInfo {
  /** 学者ID */
  scholarId: string
  /** 姓名 */
  name: string
  /** 机构 */
  affiliation?: string
  /** 研究领域 */
  researchAreas?: string[]
  /** 论文数 */
  paperCount?: number
  /** 引用数 */
  citationCount?: number
  /** h-index */
  hIndex?: number
}

/**
 * 免费学术搜索响应
 */
export interface FreeAcademicResponse {
  /** 资源列表 */
  resources: FreeAcademicResource[]
  /** 总结果数 */
  total: number
  /** 开放获取比例 */
  openAccessRatio: number
}

/**
 * 学者筛选响应
 */
export interface ScholarFilterResponse {
  /** 学者列表 */
  scholars: ScholarInfo[]
  /** 总数 */
  total: number
}

// ============ Skill实现 ============

/**
 * AMiner Free Academic Skill
 * @description 提供免费学术资源搜索与学者筛选功能
 */
export class AminerFreeAcademic extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'aminer-free-academic'
  /** API端点 */
  private static readonly ENDPOINT = '/api/paper/free'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(AminerFreeAcademic.SKILL_NAME, AminerFreeAcademic.ENDPOINT)
  }

  /**
   * 搜索免费学术资源
   * @param params 搜索参数
   * @param options 请求选项
   * @returns 搜索结果
   */
  async search(
    params: FreeAcademicParams,
    options?: RequestOptions
  ): Promise<FreeAcademicResponse> {
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
      open_access_only: params.openAccessOnly !== false
    }

    // 可选参数
    if (params.sources && params.sources.length > 0) {
      requestParams.sources = params.sources
    }
    if (params.yearRange) {
      requestParams.year_from = params.yearRange.from
      requestParams.year_to = params.yearRange.to
    }
    if (params.scholarIds && params.scholarIds.length > 0) {
      requestParams.scholar_ids = params.scholarIds
    }
    if (params.affiliations && params.affiliations.length > 0) {
      requestParams.affiliations = params.affiliations
    }
    if (params.minCitations !== undefined) {
      requestParams.min_citations = params.minCitations
    }

    try {
      const response = await this.request<FreeAcademicResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        resources: response.resources || [],
        total: response.total || 0,
        openAccessRatio: response.openAccessRatio || 0
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'FREE_ACADEMIC_FAILED',
        `搜索免费学术资源失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 筛选学者
   * @param query 搜索关键词
   * @param filters 筛选条件
   * @param options 请求选项
   * @returns 学者列表
   */
  async filterScholars(
    query: string,
    filters?: {
      affiliations?: string[]
      researchAreas?: string[]
      minHIndex?: number
      limit?: number
    },
    options?: RequestOptions
  ): Promise<ScholarFilterResponse> {
    if (!query || query.trim().length === 0) {
      throw new AminerError(
        'INVALID_QUERY',
        '搜索关键词不能为空',
        this.skillName
      )
    }

    const requestParams: Record<string, unknown> = {
      query: query.trim(),
      type: 'scholar',
      limit: filters?.limit || 10
    }

    if (filters?.affiliations && filters.affiliations.length > 0) {
      requestParams.affiliations = filters.affiliations
    }
    if (filters?.researchAreas && filters.researchAreas.length > 0) {
      requestParams.research_areas = filters.researchAreas
    }
    if (filters?.minHIndex !== undefined) {
      requestParams.min_h_index = filters.minHIndex
    }

    try {
      const response = await this.request<ScholarFilterResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        scholars: response.scholars || [],
        total: response.total || 0
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'SCHOLAR_FILTER_FAILED',
        `学者筛选失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 只搜索开放获取论文
   * @param query 搜索关键词
   * @param limit 返回数量
   * @returns 资源列表
   */
  async searchOpenAccess(
    query: string,
    limit: number = 10
  ): Promise<FreeAcademicResource[]> {
    const response = await this.search({
      query,
      limit,
      openAccessOnly: true
    })
    return response.resources
  }

  /**
   * 获取PDF下载链接
   * @param query 搜索关键词
   * @param limit 返回数量
   * @returns 论文列表和PDF链接
   */
  async getPdfLinks(
    query: string,
    limit: number = 10
  ): Promise<Array<{ paper: AcademicSearchResult; pdfUrl: string }>> {
    const response = await this.search({
      query,
      limit,
      openAccessOnly: true
    })

    return response.resources
      .filter(r => r.pdfUrl)
      .map(r => ({
        paper: r.paper,
        pdfUrl: r.pdfUrl!
      }))
  }

  /**
   * 搜索特定数据源的论文
   * @param query 搜索关键词
   * @param sources 数据源列表
   * @param limit 返回数量
   * @returns 资源列表
   */
  async searchBySources(
    query: string,
    sources: string[],
    limit: number = 10
  ): Promise<FreeAcademicResource[]> {
    const response = await this.search({
      query,
      sources,
      limit
    })
    return response.resources
  }
}

// ============ 工厂函数 ============

/**
 * 创建免费学术搜索Skill实例
 */
export function createFreeAcademic(config: AminerConfig): AminerFreeAcademic {
  return new AminerFreeAcademic(config)
}