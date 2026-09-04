/**
 * DOCX解析器
 * 使用mammoth库提取Word文档文本内容和元数据
 */

import fs from 'fs';
import path from 'path';
import { BaseParser, type FormatParser } from './parser-interface';
import type { ParseResult, ParseOptions } from '../../types/knowledge';

// 动态导入mammoth
async function importMammoth(): Promise<typeof import('mammoth')> {
  const module = await import('mammoth');
  return module;
}

/**
 * DOCX解析器
 */
export class DocxParser extends BaseParser implements FormatParser {
  readonly name = 'docx-parser';
  readonly supportedExtensions = ['docx', 'doc'];
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

  async parse(filePath: string, _options?: ParseOptions): Promise<ParseResult> {
    const warnings: string[] = [];
    
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return this.createErrorResult(`文件不存在: ${filePath}`);
      }
      
      // 检查文件大小 (限制100MB)
      const stats = fs.statSync(filePath);
      const maxSize = 100 * 1024 * 1024;
      if (stats.size > maxSize) {
        warnings.push(`文件大小超过限制: ${stats.size} bytes > ${maxSize} bytes`);
      }
      
      // 动态导入并使用mammoth
      const mammoth = await importMammoth();
      const result = await mammoth.extractRawText({ path: filePath });
      
      // 处理消息
      if (result.messages && result.messages.length > 0) {
        result.messages.forEach(msg => {
          warnings.push(`[${msg.type}] ${msg.message}`);
        });
      }
      
      // 提取元数据
      const metadata: Record<string, unknown> = {
        format: 'docx',
      };
      
      // 尝试从文件名提取标题
      const fileName = path.basename(filePath, '.docx');
      metadata.title = fileName;
      
      // 提取文本内容
      const text = result.value || '';
      
      if (!text.trim()) {
        warnings.push('DOCX文件未提取到文本内容');
      }
      
      return this.createSuccessResult(text, metadata, warnings.length > 0 ? warnings : undefined);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DocxParser] 解析失败: ${filePath}`, errorMessage);
      return this.createErrorResult(`DOCX解析失败: ${errorMessage}`);
    }
  }
}

// 导出单例
export const docxParser = new DocxParser();