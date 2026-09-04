/**
 * 微信公众号链接解析器
 *
 * 微信公众号文章特点：
 * - URL格式：https://mp.weixin.qq.com/s/xxxxx 或 https://mp.weixin.qq.com/s?__biz=xxx&mid=xxx&idx=xxx&sn=xxx
 * - 标题在 #activity-name 元素中
 * - 正文在 #js_content 元素中
 * - 公众号名在 #js_name 元素中
 * - 发布时间在 #publish_time 元素中
 *
 * 实现策略：
 * 1. 使用浏览器内置 fetch 抓取 HTML（带 30 秒超时）
 * 2. 使用 DOMParser 解析 HTML，优先按微信专属选择器提取
 * 3. 若 #js_content 不存在，回退到 @mozilla/readability 通用正文提取
 *
 * 注：浏览器禁止手动设置 User-Agent 头，但 Tauri WebView 通常允许；
 * 此处仍尝试设置，被忽略时由 WebView 使用默认 UA。
 */

import { Readability } from '@mozilla/readability';
import { invoke } from '@tauri-apps/api/core';

/** 微信公众号文章解析结果 */
export interface WechatArticle {
  /** 文章标题 */
  title: string;
  /** 正文 HTML */
  content: string;
  /** 纯文本正文 */
  textContent: string;
  /** 公众号名称 */
  author: string;
  /** 发布时间 */
  publishTime: string;
  /** 原始 URL */
  url: string;
  /** 文章图片列表（data URI 或微信 CDN 链接） */
  images: string[];
}

/** 解析返回的统一封装 */
export interface WechatParseResult {
  success: boolean;
  data?: WechatArticle;
  error?: string;
}

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

/**
 * 微信公众号解析器
 *
 * 用法：
 *   if (WechatParser.isWechatUrl(url)) {
 *     const { success, data, error } = await WechatParser.parse(url);
 *   }
 */
export class WechatParser {
  /**
   * 判断 URL 是否为微信公众号链接
   * 兼容 /s/xxx 与 /s?__biz=... 两种形式
   */
  static isWechatUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return u.hostname === 'mp.weixin.qq.com' && u.pathname.startsWith('/s');
    } catch {
      return false;
    }
  }

  /**
   * 解析微信公众号文章
   * @param url 微信公众号文章链接
   * @param timeout 超时毫秒，默认 30000
   */
  static async parse(
    url: string,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<WechatParseResult> {
    if (!WechatParser.isWechatUrl(url)) {
      return { success: false, error: '不是微信公众号链接' };
    }

    // 抓取 HTML
    const fetchResult = await WechatParser.fetchHtml(url, timeout);
    if (!fetchResult.ok) {
      return { success: false, error: fetchResult.error };
    }

    // 解析 HTML
    return WechatParser.parseHtml(fetchResult.html, url);
  }

  /**
   * 抓取 HTML 文本
   * 返回判别联合类型，便于调用处类型收窄
   */
  private static async fetchHtml(
    url: string,
    _timeout: number
  ): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
    try {
      // 通过 Tauri 后端抓取，绕过浏览器 CORS 限制
      const html = await invoke<string>('fetch_url', { url });
      if (!html || html.length === 0) {
        return { ok: false, error: '返回内容为空' };
      }
      return { ok: true, html };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `请求失败: ${msg}` };
    }
  }

  /**
   * 解析 HTML 内容
   * 优先使用微信专属选择器，回退到 Readability
   */
  private static parseHtml(html: string, url: string): WechatParseResult {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');

      // 提取标题：#activity-name
      const titleEl = doc.querySelector('#activity-name');
      const title = titleEl?.textContent?.trim() || doc.title || '';

      // 提取公众号名：#js_name
      const authorEl = doc.querySelector('#js_name');
      const author = authorEl?.textContent?.trim() || '';

      // 提取发布时间：#publish_time
      const timeEl = doc.querySelector('#publish_time');
      const publishTime = timeEl?.textContent?.trim() || '';

      // 提取正文：#js_content
      const contentEl = doc.querySelector('#js_content');

      let content = '';
      let textContent = '';
      let images: string[] = [];

      if (contentEl) {
        // 收集图片（data URI 或微信 CDN 链接）
        contentEl.querySelectorAll('img').forEach((img) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src) images.push(src);
        });
        content = contentEl.innerHTML;
        textContent = contentEl.textContent?.trim() || '';
      } else {
        // 回退到 Readability 通用提取
        const reader = new Readability(doc);
        const article = reader.parse();
        if (article) {
          content = article.content || '';
          textContent = article.textContent || '';
          // Readability 提取后也尝试收集图片
          doc.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') || img.getAttribute('data-src');
            if (src) images.push(src);
          });
        }
      }

      if (!content && !textContent) {
        return { success: false, error: '未能提取到正文内容' };
      }

      const data: WechatArticle = {
        title,
        content,
        textContent,
        author,
        publishTime,
        url,
        images,
      };
      return { success: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `HTML 解析失败: ${msg}` };
    }
  }
}