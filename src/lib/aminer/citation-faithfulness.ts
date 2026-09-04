/**
 * AMiner Citation Faithfulness Skill
 * @description 引用忠实度检查技能，验证引用是否准确
 * @module src/lib/aminer/citation-faithfulness
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from '../aminer-skill'

// ============ 类型定义 ============

/**
 * 引用忠实度检查参数
 */
export interface CitationFaithfulnessParams {
  /** 论文ID */
  paperId: string
  /** 引用文本列表 */
  citations: string[]
  /** 检查深度 */
  checkDepth?: 'shallow' | 'deep' | 'comprehensive'
  /** 是否包含上下文分析 */
  includeContextAnalysis?: boolean
  /** 是否检查引用归属 */
  checkAttribution?: boolean
  /** 是否检查引用解释 */
  checkInterpretation?: boolean
}

/**
 * 引用验证结果
 */
export interface CitationVerificationResult {
  /** 引用ID */
  citationId: string
  /** 是否忠实 */
  isFaithful: boolean
  /** 置信度 (0-1) */
  confidence: number
  /** 问题类型 */
  issueType?: 'misattribution' | 'misinterpretation' | 'out_of_context' | 'none'
  /** 问题描述 */
  issues?: string[]
  /** 建议 */
  suggestions?: string[]
  /** 上下文分析 */
  contextAnalysis?: {
    /** 原上下文 */
    originalContext: string
    /** 引用上下文 */
    citationContext: string
    /** 相似度 (0-1) */
    similarity: number
  }
}

/**
 * 引用忠实度检查响应
 */
export interface CitationFaithfulnessResponse {
  /** 验证结果列表 */
  verifications: CitationVerificationResult[]
  /** 总体忠实度评分 (0-1) */
  overallFaithfulnessScore: number
  /** 检查耗时 (ms) */
  took: number
  /** 统计信息 */
  statistics: {
    totalCitations: number
    faithfulCount: number
    unfaithfulCount: number
    averageConfidence: number
  }
}

// ============ Skill实现 ============

/**
 * AMiner Citation Faithfulness Skill
 * @description 提供引用忠实度检查功能，检测引用是否准确归属、是否误读原文
 */
export class CitationFaithfulness extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'citation-faithfulness'
  /** API端点 */
  private static readonly ENDPOINT = '/api/verify/citation'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(CitationFaithfulness.SKILL_NAME, CitationFaithfulness.ENDPOINT)
  }

  /**
   * 检查引用忠实度
   * @param params 检查参数
   * @param options 请求选项
   * @returns 检查结果
   */
  async check(
    params: CitationFaithfulnessParams,
    options?: RequestOptions
  ): Promise<CitationFaithfulnessResponse> {
    // 参数验证
    if (!params.paperId || params.paperId.trim().length === 0) {
      throw new AminerError(
        'INVALID_PAPER_ID',
        '论文ID不能为空',
        this.skillName
      )
    }

    if (!params.citations || params.citations.length === 0) {
      throw new AminerError(
        'NO_CITATIONS',
        '引用列表不能为空',
        this.skillName
      )
    }

    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      paper_id: params.paperId,
      citations: params.citations,
      check_depth: params.checkDepth || 'deep',
      include_context: params.includeContextAnalysis !== false,
      check_attribution: params.checkAttribution !== false,
      check_interpretation: params.checkInterpretation !== false
    }

    try {
      const response = await this.request<CitationFaithfulnessResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        verifications: response.verifications || [],
        overallFaithfulnessScore: response.overallFaithfulnessScore || 0,
        took: response.took || 0,
        statistics: {
          totalCitations: response.statistics?.totalCitations || params.citations.length,
          faithfulCount: response.statistics?.faithfulCount || 0,
          unfaithfulCount: response.statistics?.unfaithfulCount || 0,
          averageConfidence: response.statistics?.averageConfidence || 0
        }
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'CITATION_CHECK_FAILED',
        `引用检查失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 快速检查单条引用
   * @param paperId 论文ID
   * @param citation 引用文本
   * @returns 验证结果
   */
  async checkSingleCitation(
    paperId: string,
    citation: string
  ): Promise<CitationVerificationResult> {
    const response = await this.check({
      paperId,
      citations: [citation]
    })

    return response.verifications[0]
  }

  /**
   * 批量检查引用
   * @param paperId 论文ID
   * @param citations 引用文本列表
   * @returns 检查结果列表
   */
  async checkMultipleCitations(
    paperId: string,
    citations: string[]
  ): Promise<CitationVerificationResult[]> {
    const response = await this.check({
      paperId,
      citations
    })

    return response.verifications
  }

  /**
   * 获取不忠实的引用
   * @param paperId 论文ID
   * @param citations 引用文本列表
   * @returns 不忠实的引用列表
   */
  async getUnfaithfulCitations(
    paperId: string,
    citations: string[]
  ): Promise<CitationVerificationResult[]> {
    const response = await this.check({
      paperId,
      citations
    })

    return response.verifications.filter(v => !v.isFaithful)
  }

  /**
   * 计算引用忠实度分数
   * @param paperId 论文ID
   * @param citations 引用文本列表
   * @returns 忠实度分数 (0-1)
   */
  async calculateFaithfulnessScore(
    paperId: string,
    citations: string[]
  ): Promise<number> {
    const response = await this.check({
      paperId,
      citations
    })

    return response.overallFaithfulnessScore
  }
}

// ============ 工厂函数 ============

/**
 * 创建引用忠实度检查Skill实例
 */
export function createCitationFaithfulness(config: AminerConfig): CitationFaithfulness {
  return new CitationFaithfulness(config)
}