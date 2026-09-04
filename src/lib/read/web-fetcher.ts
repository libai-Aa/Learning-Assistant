/**
 * 网页抓取器
 * 使用DOMParser/Readability提取网页正文
 */

import https from 'https';
import http from 'http';
import { BaseParser, type FormatParser } from '../parsers/parser-interface';
import type { ParseResult, ParseOptions } from '../../types/knowledge';

// 定义Readable接口
interface ReadableArticle {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline: string;
  dir: string;
  siteName: string;
  lang: string;
  publishedTime: string;
}

// 动态导入Readability
async function importReadability(): Promise<typeof import('@mozilla/readability')> {
  const module = await import('@mozilla/readability');
  return module;
}


/**
 * 网页抓取选项
 */
export interface WebFetchOptions {
  /** 超时时间 (毫秒) */
  timeout?: number;
  /** 是否提取图片 */
  extractImages?: boolean;
  /** User-Agent */
  userAgent?: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
}

/**
 * 网页抓取结果
 */
export interface WebFetchResult {
  /** 是否成功 */
  success: boolean;
  /** 网页标题 */
  title: string;
  /** 正文内容 (HTML) */
  content: string;
  /** 纯文本内容 */
  textContent: string;
  /** 网页元数据 */
  metadata: {
    url: string;
    description?: string;
    author?: string;
    publishedTime?: string;
    siteName?: string;
    lang?: string;
    imageUrl?: string;
    links?: string[];
    images?: string[];
  };
  /** 警告信息 */
  warnings?: string[];
  /** 错误信息 */
  error?: string;
}

/**
 * 网页解析器
 * 用于解析网页URL和HTML内容
 */
export class WebParser extends BaseParser implements FormatParser {
  readonly name = 'web-parser';
  readonly supportedExtensions = ['html', 'htm', 'url'];
  readonly supportedMimeTypes = [
    'text/html',
    'application/xhtml+xml',
    'text/plain'
  ];

  /**
   * 检查是否支持
   * URL也视为支持
   */
  supports(filePath: string, mimeType?: string): boolean {
    // 支持URL格式
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return true;
    }
    // 检查扩展名
    if (this.supportedExtensions.includes(this.getFileExtension(filePath))) {
      return true;
    }
    // 检查MIME类型
    if (mimeType && this.supportedMimeTypes.includes(mimeType)) {
      return true;
    }
    return false;
  }

  async parse(
    filePath: string,
    options?: ParseOptions
  ): Promise<ParseResult> {
    const warnings: string[] = [];
    
    try {
      let html: string;
      let baseUrl: string;
      
      // 如果是URL，抓取网页
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        const fetchResult = await this.fetchUrl(filePath, options as WebFetchOptions);
        if (!fetchResult.success) {
          return this.createErrorResult(fetchResult.error || '网页抓取失败');
        }
        html = fetchResult.content ?? '';
        baseUrl = filePath;
        warnings.push(...(fetchResult.warnings || []));
      } else {
        // 否则读取本地HTML文件
        const fs = await import('fs');
        if (!fs.existsSync(filePath)) {
          return this.createErrorResult(`文件不存在: ${filePath}`);
        }
        html = fs.readFileSync(filePath, 'utf-8');
        baseUrl = `file://${filePath}`;
      }
      
      // 解析HTML
      const parseResult = await this.parseHtml(html, baseUrl, options as WebFetchOptions);
      
      if (!parseResult.success) {
        return this.createErrorResult(parseResult.error || 'HTML解析失败');
      }
      
      // 构建元数据
      const metadata: Record<string, unknown> = {
        format: 'html',
        url: parseResult.metadata.url,
        title: parseResult.title,
        author: parseResult.metadata.author,
        publishedTime: parseResult.metadata.publishedTime,
        siteName: parseResult.metadata.siteName,
        description: parseResult.metadata.description,
        links: parseResult.metadata.links,
        images: parseResult.metadata.images,
      };
      
      // 构建内容
      const content = parseResult.textContent || parseResult.content;
      
      if (!content.trim()) {
        warnings.push('网页未提取到有效内容');
      }
      
      return this.createSuccessResult(content, metadata, warnings.length > 0 ? warnings : undefined);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WebParser] 解析失败: ${filePath}`, errorMessage);
      return this.createErrorResult(`网页解析失败: ${errorMessage}`);
    }
  }
  
  /**
   * 抓取URL
   */
  private async fetchUrl(
    url: string,
    options?: WebFetchOptions
  ): Promise<{ success: boolean; content?: string; warnings?: string[]; error?: string }> {
    const warnings: string[] = [];
    const timeout = options?.timeout || 30000;
    const userAgent = options?.userAgent || 'Mozilla/5.0 (compatible; llm-wiki/1.0)';
    
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...options?.headers,
        },
        timeout,
      }, (res) => {
        // 处理重定向
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this.fetchUrl(res.headers.location, options));
          return;
        }
        
        if (res.statusCode && res.statusCode >= 400) {
          resolve({
            success: false,
            error: `HTTP错误: ${res.statusCode} ${res.statusMessage}`,
          });
          return;
        }
        
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ success: true, content: data, warnings });
        });
      });
      
      req.on('error', (err) => {
        resolve({
          success: false,
          error: `请求失败: ${err.message}`,
        });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: `请求超时: ${timeout}ms`,
        });
      });
    });
  }
  
  /**
   * 解析HTML内容
   */
  private async parseHtml(
    html: string,
    baseUrl: string,
    options?: WebFetchOptions
  ): Promise<WebFetchResult> {
    try {
      // 使用浏览器原生 DOMParser 解析（替代 JSDOM，移除 Node-only 依赖）
      const document = new DOMParser().parseFromString(html, 'text/html');
      
      // 使用Readability提取正文
      const { Readability } = await importReadability();
      const reader = new Readability(document);
      const article = reader.parse() as ReadableArticle | null;
      
      if (!article) {
        return {
          success: false,
          title: '',
          content: '',
          textContent: '',
          metadata: { url: baseUrl },
          error: '无法解析网页内容',
        };
      }
      
      // 提取链接
      const links: string[] = [];
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (href && href.startsWith('http')) {
          links.push(href);
        }
      });
      
      // 提取图片
      const images: string[] = [];
      if (options?.extractImages) {
        document.querySelectorAll('img[src]').forEach((img) => {
          const src = img.getAttribute('src');
          if (src) {
            images.push(src);
          }
        });
      }
      
      return {
        success: true,
        title: article.title || '',
        content: article.content || '',
        textContent: article.textContent || '',
        metadata: {
          url: baseUrl,
          description: article.excerpt,
          author: article.byline,
          publishedTime: article.publishedTime,
          siteName: article.siteName,
          lang: article.lang || document.documentElement.lang,
          links,
          images,
        },
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[WebParser] HTML解析失败:`, errorMessage);
      return {
        success: false,
        title: '',
        content: '',
        textContent: '',
        metadata: { url: baseUrl },
        error: `HTML解析失败: ${errorMessage}`,
      };
    }
  }
}

// 导出单例
export const webParser = new WebParser();