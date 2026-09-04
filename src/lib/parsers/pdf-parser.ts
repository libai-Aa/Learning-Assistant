/**
 * PDF解析器
 * 使用pdf-parse库提取PDF文本内容和元数据
 */

import fs from 'fs';
import { BaseParser, type FormatParser } from './parser-interface';
import type { ParseResult, ParseOptions } from '../../types/knowledge';

// pdf-parse的类型定义
interface PdfParseResult {
  text: string;
  pages: number;
  metadata: {
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  version: string;
}

// 动态导入pdf-parse
// 注意：pdf-parse 是 Node-only 依赖（依赖 fs），已从 dependencies 移除。
// 使用变量形式动态导入 + @vite-ignore，构建时不打包；运行时仅在 Node 环境可用，
// 浏览器环境由 parse() 的 fs.existsSync 守卫拦截，不会触发此导入。
async function importPdfParse(): Promise<(buffer: Buffer) => Promise<PdfParseResult>> {
  const moduleName = 'pdf-parse';
  const module = (await import(/* @vite-ignore */ moduleName)) as {
    default: unknown;
  };
  return module.default as unknown as (buffer: Buffer) => Promise<PdfParseResult>;
}

/**
 * PDF解析器
 */
export class PdfParser extends BaseParser implements FormatParser {
  readonly name = 'pdf-parser';
  readonly supportedExtensions = ['pdf'];
  readonly supportedMimeTypes = ['application/pdf'];

  async parse(filePath: string, _options?: ParseOptions): Promise<ParseResult> {
    const warnings: string[] = [];
    
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return this.createErrorResult(`文件不存在: ${filePath}`);
      }
      
      // 检查文件大小 (限制100MB)
      const stats = fs.statSync(filePath);
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (stats.size > maxSize) {
        warnings.push(`文件大小超过限制: ${stats.size} bytes > ${maxSize} bytes`);
      }
      
      // 读取文件
      const pdfBuffer = fs.readFileSync(filePath);
      
      // 动态导入并使用pdf-parse
      const pdfParse = await importPdfParse();
      const pdfData = await pdfParse(pdfBuffer);
      
      // 提取元数据
      const metadata: Record<string, unknown> = {
        pageCount: pdfData.pages,
        format: 'pdf',
      };
      
      // 提取PDF元数据
      if (pdfData.metadata) {
        const meta = pdfData.metadata as Record<string, unknown>;
        if (meta['pdft:title']) {
          metadata.title = meta['pdft:title'] as string;
        }
        if (meta['pdft:Author']) {
          metadata.author = meta['pdft:Author'] as string;
        }
        if (meta['pdft:Subject']) {
          metadata.description = meta['pdft:Subject'] as string;
        }
        if (meta['pdft:Creator']) {
          metadata.creator = meta['pdft:Creator'] as string;
        }
        if (meta['pdft:Producer']) {
          metadata.producer = meta['pdft:Producer'] as string;
        }
      }
      
      // 提取文本内容
      const text = pdfData.text || '';
      
      if (!text.trim()) {
        warnings.push('PDF文件未提取到文本内容，可能包含扫描图片');
      }
      
      return this.createSuccessResult(text, metadata, warnings.length > 0 ? warnings : undefined);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PdfParser] 解析失败: ${filePath}`, errorMessage);
      return this.createErrorResult(`PDF解析失败: ${errorMessage}`);
    }
  }
}

// 导出单例
export const pdfParser = new PdfParser();