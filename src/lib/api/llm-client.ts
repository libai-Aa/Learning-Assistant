/**
 * LLM 客户端 - 支持主备 API 自动切换
 *
 * 工作原理（用大白话说）：
 * 1. 先用主 API 发请求；
 * 2. 如果主 API 出现任何问题（网络错误、超时、HTTP 非 2xx、返回数据格式不对），
 *    自动改用备用 API 重试一次；
 * 3. 如果备用 API 也失败，返回错误信息。
 *
 * 协议：兼容 OpenAI Chat Completions 格式
 *   请求体: { model, messages, temperature?, max_tokens? }
 *   响应体: { choices: [{ message: { role, content } }] }
 *
 * 注意：通过 Tauri 后端转发请求（llm_chat 命令），绕过浏览器 CORS 限制。
 */

import { invoke } from '@tauri-apps/api/core';
import { API_CHAIN, ApiConfig } from './api-config';

/** 对话消息（OpenAI 兼容格式） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 调用选项 */
export interface ChatOptions {
  /** 采样温度，默认 0.7 */
  temperature?: number;
  /** 最大生成 token 数 */
  maxTokens?: number;
  /** 单次请求超时（毫秒），默认 30000 */
  timeoutMs?: number;
}

/** chat() 返回结果 */
export interface ChatResult {
  /** AI 回复文本 */
  content: string;
  /** 实际使用的 API 名称 */
  apiUsed: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（失败时填充） */
  error?: string;
}

/** OpenAI 兼容响应体（仅取用到的字段） */
interface OpenAiChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
  }>;
}


/**
 * 用指定 API 配置发起一次 Chat Completions 请求
 * 失败时抛出 Error，由上层捕获并切换 API
 */
async function callOnce(
  api: ApiConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const { temperature = 0.7, maxTokens } = options;

  // 构造请求体
  const body = JSON.stringify({
    model: api.model,
    messages,
    temperature,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
  });

  // 通过 Tauri 后端转发请求，绕过 CORS
  const result = await invoke<string>('llm_chat', {
    endpoint: api.endpoint,
    apiKey: api.apiKey,
    body,
  });

  const data = JSON.parse(result) as OpenAiChatResponse;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('响应体缺少 choices[0].message.content');
  }
  return content;
}

/**
 * 发起对话请求，主备 API 自动切换
 *
 * @param messages 对话消息列表
 * @param options  调用选项
 * @returns ChatResult（始终 resolve，不抛异常，便于 UI 直接消费）
 */
export async function chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
  const errors: string[] = [];

  for (const api of API_CHAIN) {
    try {
      const content = await callOnce(api, messages, options);
      return { content, apiUsed: api.name, success: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${api.name}] ${msg}`);
      // 继续尝试下一个 API
    }
  }

  // 全部失败
  return {
    content: '',
    apiUsed: 'none',
    success: false,
    error: errors.join(' | '),
  };
}