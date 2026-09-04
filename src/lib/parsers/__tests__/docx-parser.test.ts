/**
 * DOCX解析器测试
 * @module src/lib/parsers/__tests__/docx-parser.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocxParser } from '../docx-parser';
import fs from 'fs';

// Mock fs模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

// Mock mammoth
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

describe('DocxParser', () => {
  let parser: DocxParser;

  beforeEach(() => {
    parser = new DocxParser();
    vi.clearAllMocks();
  });

  describe('基本属性', () => {
    it('应该有正确的名称', () => {
      expect(parser.name).toBe('docx-parser');
    });

    it('应该支持DOCX扩展名', () => {
      expect(parser.supportedExtensions).toContain('docx');
    });

    it('应该支持DOCX和DOC MIME类型', () => {
      expect(parser.supportedMimeTypes).toContain(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(parser.supportedMimeTypes).toContain('application/msword');
    });

    it('应该正确识别DOCX文件', () => {
      expect(parser.supports('/path/to/file.docx')).toBe(true);
      expect(parser.supports('/path/to/file.doc')).toBe(true);
      expect(parser.supports('/path/to/file.pdf')).toBe(false);
    });
  });

  describe('parse方法', () => {
    it('应该成功解析DOCX文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 50,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '这是DOCX文件的文本内容',
        messages: [],
      });

      const result = await parser.parse('/test/test.docx');

      expect(result.success).toBe(true);
      expect(result.content).toBe('这是DOCX文件的文本内容');
      expect(result.metadata?.format).toBe('docx');
      expect(result.metadata?.title).toBe('test');
    });

    it('应该从文件名提取标题', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '内容',
        messages: [],
      });

      const result = await parser.parse('/documents/我的文档.docx');

      expect(result.metadata?.title).toBe('我的文档');
    });

    it('应该处理不存在的文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(false);

      const result = await parser.parse('/nonexistent/file.docx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });

    it('应该处理超大文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 150 * 1024 * 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '内容',
        messages: [],
      });

      const result = await parser.parse('/test/large.docx');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('文件大小超过限制'))).toBe(true);
    });

    it('应该处理空DOCX文件', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '',
        messages: [],
      });

      const result = await parser.parse('/test/empty.docx');

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

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockRejectedValue(new Error('DOCX解析失败：文件损坏'));

      const result = await parser.parse('/test/corrupted.docx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DOCX解析失败');
    });

    it('应该处理mammoth消息（警告）', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '文档内容',
        messages: [
          { type: 'warning', message: '无法解析某些格式' },
          { type: 'warning', message: '图片未提取' },
        ],
      });

      const result = await parser.parse('/test/with-warnings.docx');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('无法解析某些格式'))).toBe(true);
      expect(result.warnings?.some(w => w.includes('图片未提取'))).toBe(true);
    });

    it('应该处理包含错误消息的mammoth结果', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '部分内容',
        messages: [
          { type: 'error', message: '无法读取嵌入对象', error: new Error('嵌入对象错误') },
        ],
      });

      const result = await parser.parse('/test/with-error.docx');

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
    });

    it('应该处理带路径的文件名', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '内容',
        messages: [],
      });

      const result = await parser.parse('/path/to/我的文档.docx');

      expect(result.metadata?.title).toBe('我的文档');
    });
  });

  describe('错误处理', () => {
    it('应该处理文件系统错误', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      
      fsMock.statSync.mockImplementation(() => {
        throw new Error('权限被拒绝');
      });

      const result = await parser.parse('/test/protected.docx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('DOCX解析失败');
    });

    it('应该处理内存不足错误', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024 * 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockRejectedValue(new Error('内存不足'));

      const result = await parser.parse('/test/large.docx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('内存不足');
    });

    it('应该处理无效的文件句柄', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockRejectedValue(new Error('EBADF: 无效的文件描述符'));

      const result = await parser.parse('/test/invalid.docx');

      expect(result.success).toBe(false);
    });
  });

  describe('边界条件', () => {
    it('应该处理最小文件大小', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '小文件',
        messages: [],
      });

      const result = await parser.parse('/test/tiny.docx');

      expect(result.success).toBe(true);
    });

    it('应该处理特殊字符的DOCX内容', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '特殊字符：中文测试 © ® ™ € £ ¥ 中文标点，。！？',
        messages: [],
      });

      const result = await parser.parse('/test/special-chars.docx');

      expect(result.success).toBe(true);
      expect(result.content).toContain('特殊字符');
      expect(result.content).toContain('中文测试');
    });

    it('应该处理包含换行符的内容', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '第一行\n第二行\n第三行',
        messages: [],
      });

      const result = await parser.parse('/test/multiline.docx');

      expect(result.success).toBe(true);
      expect(result.content).toContain('\n');
    });

    it('应该处理包含空格的内容', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '   前面有空格\n中间    有空格\n后面有空格   ',
        messages: [],
      });

      const result = await parser.parse('/test/whitespace.docx');

      expect(result.success).toBe(true);
      expect(result.content).toContain('空格');
    });
  });

  describe('支持的文件扩展名', () => {
    it('应该支持.doc扩展名', () => {
      expect(parser.supports('/test/file.doc')).toBe(true);
    });

    it('应该支持.docx扩展名', () => {
      expect(parser.supports('/test/file.docx')).toBe(true);
    });
  });

  describe('MIME类型验证', () => {
    it('应该正确处理DOC MIME类型', async () => {
      const fsMock = vi.mocked(fs);
      fsMock.existsSync.mockReturnValue(true);
      fsMock.statSync.mockReturnValue({
        size: 1024,
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const mammoth = await import('mammoth');
      vi.mocked(mammoth.default.extractRawText).mockResolvedValue({
        value: '旧版Word文档',
        messages: [],
      });

      const result = await parser.parse('/test/old.doc');

      expect(result.success).toBe(true);
    });
  });
});