/**
 * AMiner Daily Paper Skill
 * @description 每日论文推荐技能，根据兴趣主题获取最新论文
 * @module src/lib/aminer-daily-paper
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from './aminer-skill'
import type { AcademicSearchResult } from './aminer-academic-search'

// ============ 类型定义 ============

/**
 * 每日论文推荐参数
 */
export interface DailyPaperParams {
  /** 兴趣主题列表 */
  topics?: string[]
  /** 返回结果数量 */
  limit?: number
  /** 时间范围 (天) */
  days?: number
  /** 最低引用数阈值 */
  minCitations?: number
}

/**
 * 每日论文推荐响应
 */
export interface DailyPaperResponse {
  /** 论文列表 */
  papers: AcademicSearchResult[]
  /** 推荐主题 */
  topics: string[]
  /** 更新时间 */
  updatedAt: string
}

// ============ Skill实现 ============

/**
 * AMiner Daily Paper Skill
 * @description 提供每日论文推荐功能
 */
export class AminerDailyPaper extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'aminer-daily-paper'
  /** API端点 */
  private static readonly ENDPOINT = '/api/paper/daily'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(AminerDailyPaper.SKILL_NAME, AminerDailyPaper.ENDPOINT)
  }

  /**
   * 获取每日论文推荐
   * @param params 推荐参数
   * @param options 请求选项
   * @returns 推荐结果
   */
  async getDailyPapers(
    params: DailyPaperParams = {},
    options?: RequestOptions
  ): Promise<DailyPaperResponse> {
    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      limit: params.limit || 10
    }

    // 可选参数
    if (params.topics && params.topics.length > 0) {
      requestParams.topics = params.topics
    }
    if (params.days !== undefined) {
      requestParams.days = params.days
    }
    if (params.minCitations !== undefined) {
      requestParams.min_citations = params.minCitations
    }

    try {
      const response = await this.request<DailyPaperResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        papers: response.papers || [],
        topics: response.topics || [],
        updatedAt: response.updatedAt || new Date().toISOString()
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'DAILY_PAPER_FAILED',
        `获取每日论文推荐失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 根据主题获取推荐论文
   * @param topics 主题列表
   * @param limit 返回数量
   * @returns 论文列表
   */
  async getPapersByTopics(
    topics: string[],
    limit: number = 10
  ): Promise<AcademicSearchResult[]> {
    const response = await this.getDailyPapers({ topics, limit })
    return response.papers
  }

  /**
   * 获取最新论文（无主题过滤）
   * @param limit 返回数量
   * @returns 论文列表
   */
  async getLatestPapers(limit: number = 10): Promise<AcademicSearchResult[]> {
    const response = await this.getDailyPapers({ limit })
    return response.papers
  }

  /**
   * 获取高引用论文推荐
   * @param minCitations 最低引用数
   * @param limit 返回数量
   * @returns 论文列表
   */
  async getHighlyCitedPapers(
    minCitations: number = 50,
    limit: number = 10
  ): Promise<AcademicSearchResult[]> {
    const response = await this.getDailyPapers({
      minCitations,
      limit
    })
    return response.papers
  }
}

// ============ 工厂函数 ============

/**
 * 创建每日论文推荐Skill实例
 */
export function createDailyPaper(config: AminerConfig): AminerDailyPaper {
  return new AminerDailyPaper(config)
}