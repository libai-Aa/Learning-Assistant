/**
 * AMiner Skill基类
 * @description 所有AMiner Skill的基类，提供Token管理、HTTP请求、错误处理等核心功能
 * @module src/lib/aminer-skill
 * @description JWT 签名已在 Rust 后端 aminer_request 命令中完成（HS256 + API Key），
 *              前端不再生成 Token，Authorization 由后端注入。
 */

// ============ 类型定义 ============

/**
 * AMiner配置接口
 */
export interface AminerConfig {
  /** API Key */
  apiKey: string
  /** 基础URL */
  baseUrl?: string
  /** 超时时间 (ms) */
  timeout?: number
  /** 最大重试次数 */
  maxRetries?: number
  /** 重试间隔 (ms) */
  retryDelay?: number
  /** Token有效期 (秒) */
  tokenExpiry?: number
}

/**
 * AMiner错误类型
 */
export class AminerError extends Error {
  constructor(
    public code: string,
    message: string,
    public skill?: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message)
    this.name = 'AminerError'
  }
}

/**
 * HTTP请求方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * 请求选项
 */
export interface RequestOptions {
  /** 超时时间 (ms) */
  timeout?: number
  /** 重试次数 */
  retries?: number
  /** 是否使用Token认证 */
  useTokenAuth?: boolean
  /** 自定义请求头 */
  headers?: Record<string, string>
}

/**
 * 响应数据包装
 */
export interface AminerResponse<T> {
  /** 是否成功 */
  success: boolean
  /** 数据 */
  data?: T
  /** 错误信息 */
  error?: {
    code: string
    message: string
    details?: unknown
  }
  /** 请求ID */
  requestId?: string
}

/**
 * Skill基类配置
 */
export interface SkillConfig {
  /** API Key */
  apiKey: string
  /** 基础URL */
  baseUrl?: string
  /** Skill名称 */
  skillName: string
  /** Skill端点 */
  endpoint: string
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: Required<AminerConfig> = {
  apiKey: '',
  baseUrl: 'https://api.aminer.cn',
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  tokenExpiry: 7200 // 2小时
}

// ============ AMiner Skill基类 ============

/**
 * AMiner Skill基类
 * @description 提供所有AMiner Skill的通用功能
 */
export abstract class AminerSkillBase {
  protected config: Required<AminerConfig>
  protected skillName: string
  protected endpoint: string


  /**
   * 构造函数
   * @param config Skill配置
   */
  constructor(config: AminerConfig) {
    if (!config.apiKey) {
      throw new AminerError('NO_API_KEY', 'AMiner API Key未配置')
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    }

    // 子类必须设置这些属性
    this.skillName = ''
    this.endpoint = ''
  }

  /**
   * 设置Skill信息（子类必须在构造函数中调用）
   */
  protected setSkillInfo(skillName: string, endpoint: string): void {
    this.skillName = skillName
    this.endpoint = endpoint
  }

  /**
   * 生成JWT Token（已废弃）
   * @description JWT 签名已移至 Rust 后端 aminer_request 命令（HS256 + API Key），
   *              前端统一返回空字符串，请求时由后端注入 Authorization。
   * @returns 空字符串
   */
  protected generateToken(): string {
    return ''
  }

  /**
   * 发起HTTP请求
   * @param method HTTP方法
   * @param params 请求参数
   * @param options 请求选项
   * @returns 响应数据
   */
  protected async request<T>(
    method: HttpMethod,
    params: Record<string, unknown> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    const timeout = options.timeout || this.config.timeout
    const maxRetries = options.retries ?? this.config.maxRetries
    const useTokenAuth = options.useTokenAuth ?? true

    const url = `${this.config.baseUrl}${this.endpoint}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers
    }

    // 添加Token认证（Token由 Rust 后端 aminer_request 命令签名注入，前端为空时不设置）
    const token = useTokenAuth ? this.generateToken() : ''
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal
        }

        if (method === 'GET') {
          const queryString = new URLSearchParams(params as Record<string, string>).toString()
          const fullUrl = queryString ? `${url}?${queryString}` : url
          clearTimeout(timeoutId)
          
          const response = await fetch(fullUrl, fetchOptions)
          return await this.handleResponse<T>(response)
        } else {
          fetchOptions.body = JSON.stringify(params)
          clearTimeout(timeoutId)
          
          const response = await fetch(url, fetchOptions)
          return await this.handleResponse<T>(response)
        }
      } catch (error) {
        lastError = error as Error
        
        // 检查是否是限流错误
        if (error instanceof AminerError && error.code === 'RATE_LIMITED') {
          const retryAfter = this.config.retryDelay * attempt
          await this.delay(retryAfter)
          continue
        }

        // 其他错误等待后重试
        if (attempt < maxRetries) {
          await this.delay(this.config.retryDelay)
        }
      }
    }

    throw new AminerError(
      'REQUEST_FAILED',
      `请求失败 (尝试${maxRetries}次): ${lastError?.message || '未知错误'}`,
      this.skillName
    )
  }

  /**
   * 处理HTTP响应
   * @param response Fetch响应对象
   * @returns 解析后的数据
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      let errorDetails: unknown = null

      try {
        const errorData = await response.json()
        errorMessage = errorData.message || errorMessage
        errorDetails = errorData.details
      } catch {
        // 如果响应不是JSON，使用默认错误消息
      }

      if (response.status === 429) {
        throw new AminerError(
          'RATE_LIMITED',
          '请求频率超限，请稍后重试',
          this.skillName,
          response.status
        )
      }

      if (response.status === 401) {
        throw new AminerError(
          'UNAUTHORIZED',
          '认证失败，请检查API Key',
          this.skillName,
          response.status
        )
      }

      throw new AminerError(
        `HTTP_${response.status}`,
        errorMessage,
        this.skillName,
        response.status,
        errorDetails
      )
    }

    try {
      const data: AminerResponse<T> = await response.json()
      
      if (!data.success) {
        throw new AminerError(
          data.error?.code || 'API_ERROR',
          data.error?.message || 'API返回错误',
          this.skillName,
          response.status,
          data.error?.details
        )
      }

      return data.data as T
    } catch (error) {
      if (error instanceof AminerError) {
        throw error
      }
      
      throw new AminerError(
        'RESPONSE_PARSE_ERROR',
        `响应解析失败: ${error}`,
        this.skillName
      )
    }
  }

  /**
   * 延迟函数
   * @param ms 延迟毫秒数
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取Skill信息
   */
  getSkillInfo(): {
    name: string
    endpoint: string
  } {
    return {
      name: this.skillName,
      endpoint: this.endpoint
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AminerConfig>): void {
    this.config = {
      ...this.config,
      ...config
    }

  }

  /**
   * 获取当前配置
   */
  getConfig(): Required<AminerConfig> {
    return { ...this.config }
  }
}

// ============ 导出 ============
