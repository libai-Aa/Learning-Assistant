/**
 * 文件抽象层测试
 * @module src/lib/__tests__/file-abstract.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { FileAbstraction, migrateLegacyFileNodes } from '../ingest/file-abstraction';
import { IngestCore } from '../ingest/ingest-core';
import type { FileEntry } from '../../types/knowledge';
import { SourceType, KnowledgeFormat, KnowledgeType } from '../../types/knowledge';

// Mock fs模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

// Mock crypto模块
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => {
      let data = '';
      const hash: any = {};
      hash.update = vi.fn((input: unknown) => { data = String(input); return hash; });
      hash.digest = vi.fn(() => {
        // 根据输入生成不同的 hash 值，保证不同路径产生不同 ID
        let h = 0;
        for (let i = 0; i < data.length; i++) {
          h = ((h << 5) - h) + data.charCodeAt(i);
          h = h & h;
        }
        return String(Math.abs(h)).padStart(16, '0');
      });
      return hash;
    }),
  },
}));

describe('FileAbstraction', () => {
  let abstraction: FileAbstraction;

  beforeEach(() => {
    abstraction = new FileAbstraction();
    abstraction.clear();
  });

  describe('文件条目管理', () => {
    it('应该添加文件条目', () => {
      const entry: FileEntry = {
        id: 'test-1',
        name: 'test.pdf',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.PDF,
        size: 1024,
        mimeType: 'application/pdf',
        filePath: '/test/test.pdf',
        metadata: { title: '测试PDF' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      expect(abstraction.getFileEntry('test-1')).toEqual(entry);
    });

    it('应该返回undefined获取不存在的文件条目', () => {
      expect(abstraction.getFileEntry('non-existent')).toBeUndefined();
    });

    it('应该通过路径获取文件条目', () => {
      const entry: FileEntry = {
        id: 'test-2',
        name: 'test.docx',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.DOCX,
        size: 2048,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filePath: '/test/test.docx',
        metadata: { title: '测试DOCX' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      expect(abstraction.getFileEntryByPath('/test/test.docx')).toEqual(entry);
    });

    it('应该更新文件条目', () => {
      const entry: FileEntry = {
        id: 'test-3',
        name: 'test.md',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.MD,
        size: 512,
        mimeType: 'text/markdown',
        filePath: '/test/test.md',
        metadata: { title: '测试MD' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      abstraction.updateFileEntry('test-3', { isParsed: true, size: 1024 });

      const updated = abstraction.getFileEntry('test-3');
      expect(updated?.isParsed).toBe(true);
      expect(updated?.size).toBe(1024);
    });

    it('应该删除文件条目', () => {
      const entry: FileEntry = {
        id: 'test-4',
        name: 'test.txt',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.TXT,
        size: 256,
        mimeType: 'text/plain',
        filePath: '/test/test.txt',
        metadata: { title: '测试TXT' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      expect(abstraction.removeFileEntry('test-4')).toBe(true);
      expect(abstraction.getFileEntry('test-4')).toBeUndefined();
    });

    it('删除不存在的文件条目应该返回false', () => {
      expect(abstraction.removeFileEntry('non-existent')).toBe(false);
    });

    it('应该获取所有文件条目', () => {
      const entry1: FileEntry = {
        id: 'test-5',
        name: 'test1.pdf',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.PDF,
        size: 1024,
        mimeType: 'application/pdf',
        filePath: '/test/test1.pdf',
        metadata: { title: '测试PDF1' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      const entry2: FileEntry = {
        id: 'test-6',
        name: 'test2.pdf',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.PDF,
        size: 2048,
        mimeType: 'application/pdf',
        filePath: '/test/test2.pdf',
        metadata: { title: '测试PDF2' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry1);
      abstraction.addFileEntry(entry2);

      const allEntries = abstraction.getAllFileEntries();
      expect(allEntries.length).toBe(2);
    });

    it('应该清空所有文件条目', () => {
      const entry: FileEntry = {
        id: 'test-7',
        name: 'test.pdf',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.PDF,
        size: 1024,
        mimeType: 'application/pdf',
        filePath: '/test/test.pdf',
        metadata: { title: '测试PDF' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      abstraction.clear();

      expect(abstraction.getAllFileEntries()).toEqual([]);
    });
  });

  describe('从路径创建文件条目', () => {
    beforeEach(() => {

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02'),
        isDirectory: () => false,
        isFile: () => true,
      });
    });

    it('应该从PDF路径创建文件条目', () => {
      const entry = abstraction.createFileEntryFromPath('/documents/test.pdf');
      
      expect(entry.format).toBe(KnowledgeFormat.PDF);
      expect(entry.type).toBe(KnowledgeType.DOCUMENT);
      expect(entry.mimeType).toBe('application/pdf');
      expect(entry.name).toBe('test.pdf');
      expect(entry.metadata.title).toBe('test');
    });

    it('应该从DOCX路径创建文件条目', () => {
      const entry = abstraction.createFileEntryFromPath('/documents/test.docx');
      
      expect(entry.format).toBe(KnowledgeFormat.DOCX);
      expect(entry.type).toBe(KnowledgeType.DOCUMENT);
    });

    it('应该从图片路径创建文件条目', () => {
      const pngEntry = abstraction.createFileEntryFromPath('/images/test.png');
      expect(pngEntry.format).toBe(KnowledgeFormat.PNG);
      expect(pngEntry.type).toBe(KnowledgeType.IMAGE);

      const jpgEntry = abstraction.createFileEntryFromPath('/images/test.jpg');
      expect(jpgEntry.format).toBe(KnowledgeFormat.JPEG);
    });

    it('应该从音视频路径创建文件条目', () => {
      const mp3Entry = abstraction.createFileEntryFromPath('/audio/test.mp3');
      expect(mp3Entry.format).toBe(KnowledgeFormat.MP3);
      expect(mp3Entry.type).toBe(KnowledgeType.AUDIO);

      const mp4Entry = abstraction.createFileEntryFromPath('/video/test.mp4');
      expect(mp4Entry.format).toBe(KnowledgeFormat.MP4);
      expect(mp4Entry.type).toBe(KnowledgeType.VIDEO);
    });

    it('应该检测网页格式', () => {
      const htmlEntry = abstraction.createFileEntryFromPath('/web/test.html');
      expect(htmlEntry.format).toBe(KnowledgeFormat.HTML);
      expect(htmlEntry.type).toBe(KnowledgeType.WEBPAGE);
    });

    it('未知格式应该默认为TXT', () => {
      const entry = abstraction.createFileEntryFromPath('/test/unknown.xyz');
      expect(entry.format).toBe(KnowledgeFormat.TXT);
    });

    it('应该使用指定的源类型', () => {
      const entry = abstraction.createFileEntryFromPath('/test/test.pdf', SourceType.WEB);
      expect(entry.sourceType).toBe(SourceType.WEB);
    });
  });

  describe('从URL创建文件条目', () => {
    it('应该从URL创建文件条目', () => {
      const entry = abstraction.createFileEntryFromUrl('https://example.com/page.html');
      
      expect(entry.type).toBe(KnowledgeType.WEBPAGE);
      expect(entry.sourceType).toBe(SourceType.WEB);
      expect(entry.format).toBe(KnowledgeFormat.HTML);
      expect(entry.filePath).toBe('https://example.com/page.html');
      expect(entry.name).toBe('example.com');
      expect(entry.mimeType).toBe('text/html');
    });

    it('应该处理带端口的URL', () => {
      const entry = abstraction.createFileEntryFromUrl('https://example.com:8080/page');
      expect(entry.name).toBe('example.com:8080');
    });
  });

  describe('格式检测', () => {
    it('应该正确检测所有支持的格式', () => {
      const testCases = [
        { ext: 'pdf', expected: KnowledgeFormat.PDF },
        { ext: 'docx', expected: KnowledgeFormat.DOCX },
        { ext: 'doc', expected: KnowledgeFormat.DOCX },
        { ext: 'pptx', expected: KnowledgeFormat.PPTX },
        { ext: 'xlsx', expected: KnowledgeFormat.XLSX },
        { ext: 'md', expected: KnowledgeFormat.MD },
        { ext: 'txt', expected: KnowledgeFormat.TXT },
        { ext: 'html', expected: KnowledgeFormat.HTML },
        { ext: 'jpg', expected: KnowledgeFormat.JPEG },
        { ext: 'png', expected: KnowledgeFormat.PNG },
        { ext: 'mp3', expected: KnowledgeFormat.MP3 },
        { ext: 'mp4', expected: KnowledgeFormat.MP4 },
      ];

      for (const { ext, expected } of testCases) {
        const entry = abstraction.createFileEntryFromPath(`/test/file.${ext}`);
        expect(entry.format).toBe(expected);
      }
    });
  });

  describe('知识类型检测', () => {
    it('应该正确识别文档类型', () => {
      const docFormats = [
        KnowledgeFormat.PDF,
        KnowledgeFormat.DOCX,
        KnowledgeFormat.PPTX,
        KnowledgeFormat.XLSX,
        KnowledgeFormat.MD,
        KnowledgeFormat.TXT,
      ];

      for (const format of docFormats) {
        // 这个测试需要通过私有方法来验证，这里我们测试间接行为
        const entry = abstraction.createFileEntryFromPath(`/test/file.${format}`);
        expect(entry.type).toBe(KnowledgeType.DOCUMENT);
      }
    });

    it('应该正确识别图片类型', () => {
      const entry = abstraction.createFileEntryFromPath('/test/image.png');
      expect(entry.type).toBe(KnowledgeType.IMAGE);
    });

    it('应该正确识别音频类型', () => {
      const entry = abstraction.createFileEntryFromPath('/test/audio.mp3');
      expect(entry.type).toBe(KnowledgeType.AUDIO);
    });

    it('应该正确识别视频类型', () => {
      const entry = abstraction.createFileEntryFromPath('/test/video.mp4');
      expect(entry.type).toBe(KnowledgeType.VIDEO);
    });
  });

  describe('MIME类型检测', () => {
    it('应该正确检测常见MIME类型', () => {
      const testCases = [
        { ext: 'pdf', expected: 'application/pdf' },
        { ext: 'docx', expected: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { ext: 'jpg', expected: 'image/jpeg' },
        { ext: 'png', expected: 'image/png' },
        { ext: 'mp3', expected: 'audio/mpeg' },
        { ext: 'mp4', expected: 'video/mp4' },
      ];

      for (const { ext, expected } of testCases) {
        const entry = abstraction.createFileEntryFromPath(`/test/file.${ext}`);
        expect(entry.mimeType).toBe(expected);
      }
    });

    it('未知扩展名应该返回二进制流', () => {
      const entry = abstraction.createFileEntryFromPath('/test/unknown.xyz');
      expect(entry.mimeType).toBe('application/octet-stream');
    });
  });

  describe('文件ID生成', () => {
    it('应该为相同路径生成相同的ID', () => {
      const entry1 = abstraction.createFileEntryFromPath('/test/file.pdf');
      const entry2 = abstraction.createFileEntryFromPath('/test/file.pdf');
      
      // 由于我们mock了crypto，ID应该是相同的
      expect(entry1.id).toBe(entry2.id);
    });

    it('应该为不同路径生成不同的ID', () => {
      const entry1 = abstraction.createFileEntryFromPath('/test/file1.pdf');
      const entry2 = abstraction.createFileEntryFromPath('/test/file2.pdf');
      
      expect(entry1.id).not.toBe(entry2.id);
    });
  });

  describe('parseFile方法', () => {
    beforeEach(() => {

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02'),
        isDirectory: () => false,
        isFile: () => true,
      });
    });

    it('应该解析文件并更新条目', async () => {
      const entry: FileEntry = {
        id: 'test-parse-1',
        name: 'test.pdf',
        type: KnowledgeType.DOCUMENT,
        sourceType: SourceType.FILE,
        format: KnowledgeFormat.PDF,
        size: 1024,
        mimeType: 'application/pdf',
        filePath: '/test/test.pdf',
        metadata: { title: '测试PDF' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isParsed: false,
      };

      abstraction.addFileEntry(entry);
      
      // 注意：这里需要mock parserRegistry
      // 由于这是一个集成测试，我们暂时跳过实际的解析
      const result = await abstraction.parseFile(entry);
      expect(result).toBeDefined();
    });
  });

  describe('批量解析', () => {
    it('应该批量解析多个文件', async () => {
      const entries: FileEntry[] = [
        {
          id: 'batch-1',
          name: 'test1.pdf',
          type: KnowledgeType.DOCUMENT,
          sourceType: SourceType.FILE,
          format: KnowledgeFormat.PDF,
          size: 1024,
          mimeType: 'application/pdf',
          filePath: '/test/test1.pdf',
          metadata: { title: '测试PDF1' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isParsed: false,
        },
        {
          id: 'batch-2',
          name: 'test2.pdf',
          type: KnowledgeType.DOCUMENT,
          sourceType: SourceType.FILE,
          format: KnowledgeFormat.PDF,
          size: 2048,
          mimeType: 'application/pdf',
          filePath: '/test/test2.pdf',
          metadata: { title: '测试PDF2' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isParsed: false,
        },
      ];

      const results = await abstraction.parseFiles(entries);
      expect(results.length).toBe(2);
    });
  });
});

describe('migrateLegacyFileNodes', () => {
  it('应该迁移旧版FileNode到FileEntry', () => {
    const legacyNodes = [
      {
        name: 'file1.md',
        path: '/path/file1.md',
        isDirectory: false,
        isFile: true,
      },
      {
        name: 'file2.pdf',
        path: '/path/file2.pdf',
        isDirectory: false,
        isFile: true,
      },
    ];

    const entries = migrateLegacyFileNodes(legacyNodes);

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe(KnowledgeType.MARKDOWN);
    expect(entries[0].format).toBe(KnowledgeFormat.MD);
    expect(entries[1].type).toBe(KnowledgeType.DOCUMENT);
    expect(entries[1].format).toBe(KnowledgeFormat.PDF);
  });

  it('应该过滤目录节点', () => {
    const legacyNodes = [
      {
        name: 'folder',
        path: '/path/folder',
        isDirectory: true,
        isFile: false,
      },
      {
        name: 'file.md',
        path: '/path/file.md',
        isDirectory: false,
        isFile: true,
      },
    ];

    const entries = migrateLegacyFileNodes(legacyNodes);

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('file.md');
  });

  it('空数组应该返回空数组', () => {
    const entries = migrateLegacyFileNodes([]);
    expect(entries).toEqual([]);
  });
});