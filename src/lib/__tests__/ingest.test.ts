/**
 * 文件抽象和摄入测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { FileAbstraction, migrateLegacyFileNodes } from '../ingest/file-abstraction';
import { IngestCore } from '../ingest/ingest-core';
import { FileEntry, SourceType, KnowledgeFormat, KnowledgeType } from '../../types/knowledge';

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  },
}));

// Mock crypto
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => {
      let data = '';
      const hash: any = {};
      hash.update = vi.fn((input: unknown) => { data = String(input); return hash; });
      hash.digest = vi.fn(() => {
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
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      size: 1024,
      birthtime: new Date('2024-01-01'),
      mtime: new Date('2024-01-02'),
      isDirectory: () => false,
      isFile: () => true,
    });
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

    it('应该更新文件条目', () => {
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
      abstraction.updateFileEntry('test-1', { isParsed: true });

      const updated = abstraction.getFileEntry('test-1');
      expect(updated?.isParsed).toBe(true);
    });

    it('应该删除文件条目', () => {
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
      abstraction.removeFileEntry('test-1');

      expect(abstraction.getFileEntry('test-1')).toBeUndefined();
    });

    it('应该通过路径获取文件条目', () => {
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
      expect(abstraction.getFileEntryByPath('/test/test.pdf')).toEqual(entry);
    });
  });

  describe('格式检测', () => {
    it('应该检测PDF格式', () => {
      const entry = abstraction.createFileEntryFromPath('/test/file.pdf');
      expect(entry.format).toBe(KnowledgeFormat.PDF);
      expect(entry.type).toBe(KnowledgeType.DOCUMENT);
    });

    it('应该检测DOCX格式', () => {
      const entry = abstraction.createFileEntryFromPath('/test/file.docx');
      expect(entry.format).toBe(KnowledgeFormat.DOCX);
    });

    it('应该检测图片格式', () => {
      const pngEntry = abstraction.createFileEntryFromPath('/test/image.png');
      expect(pngEntry.format).toBe(KnowledgeFormat.PNG);
      expect(pngEntry.type).toBe(KnowledgeType.IMAGE);

      const jpgEntry = abstraction.createFileEntryFromPath('/test/image.jpg');
      expect(jpgEntry.format).toBe(KnowledgeFormat.JPEG);
    });

    it('应该检测音视频格式', () => {
      const mp3Entry = abstraction.createFileEntryFromPath('/test/audio.mp3');
      expect(mp3Entry.format).toBe(KnowledgeFormat.MP3);
      expect(mp3Entry.type).toBe(KnowledgeType.AUDIO);

      const mp4Entry = abstraction.createFileEntryFromPath('/test/video.mp4');
      expect(mp4Entry.format).toBe(KnowledgeFormat.MP4);
      expect(mp4Entry.type).toBe(KnowledgeType.VIDEO);
    });
  });

  describe('URL创建', () => {
    it('应该从URL创建文件条目', () => {
      const entry = abstraction.createFileEntryFromUrl('https://example.com/page');
      
      expect(entry.type).toBe(KnowledgeType.WEBPAGE);
      expect(entry.sourceType).toBe(SourceType.WEB);
      expect(entry.format).toBe(KnowledgeFormat.HTML);
      expect(entry.filePath).toBe('https://example.com/page');
    });
  });
});

describe('IngestCore', () => {
  let ingestCore: IngestCore;

  beforeEach(() => {
    ingestCore = new IngestCore();
  });

  describe('选项处理', () => {
    it('应该使用默认选项', () => {
      const options = ingestCore['normalizeOptions']();
      
      expect(options.recursive).toBe(true);
      expect(options.parse).toBe(true);
      expect(options.index).toBe(true);
    });

    it('应该合并自定义选项', () => {
      const options = ingestCore['normalizeOptions']({ parse: false });
      
      expect(options.recursive).toBe(true);
      expect(options.parse).toBe(false);
    });
  });
});

describe('旧版数据迁移', () => {
  it('应该迁移旧版FileNode', () => {
    const legacyNodes = [
      {
        name: 'file1.md',
        path: '/path/file1.md',
        isDirectory: false,
        isFile: true,
      },
      {
        name: 'file2.md',
        path: '/path/file2.md',
        isDirectory: false,
        isFile: true,
      },
    ];

    const entries = migrateLegacyFileNodes(legacyNodes);

    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe(KnowledgeType.MARKDOWN);
    expect(entries[0].format).toBe(KnowledgeFormat.MD);
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
});