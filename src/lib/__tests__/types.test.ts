/**
 * 类型定义测试
 */

import { describe, it, expect } from 'vitest';
import {
  KnowledgeType,
  SourceType,
  KnowledgeFormat,
  FileEntry,
  FileMetadata,
  ExtractedContent,
  ParseOptions,
  ParseResult,
  LegacyFileNode,
  convertLegacyFileNodeToFileEntry,
} from '../../types/knowledge';

describe('类型定义', () => {
  describe('KnowledgeType 枚举', () => {
    it('应该包含所有知识类型', () => {
      expect(KnowledgeType.DOCUMENT).toBe('document');
      expect(KnowledgeType.WEBPAGE).toBe('webpage');
      expect(KnowledgeType.IMAGE).toBe('image');
      expect(KnowledgeType.AUDIO).toBe('audio');
      expect(KnowledgeType.VIDEO).toBe('video');
      expect(KnowledgeType.IDEA).toBe('idea');
      expect(KnowledgeType.QUESTION).toBe('question');
      expect(KnowledgeType.ANNOTATION).toBe('annotation');
      expect(KnowledgeType.MARKDOWN).toBe('markdown');
    });
  });

  describe('SourceType 枚举', () => {
    it('应该包含所有来源类型', () => {
      expect(SourceType.FILE).toBe('file');
      expect(SourceType.WEB).toBe('web');
      expect(SourceType.CHAT).toBe('chat');
      expect(SourceType.RESEARCH).toBe('research');
    });
  });

  describe('KnowledgeFormat 枚举', () => {
    it('应该包含所有文件格式', () => {
      expect(KnowledgeFormat.PDF).toBe('pdf');
      expect(KnowledgeFormat.DOCX).toBe('docx');
      expect(KnowledgeFormat.PPTX).toBe('pptx');
      expect(KnowledgeFormat.XLSX).toBe('xlsx');
      expect(KnowledgeFormat.MD).toBe('md');
      expect(KnowledgeFormat.TXT).toBe('txt');
      expect(KnowledgeFormat.HTML).toBe('html');
      expect(KnowledgeFormat.JPEG).toBe('jpeg');
      expect(KnowledgeFormat.PNG).toBe('png');
      expect(KnowledgeFormat.WEBP).toBe('webp');
      expect(KnowledgeFormat.MP3).toBe('mp3');
      expect(KnowledgeFormat.WAV).toBe('wav');
      expect(KnowledgeFormat.MP4).toBe('mp4');
      expect(KnowledgeFormat.WEBM).toBe('webm');
    });
  });

  describe('FileMetadata 接口', () => {
    it('应该支持可选的元数据字段', () => {
    const metadata: FileMetadata = {
      title: '测试文档',
      author: '作者',
      description: '描述',
      language: 'zh-CN',
      pageCount: 10,
      slideCount: 5,
      sheetCount: 3,
      duration: 3600,
      tags: ['tag1', 'tag2'],
      importance: 'high',
      urgency: 'urgent',
    };

    expect(metadata.title).toBe('测试文档');
    expect(metadata.tags).toContain('tag1');
  });
});

describe('FileEntry 接口', () => {
  it('应该包含所有必需字段', () => {
    const entry: FileEntry = {
      id: 'test-id',
      name: 'test.pdf',
      type: KnowledgeType.DOCUMENT,
      sourceType: SourceType.FILE,
      format: KnowledgeFormat.PDF,
      size: 1024,
      mimeType: 'application/pdf',
      filePath: '/path/to/test.pdf',
      metadata: {
        title: '测试PDF',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isParsed: false,
    };

    expect(entry.id).toBeDefined();
    expect(entry.name).toBe('test.pdf');
    expect(entry.format).toBe(KnowledgeFormat.PDF);
  });

  it('应该支持可选的内容字段', () => {
    const entry: FileEntry = {
      id: 'test-id-2',
      name: 'test.md',
      type: KnowledgeType.MARKDOWN,
      sourceType: SourceType.FILE,
      format: KnowledgeFormat.MD,
      size: 100,
      mimeType: 'text/markdown',
      filePath: '/path/to/test.md',
      metadata: { title: '测试Markdown' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isParsed: true,
      content: {
        text: '# 标题\n内容',
        ocrText: 'OCR文本',
        transcription: '转录文本',
        links: ['http://example.com'],
      },
    };

    expect(entry.content?.text).toBe('# 标题\n内容');
    expect(entry.content?.links).toContain('http://example.com');
  });
});

describe('ParseOptions 接口', () => {
  it('应该支持解析选项', () => {
    const options: ParseOptions = {
      extractImages: true,
      enableOcr: true,
      enableSTT: false,
      ocrLanguage: 'zh-CN',
      maxDuration: 7200,
    };

    expect(options.extractImages).toBe(true);
    expect(options.enableOcr).toBe(true);
    expect(options.ocrLanguage).toBe('zh-CN');
  });
});

describe('ParseResult 接口', () => {
  it('应该支持成功结果', () => {
    const result: ParseResult = {
      success: true,
      content: {
        text: '解析内容',
      },
      metadata: {
        title: '文档标题',
        author: '作者',
      },
      warnings: ['警告1'],
    };

    expect(result.success).toBe(true);
    expect(result.content?.text).toBe('解析内容');
    expect(result.metadata?.title).toBe('文档标题');
  });

  it('应该支持失败结果', () => {
    const result: ParseResult = {
      success: false,
      error: '解析失败',
    };

    expect(result.success).toBe(false);
    expect(result.error).toBe('解析失败');
  });
});

describe('旧版数据迁移', () => {
  it('应该转换旧版FileNode到FileEntry', () => {
    const legacyNode: LegacyFileNode = {
      name: 'old-file.md',
      path: '/path/to/old-file.md',
      isDirectory: false,
      isFile: true,
    };

    const entry = convertLegacyFileNodeToFileEntry(legacyNode);

    expect(entry.name).toBe('old-file.md');
    expect(entry.type).toBe(KnowledgeType.MARKDOWN);
    expect(entry.format).toBe(KnowledgeFormat.MD);
    expect(entry.sourceType).toBe(SourceType.FILE);
  });

  it('应该处理目录节点', () => {
    const legacyDir: LegacyFileNode = {
      name: 'folder',
      path: '/path/to/folder',
      isDirectory: true,
      isFile: false,
      children: [
        {
          name: 'file.md',
          path: '/path/to/folder/file.md',
          isDirectory: false,
          isFile: true,
        },
      ],
    };

    expect(legacyDir.isDirectory).toBe(true);
    expect(legacyDir.children).toHaveLength(1);
  });
});
});