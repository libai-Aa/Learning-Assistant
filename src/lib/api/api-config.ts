/**
 * LLM API 配置文件
 * 存储主备 API 信息，支持主备自动切换
 *
 * 说明：
 * - 主 API 使用 SenseNova 提供的 DeepSeek V4 Flash 模型
 * - 备用 API 使用 Agnes AI 提供的 Agnes 2.5 Flash 模型
 * - 两个 API 均兼容 OpenAI Chat Completions 协议格式
 * - API Key 直接硬编码（桌面应用，无需环境变量）
 */

/** 单个 API 配置项 */
export interface ApiConfig {
  /** 配置名称（用于 UI 展示） */
  name: string;
  /** Chat Completions 端点 URL */
  endpoint: string;
  /** API Key（Bearer Token） */
  apiKey: string;
  /** 默认调用的模型名 */
  model: string;
}

/** 主 API：SenseNova - DeepSeek V4 Flash */
export const PRIMARY_API: ApiConfig = {
  name: 'SenseNova (DeepSeek V4 Flash)',
  endpoint: 'https://token.sensenova.cn/v1/chat/completions',
  apiKey: 'sk-3BmtDs7nSYLladyCdRS4SbC8k88TGRUA',
  model: 'deepseek-v4-flash',
};

/** 备用 API：Agnes AI - Agnes 2.5 Flash */
export const FALLBACK_API: ApiConfig = {
  name: 'Agnes AI (Agnes 2.5 Flash)',
  endpoint: 'https://apihub.agnes-ai.cn/v1/chat/completions',
  apiKey: 'sk-B63b5hgctjUp4qZ69s7Z7jhLD1PZPpa32dbKY0Gbi0tBpk7z',
  model: 'agnes-2.5-flash',
};

/** 主备 API 列表（按优先级顺序） */
export const API_CHAIN: ApiConfig[] = [PRIMARY_API, FALLBACK_API];