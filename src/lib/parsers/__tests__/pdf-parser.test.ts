/**
 * PDF解析器测试
 * @module src/lib/parsers/__tests__/pdf-parser.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfParser } from '../pdf-parser';
import fs from 'fs';

// Mock fs模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

describe('PdfParser', () => {
  let parser: PdfParser;

  beforeEach(() => {
    parser = new PdfParser();
    vi.clearAllMocks();
  });

  describe('基本属性', () => {
    it('应该有正确的名称', () => {
      expect(parser.name).toBe('pdf-parser');
    });

    it('应该支持PDF扩展名', () => {
      expect(parser.supportedExtensions).toContain('pdf');
      expect(parser.supportedExtensions).toHaveLength(1);
    });

    it('应该支持PDF MIME类型', () => {
      expect(parser.supportedMimeTypes).toContain('application/pdf');
      expect(parser.supportedMimeTypes).toHaveLength(1);
    });

    it('应该正确识别PDF文件', () => {
      expect(parser.supports('/path/to/file.pdf')).toBe(true);
      expect(parser.supports('/path/to/file.pdf', 'application/pdf')).toBe(true);
      expect(parser.supports('/path/to/file.docx')).toBe(false);
      expect(parser.supports('/path/to/file.txt')).toBe(false);
    });
  });

  describe('parse方法', () => {
    it('应该成功解析PDF文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 50, // 50KB
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake pdf content'));

      // Mock pdf-parse返回模拟数据
      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '这是PDF文件的文本内容',
        pages: 5,
        metadata: {
          'pdft:title': '测试文档',
          'pdft:Author': '测试作者',
          'pdft:Subject': '测试主题',
        },
        version: '1.0',
      });

      const result = await parser.parse('/test/test.pdf');

      expect(result.success).toBe(true);
      expect(result.content).toBe('这是PDF文件的文本内容');
      expect(result.metadata?.pageCount).toBe(5);
      expect(result.metadata?.title).toBe('测试文档');
      expect(result.metadata?.author).toBe('测试作者');
    });

    it('应该处理不存在的文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(false);

      const result = await parser.parse('/nonexistent/file.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });

    it('应该处理超大文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 150 * 1024 * 1024, // 150MB，超过100MB限制
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '内容',
        pages: 1,
        metadata: {},
        version: '1.0',
      });

      const result = await parser.parse('/test/large.pdf');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
      expect(result.warnings?.[0]).toContain('文件大小超过限制');
    });

    it('应该处理空PDF文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '',
        pages: 0,
        metadata: {},
        version: '1.0',
      });

      const result = await parser.parse('/test/empty.pdf');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('未提取到文本内容'))).toBe(true);
    });

    it('应该处理解析错误', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockRejectedValue(new Error('PDF解析失败：文件损坏'));

      const result = await parser.parse('/test/corrupted.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF解析失败');
    });

    it('应该提取完整的元数据', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 100,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '测试内容',
        pages: 10,
        metadata: {
          'pdft:title': '完整测试文档',
          'pdft:Author': '张三',
          'pdft:Subject': '这是一个测试文档',
          'pdft:Creator': 'Test Creator',
          'pdft:Producer': 'Test Producer',
        },
        version: '1.0',
      });

      const result = await parser.parse('/test/full-metadata.pdf');

      expect(result.success).toBe(true);
      expect(result.metadata?.pageCount).toBe(10);
      expect(result.metadata?.title).toBe('完整测试文档');
      expect(result.metadata?.author).toBe('张三');
      expect(result.metadata?.description).toBe('这是一个测试文档');
      expect(result.metadata?.creator).toBe('Test Creator');
      expect(result.metadata?.producer).toBe('Test Producer');
    });

    it('应该处理扫描版PDF（无文本）', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 500,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '', // 扫描版PDF没有文本
        pages: 20,
        metadata: {},
        version: '1.0',
      });

      const result = await parser.parse('/test/scanned.pdf');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('扫描图片'))).toBe(true);
    });

    it('应该处理包含空白字符的PDF文本', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '   \n\n   测试内容   \n\n   ',
        pages: 1,
        metadata: {},
        version: '1.0',
      });

      const result = await parser.parse('/test/whitespace.pdf');

      expect(result.success).toBe(true);
      expect(result.content).toBe('   \n\n   测试内容   \n\n   ');
    });
  });

  describe('错误处理', () => {
    it('应该处理文件系统错误', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      
      // 模拟statSync抛出错误
      fsMock.statSync.mockImplementation(() => {
        throw new Error('权限被拒绝');
      });

      const result = await parser.parse('/test/protected.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('PDF解析失败');
    });

    it('应该处理内存不足错误', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockRejectedValue(new Error('内存不足'));

      const result = await parser.parse('/test/large.pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('内存不足');
    });
  });

  describe('边界条件', () => {
    it('应该处理最小文件大小', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1, // 1字节
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('x'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '小文件',
        pages: 1,
        metadata: {},
        version: '1.0',
      });

      const result = await parser.parse('/test/tiny.pdf');

      expect(result.success).toBe(true);
    });

    it('应该处理特殊字符的PDF', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      fsMock.readFileSync.mockReturnValue(Buffer.from('fake content'));

      const mockPdfParse = vi.mocked((await import('pdf-parse')).default);
      mockPdfParse.mockResolvedValue({
        text: '特殊字符：中文测试 © ® ™ € £ ¥',
        pages: 1,
        metadata: {
          'pdft:title': '特殊字符标题 ©',
        },
        version: '1.0',
      });

      const result = await parser.parse('/test/special-chars.pdf');

      expect(result.success).toBe(true);
      expect(result.content).toContain('特殊字符');
      expect(result.metadata?.title).toContain('特殊字符');
    });
  });
});