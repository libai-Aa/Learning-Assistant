/**
 * AMiner PDF Citation Verifier Skill
 * @description PDF引用验证技能，验证PDF中的引用是否准确
 * @module src/lib/pdf-citation-verifier
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from './aminer-skill'

// ============ 类型定义 ============

/**
 * PDF引用验证参数
 */
export interface PdfCitationVerifierParams {
  /** PDF文件路径或URL */
  pdfPath: string
  /** 引用文本列表 */
  citations: string[]
  /** 验证深度 */
  verifyDepth?: 'shallow' | 'standard' | 'deep'
  /** 是否提取PDF文本 */
  extractText?: boolean
  /** 是否验证引用格式 */
  verifyFormat?: boolean
  /** 是否验证引用内容 */
  verifyContent?: boolean
}

/**
 * PDF引用验证结果
 */
export interface PdfCitationVerificationResult {
  /** 引用ID */
  citationId: string
  /** 是否验证通过 */
  isVerified: boolean
  /** 置信度 (0-1) */
  confidence: number
  /** 引用在PDF中的位置 */
  position?: {
    /** 页码 */
    page: number
    /** 起始位置 */
    start: number
    /** 结束位置 */
    end: number
  }
  /** 验证详情 */
  details?: {
    /** 格式验证结果 */
    formatCheck?: {
      isValid: boolean
      issues?: string[]
    }
    /** 内容验证结果 */
    contentCheck?: {
      isValid: boolean
      similarity?: number
      issues?: string[]
    }
    /** 上下文验证结果 */
    contextCheck?: {
      isValid: boolean
      context?: string
      issues?: string[]
    }
  }
  /** 建议 */
  suggestions?: string[]
}

/**
 * PDF引用验证响应
 */
export interface PdfCitationVerificationResponse {
  /** 验证结果列表 */
  verifications: PdfCitationVerificationResult[]
  /** 总体验证评分 (0-1) */
  overallVerificationScore: number
  /** PDF元数据 */
  pdfMetadata?: {
    /** 标题 */
    title: string
    /** 作者 */
    authors: string[]
    /** 页数 */
    pageCount: number
    /** 语言 */
    language: string
  }
  /** 验证耗时 (ms) */
  took: number
  /** 统计信息 */
  statistics: {
    totalCitations: number
    verifiedCount: number
    unverifiedCount: number
    averageConfidence: number
  }
}

// ============ Skill实现 ============

/**
 * AMiner PDF Citation Verifier Skill
 * @description 提供PDF引用验证功能
 */
export class PdfCitationVerifier extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'pdf-citation-verifier'
  /** API端点 */
  private static readonly ENDPOINT = '/api/verify/pdf'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(PdfCitationVerifier.SKILL_NAME, PdfCitationVerifier.ENDPOINT)
  }

  /**
   * 验证PDF引用
   * @param params 验证参数
   * @param options 请求选项
   * @returns 验证结果
   */
  async verify(
    params: PdfCitationVerifierParams,
    options?: RequestOptions
  ): Promise<PdfCitationVerificationResponse> {
    // 参数验证
    if (!params.pdfPath || params.pdfPath.trim().length === 0) {
      throw new AminerError(
        'INVALID_PDF_PATH',
        'PDF路径不能为空',
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
      pdf_path: params.pdfPath,
      citations: params.citations,
      verify_depth: params.verifyDepth || 'standard',
      extract_text: params.extractText !== false,
      verify_format: params.verifyFormat !== false,
      verify_content: params.verifyContent !== false
    }

    try {
      const response = await this.request<PdfCitationVerificationResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        verifications: response.verifications || [],
        overallVerificationScore: response.overallVerificationScore || 0,
        pdfMetadata: response.pdfMetadata,
        took: response.took || 0,
        statistics: {
          totalCitations: response.statistics?.totalCitations || params.citations.length,
          verifiedCount: response.statistics?.verifiedCount || 0,
          unverifiedCount: response.statistics?.unverifiedCount || 0,
          averageConfidence: response.statistics?.averageConfidence || 0
        }
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'VERIFICATION_FAILED',
        `PDF引用验证失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 快速验证单条引用
   * @param pdfPath PDF路径
   * @param citation 引用文本
   * @returns 验证结果
   */
  async verifySingleCitation(
    pdfPath: string,
    citation: string
  ): Promise<PdfCitationVerificationResult> {
    const response = await this.verify({
      pdfPath,
      citations: [citation]
    })

    return response.verifications[0]
  }

  /**
   * 批量验证PDF引用
   * @param pdfPath PDF路径
   * @param citations 引用文本列表
   * @returns 验证结果列表
   */
  async verifyMultipleCitations(
    pdfPath: string,
    citations: string[]
  ): Promise<PdfCitationVerificationResult[]> {
    const response = await this.verify({
      pdfPath,
      citations
    })

    return response.verifications
  }

  /**
   * 获取未通过验证的引用
   * @param pdfPath PDF路径
   * @param citations 引用文本列表
   * @returns 未通过验证的引用列表
   */
  async getUnverifiedCitations(
    pdfPath: string,
    citations: string[]
  ): Promise<PdfCitationVerificationResult[]> {
    const response = await this.verify({
      pdfPath,
      citations
    })

    return response.verifications.filter(v => !v.isVerified)
  }

  /**
   * 计算PDF引用验证分数
   * @param pdfPath PDF路径
   * @param citations 引用文本列表
   * @returns 验证分数 (0-1)
   */
  async calculateVerificationScore(
    pdfPath: string,
    citations: string[]
  ): Promise<number> {
    const response = await this.verify({
      pdfPath,
      citations
    })

    return response.overallVerificationScore
  }

  /**
   * 获取PDF元数据
   * @param pdfPath PDF路径
   * @param citations 可选的引用列表（如果为空，则不验证引用）
   * @returns PDF元数据
   */
  async getPdfMetadata(
    pdfPath: string,
    citations?: string[]
  ): Promise<PdfCitationVerificationResponse['pdfMetadata']> {
    const response = await this.verify({
      pdfPath,
      citations: citations || [], // 不验证引用，只获取元数据
      extractText: false
    })

    return response.pdfMetadata ?? undefined
  }
}

// ============ 工厂函数 ============

/**
 * 创建PDF引用验证Skill实例
 */
export function createPdfCitationVerifier(config: AminerConfig): PdfCitationVerifier {
  return new PdfCitationVerifier(config)
}