/**
 * WikiStore测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWikiStore } from '../../stores/wiki-store';
import { FileEntry, KnowledgeType, KnowledgeFormat, SourceType } from '../../types/knowledge';

// Mock Zustand
// 真实 zustand 的 create 返回一个可调用的 hook 函数，同时附带 store API（getState/setState/subscribe）。
// 此处 mock 同样返回一个函数，以保证 typeof useWikiStore === 'function'，
// 并保留所有现有测试中通过 useWikiStore.getState() 访问状态的用法。
vi.mock('zustand', () => ({
  create: vi.fn((initializer) => {
    let state: any = {};
    const listeners: Set<() => void> = new Set();

    const get = () => state;
    const set = (partial: any) => {
      state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
      listeners.forEach(listener => listener());
    };

    state = initializer(set, get);

    // 可调用的 hook 函数：传入选择器则返回选择结果，不传则返回整个状态
    const hook = (selector?: (s: any) => any) =>
      typeof selector === 'function' ? selector(state) : state;

    // 附加 store API，保持与 zustand 真实接口一致
    hook.getState = () => state;
    hook.setState = set;
    hook.subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    return hook;
  }),
}));

// Mock dependencies
vi.mock('../lib/parsers/pdf-parser', () => ({
  pdfParser: { name: 'pdf-parser', supportedExtensions: ['pdf'], supportedMimeTypes: ['application/pdf'] },
}));

vi.mock('../lib/parsers/docx-parser', () => ({
  docxParser: { name: 'docx-parser', supportedExtensions: ['docx'], supportedMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
}));

vi.mock('../lib/read/web-fetcher', () => ({
  webParser: { name: 'web-parser', supportedExtensions: ['html'], supportedMimeTypes: ['text/html'] },
}));

describe('WikiStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useWikiStore.getState();
    store.fileEntries.clear();
    store.project = null;
    store.selectedFile = null;
    store.activeView = 'wiki';
    store.isLoading = false;
    store.error = null;
  });

  describe('基础状态', () => {
    it('应该有初始状态', () => {
      const state = useWikiStore.getState();
      
      expect(state.project).toBeNull();
      expect(state.fileTree).toBeNull();
      expect(state.selectedFile).toBeNull();
      expect(state.fileEntries.size).toBe(0);
      expect(state.activeView).toBe('wiki');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('应该设置项目', () => {
      useWikiStore.getState().setProject('test-project');
      expect(useWikiStore.getState().project).toBe('test-project');
    });

    it('应该设置活动视图', () => {
      useWikiStore.getState().setActiveView('read');
      expect(useWikiStore.getState().activeView).toBe('read');

      useWikiStore.getState().setActiveView('research');
      expect(useWikiStore.getState().activeView).toBe('research');
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

      useWikiStore.getState().addFileEntry(entry);
      expect(useWikiStore.getState().fileEntries.size).toBe(1);
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

      useWikiStore.getState().addFileEntry(entry);
      useWikiStore.getState().updateFileEntry('test-1', { isParsed: true });

      const updated = useWikiStore.getState().getFileEntry('test-1');
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

      useWikiStore.getState().addFileEntry(entry);
      useWikiStore.getState().removeFileEntry('test-1');

      expect(useWikiStore.getState().fileEntries.size).toBe(0);
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

      useWikiStore.getState().addFileEntry(entry);
      const found = useWikiStore.getState().getFileEntryByPath('/test/test.pdf');
      
      expect(found).toEqual(entry);
    });
  });

  describe('搜索', () => {
    beforeEach(() => {
      const entries: FileEntry[] = [
        {
          id: '1',
          name: 'doc1.pdf',
          type: KnowledgeType.DOCUMENT,
          sourceType: SourceType.FILE,
          format: KnowledgeFormat.PDF,
          size: 1024,
          mimeType: 'application/pdf',
          filePath: '/test/doc1.pdf',
          metadata: { title: '测试文档一', tags: ['tag1', 'tag2'] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isParsed: true,
          content: { text: '这是测试文档的内容' },
        },
        {
          id: '2',
          name: 'doc2.pdf',
          type: KnowledgeType.DOCUMENT,
          sourceType: SourceType.FILE,
          format: KnowledgeFormat.PDF,
          size: 2048,
          mimeType: 'application/pdf',
          filePath: '/test/doc2.pdf',
          metadata: { title: '另一个文档', tags: ['tag2'] },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isParsed: true,
          content: { text: '这是另一个文档的内容' },
        },
      ];

      for (const entry of entries) {
        useWikiStore.getState().addFileEntry(entry);
      }
    });

    it('应该搜索标题', () => {
      const results = useWikiStore.getState().searchEntries('测试文档一');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('doc1.pdf');
    });

    it('应该搜索内容', () => {
      const results = useWikiStore.getState().searchEntries('另一个文档');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('doc2.pdf');
    });

    it('应该搜索标签', () => {
      const results = useWikiStore.getState().searchEntries('tag1');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('doc1.pdf');
    });

    it('应该返回空结果', () => {
      const results = useWikiStore.getState().searchEntries('不存在的关键词');
      expect(results.length).toBe(0);
    });
  });

  describe('选择器钩子', () => {
    it('应该导出useFileEntries', () => {
      // 测试钩子函数是否存在
      expect(typeof useWikiStore).toBe('function');
    });
  });
});