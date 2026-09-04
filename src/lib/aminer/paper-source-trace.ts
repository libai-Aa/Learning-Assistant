/**
 * AMiner Paper Source Trace Skill
 * @description 论文溯源技能，追踪引用来源与传播路径
 * @module src/lib/aminer/paper-source-trace
 */

import { AminerSkillBase, AminerConfig, AminerError, RequestOptions } from '../aminer-skill'

// ============ 类型定义 ============

/**
 * 论文溯源参数
 */
export interface PaperSourceTraceParams {
  /** 论文ID */
  paperId: string
  /** 溯源深度 */
  depth?: number
  /** 溯源方向 */
  direction?: 'forward' | 'backward' | 'both'
  /** 是否包含论文详情 */
  includePaperDetails?: boolean
  /** 时间范围限制 */
  yearLimit?: {
    min: number
    max: number
  }
  /** 是否包含传播路径 */
  includePropagationPath?: boolean
}

/**
 * 溯源节点
 */
export interface TraceNode {
  /** 论文ID */
  paperId: string
  /** 论文标题 */
  title: string
  /** 年份 */
  year: number
  /** 作者 */
  authors: string[]
  /** 引用关系类型 */
  relationType: 'cites' | 'cited_by'
  /** 层级 */
  level: number
  /** 子节点 */
  children?: TraceNode[]
}

/**
 * 论文溯源响应
 */
export interface PaperSourceTraceResponse {
  /** 溯源链 */
  sourceChain: string[]
  /** 溯源树 */
  traceTree: TraceNode
  /** 总节点数 */
  totalNodes: number
  /** 最早年份 */
  earliestYear: number
  /** 最新年份 */
  latestYear: number
  /** 溯源耗时 (ms) */
  took: number
  /** 传播路径 */
  propagationPath?: string[]
}

// ============ Skill实现 ============

/**
 * AMiner Paper Source Trace Skill
 * @description 提供论文溯源功能，追踪引用来源与传播路径
 */
export class PaperSourceTrace extends AminerSkillBase {
  /** Skill名称 */
  private static readonly SKILL_NAME = 'paper-source-trace'
  /** API端点 */
  private static readonly ENDPOINT = '/api/paper/source'

  /**
   * 构造函数
   * @param config AMiner配置
   */
  constructor(config: AminerConfig) {
    super(config)
    this.setSkillInfo(PaperSourceTrace.SKILL_NAME, PaperSourceTrace.ENDPOINT)
  }

  /**
   * 追溯论文来源
   * @param params 溯源参数
   * @param options 请求选项
   * @returns 溯源结果
   */
  async trace(
    params: PaperSourceTraceParams,
    options?: RequestOptions
  ): Promise<PaperSourceTraceResponse> {
    // 参数验证
    if (!params.paperId || params.paperId.trim().length === 0) {
      throw new AminerError(
        'INVALID_PAPER_ID',
        '论文ID不能为空',
        this.skillName
      )
    }

    // 构建请求参数
    const requestParams: Record<string, unknown> = {
      paper_id: params.paperId,
      depth: params.depth || 3,
      direction: params.direction || 'backward',
      include_details: params.includePaperDetails !== false,
      include_propagation_path: params.includePropagationPath !== false
    }

    // 可选参数
    if (params.yearLimit) {
      requestParams.year_limit = params.yearLimit
    }

    try {
      const response = await this.request<PaperSourceTraceResponse>(
        'POST',
        requestParams,
        options
      )

      return {
        sourceChain: response.sourceChain || [],
        traceTree: response.traceTree || {
          paperId: params.paperId,
          title: '',
          year: 0,
          authors: [],
          relationType: 'cites',
          level: 0
        },
        totalNodes: response.totalNodes || 0,
        earliestYear: response.earliestYear || 0,
        latestYear: response.latestYear || 0,
        took: response.took || 0,
        propagationPath: response.propagationPath
      }
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      throw new AminerError(
        'TRACE_FAILED',
        `论文溯源失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 追溯引用链（向后追溯）
   * @param paperId 论文ID
   * @param depth 溯源深度
   * @returns 引用链
   */
  async traceCitations(
    paperId: string,
    depth: number = 3
  ): Promise<string[]> {
    const response = await this.trace({
      paperId,
      depth,
      direction: 'backward'
    })

    return response.sourceChain
  }

  /**
   * 追溯被引用链（向前追溯）
   * @param paperId 论文ID
   * @param depth 溯源深度
   * @returns 被引用链
   */
  async traceCitedBy(
    paperId: string,
    depth: number = 3
  ): Promise<string[]> {
    const response = await this.trace({
      paperId,
      depth,
      direction: 'forward'
    })

    return response.sourceChain
  }

  /**
   * 获取论文的源头
   * @param paperId 论文ID
   * @returns 源头论文ID
   */
  async getOriginPaper(paperId: string): Promise<string | null> {
    const response = await this.trace({
      paperId,
      depth: 10,
      direction: 'backward'
    })

    return response.sourceChain.length > 0
      ? response.sourceChain[response.sourceChain.length - 1]
      : null
  }

  /**
   * 获取论文的传播路径
   * @param paperId 论文ID
   * @param depth 溯源深度
   * @returns 传播路径
   */
  async getPropagationPath(
    paperId: string,
    depth: number = 5
  ): Promise<string[]> {
    const response = await this.trace({
      paperId,
      depth,
      direction: 'forward',
      includePropagationPath: true
    })

    return response.propagationPath || []
  }

  /**
   * 获取论文的影响范围
   * @param paperId 论文ID
   * @returns 影响统计
   */
  async getImpactScope(
    paperId: string
  ): Promise<{
    totalCitations: number
    totalCitedBy: number
    earliestYear: number
    latestYear: number
  }> {
    const [backward, forward] = await Promise.all([
      this.trace({ paperId, depth: 5, direction: 'backward' }),
      this.trace({ paperId, depth: 5, direction: 'forward' })
    ])

    return {
      totalCitations: backward.totalNodes,
      totalCitedBy: forward.totalNodes,
      earliestYear: backward.earliestYear,
      latestYear: forward.latestYear
    }
  }
}

// ============ 工厂函数 ============

/**
 * 创建论文溯源Skill实例
 */
export function createPaperSourceTrace(config: AminerConfig): PaperSourceTrace {
  return new PaperSourceTrace(config)
}