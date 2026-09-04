/**
 * 解析器测试
 */

import { describe, it, expect, vi } from 'vitest';
import { PdfParser } from '../parsers/pdf-parser';
import { DocxParser } from '../parsers/docx-parser';
import { WebParser } from '../read/web-fetcher';
import { ParserRegistry } from '../parsers/parser-interface';

// Mock fs
// 注意：pdf-parser.ts 使用 `import fs from 'fs'`（默认导入，访问 default.existsSync），
// 而测试用 `await import('fs')` 后访问 `fs.existsSync`（命名导出）。
// 因此命名导出与 default 中的引用必须是同一个 mock 函数，
// 否则测试中设置 ReturnValue 不会影响 pdf-parser 内部的调用。
vi.mock('fs', () => {
  const existsSync = vi.fn();
  const statSync = vi.fn();
  const readFileSync = vi.fn();
  return {
    default: { existsSync, statSync, readFileSync },
    existsSync,
    statSync,
    readFileSync,
  };
});

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

// Mock jsdom
vi.mock('jsdom', () => ({
  JSDOM: vi.fn(),
}));

// Mock @mozilla/readability
vi.mock('@mozilla/readability', () => ({
  default: vi.fn(),
}));

describe('PDF解析器', () => {
  const parser = new PdfParser();

  it('应该有正确的名称', () => {
    expect(parser.name).toBe('pdf-parser');
  });

  it('应该支持PDF扩展名', () => {
    expect(parser.supportedExtensions).toContain('pdf');
  });

  it('应该支持PDF MIME类型', () => {
    expect(parser.supportedMimeTypes).toContain('application/pdf');
  });

  it('应该正确识别PDF文件', () => {
    expect(parser.supports('/path/to/file.pdf')).toBe(true);
    expect(parser.supports('/path/to/file.pdf', 'application/pdf')).toBe(true);
    expect(parser.supports('/path/to/file.docx')).toBe(false);
  });

  describe('解析测试', () => {
    it('应该处理不存在的文件', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await parser.parse('/nonexistent/file.pdf');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });
  });
});

describe('DOCX解析器', () => {
  const parser = new DocxParser();

  it('应该有正确的名称', () => {
    expect(parser.name).toBe('docx-parser');
  });

  it('应该支持DOCX扩展名', () => {
    expect(parser.supportedExtensions).toContain('docx');
  });

  it('应该支持DOCX MIME类型', () => {
    expect(parser.supportedMimeTypes).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('应该正确识别DOCX文件', () => {
    expect(parser.supports('/path/to/file.docx')).toBe(true);
    expect(parser.supports('/path/to/file.doc')).toBe(true);
    expect(parser.supports('/path/to/file.pdf')).toBe(false);
  });
});

describe('网页解析器', () => {
  const parser = new WebParser();

  it('应该有正确的名称', () => {
    expect(parser.name).toBe('web-parser');
  });

  it('应该支持HTML扩展名', () => {
    expect(parser.supportedExtensions).toContain('html');
    expect(parser.supportedExtensions).toContain('htm');
  });

  it('应该支持URL', () => {
    expect(parser.supports('https://example.com')).toBe(true);
    expect(parser.supports('http://example.com')).toBe(true);
  });

  it('应该正确识别HTML文件', () => {
    expect(parser.supports('/path/to/file.html')).toBe(true);
    expect(parser.supports('/path/to/file.htm')).toBe(true);
  });
});

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  it('应该注册解析器', () => {
    const parser = new PdfParser();
    registry.register(parser);
    
    expect(registry.getParserByName('pdf-parser')).toBeDefined();
  });

  it('应该注销解析器', () => {
    const parser = new PdfParser();
    registry.register(parser);
    registry.unregister('pdf-parser');
    
    expect(registry.getParserByName('pdf-parser')).toBeNull();
  });

  it('应该查找合适的解析器', () => {
    const pdfParser = new PdfParser();
    const docxParser = new DocxParser();
    
    registry.register(pdfParser);
    registry.register(docxParser);
    
    expect(registry.getParser('/path/to/file.pdf')).toBe(pdfParser);
    expect(registry.getParser('/path/to/file.docx')).toBe(docxParser);
    expect(registry.getParser('/path/to/file.txt')).toBeNull();
  });

  it('应该返回所有解析器', () => {
    registry.register(new PdfParser());
    registry.register(new DocxParser());
    
    const parsers = registry.getAllParsers();
    expect(parsers.length).toBeGreaterThanOrEqual(2);
  });

  it('应该返回所有支持的扩展名', () => {
    registry.register(new PdfParser());
    registry.register(new DocxParser());
    
    const extensions = registry.getAllExtensions();
    expect(extensions).toContain('pdf');
    expect(extensions).toContain('docx');
  });
});