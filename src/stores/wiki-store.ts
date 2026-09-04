/**
 * Wiki状态管理
 * 扩展支持多格式知识存储
 */

import { create } from 'zustand';
import { 
  FileEntry, 
  FileNode, 
  KnowledgeType, 
  KnowledgeFormat,

} from '../types/knowledge';
import { fileAbstraction } from '../lib/ingest/file-abstraction';
import { ingestCore, type IngestResult, type IngestOptions } from '../lib/ingest/ingest-core';
import { parserRegistry } from '../lib/parsers/parser-interface';
import { pdfParser } from '../lib/parsers/pdf-parser';
import { docxParser } from '../lib/parsers/docx-parser';
import { webParser } from '../lib/read/web-fetcher';

/**
 * Wiki状态接口
 */
export interface WikiState {
  // 状态
  project: string | null;
  projectPath: string | null;
  fileTree: FileNode | null;
  selectedFile: FileEntry | null;
  fileEntries: Map<string, FileEntry>;
  activeView: 'wiki' | 'read' | 'research';
  isLoading: boolean;
  error: string | null;

  // 操作
  setProject: (project: string) => void;
  setProjectPath: (path: string) => void;
  setFileTree: (tree: FileNode) => void;
  setSelectedFile: (file: FileEntry | null) => void;
  addFileEntry: (entry: FileEntry) => void;
  updateFileEntry: (id: string, updates: Partial<FileEntry>) => void;
  removeFileEntry: (id: string) => void;
  getFileEntry: (id: string) => FileEntry | undefined;
  getFileEntryByPath: (path: string) => FileEntry | undefined;
  setActiveView: (view: 'wiki' | 'read' | 'research') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // 多格式支持
  ingestFile: (path: string, options?: IngestOptions) => Promise<IngestResult>;
  ingestWeb: (url: string, options?: IngestOptions) => Promise<IngestResult>;
  parseFile: (entry: FileEntry) => Promise<FileEntry>;
  searchEntries: (query: string) => FileEntry[];

  // 初始化
  initialize: () => Promise<void>;
  initializeDataDir: (dataPath: string) => Promise<void>;
}

/**
 * 创建Wiki Store
 */
export const useWikiStore = create<WikiState>((set, get) => {
  // 初始化解析器
  const initializeParsers = () => {
    parserRegistry.register(pdfParser);
    parserRegistry.register(docxParser);
    parserRegistry.register(webParser);
    console.log('[WikiStore] 解析器已初始化');
  };

  return {
    // 初始状态
    project: null,
    projectPath: null,
    fileTree: null,
    selectedFile: null,
    fileEntries: new Map(),
    activeView: 'wiki',
    isLoading: false,
    error: null,

    // 操作
    setProject: (project) => set({ project }),

    setProjectPath: (projectPath) => set({ projectPath }),

    setFileTree: (tree) => set({ fileTree: tree }),
    
    setSelectedFile: (file) => set({ selectedFile: file }),
    
    addFileEntry: (entry) => set((state) => {
      const newEntries = new Map(state.fileEntries);
      newEntries.set(entry.id, entry);
      return { fileEntries: newEntries };
    }),
    
    updateFileEntry: (id, updates) => set((state) => {
      const entry = state.fileEntries.get(id);
      if (entry) {
        const newEntries = new Map(state.fileEntries);
        newEntries.set(id, { ...entry, ...updates });
        return { fileEntries: newEntries };
      }
      return state;
    }),
    
    removeFileEntry: (id) => set((state) => {
      const newEntries = new Map(state.fileEntries);
      newEntries.delete(id);
      return { fileEntries: newEntries };
    }),
    
    getFileEntry: (id) => get().fileEntries.get(id),
    
    getFileEntryByPath: (path) => {
      const entries = get().fileEntries;
      for (const entry of entries.values()) {
        if (entry.filePath === path) {
          return entry;
        }
      }
      return undefined;
    },
    
    setActiveView: (view) => set({ activeView: view }),
    
    setLoading: (loading) => set({ isLoading: loading }),
    
    setError: (error) => set({ error }),

    // 多格式支持
    ingestFile: async (path, options) => {
      set({ isLoading: true, error: null });
      try {
        const result = await ingestCore.ingest(path, options);
        
        // 更新状态
        for (const entry of result.entries) {
          get().addFileEntry(entry);
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
        return {
          success: false,
          entries: [],
          errors: [{ filePath: path, error: errorMessage }],
          warnings: [],
        };
      } finally {
        set({ isLoading: false });
      }
    },

    ingestWeb: async (url, options) => {
      set({ isLoading: true, error: null });
      try {
        const result = await ingestCore.ingestWeb(url, options);
        
        for (const entry of result.entries) {
          get().addFileEntry(entry);
        }
        
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
        return {
          success: false,
          entries: [],
          errors: [{ filePath: url, error: errorMessage }],
          warnings: [],
        };
      } finally {
        set({ isLoading: false });
      }
    },

    parseFile: async (entry) => {
      set({ isLoading: true });
      try {
        const parsed = await fileAbstraction.parseFile(entry);
        get().updateFileEntry(parsed.id, parsed);
        return parsed;
      } finally {
        set({ isLoading: false });
      }
    },

    searchEntries: (query) => {
      const entries = get().fileEntries;
      const results: FileEntry[] = [];
      const queryLower = query.toLowerCase();

      for (const entry of entries.values()) {
        const searchText = [
          entry.name,
          entry.metadata.title,
          entry.content?.text,
          entry.metadata.tags?.join(' '),
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchText.includes(queryLower)) {
          results.push(entry);
        }
      }

      return results;
    },

    // 初始化
    initialize: async () => {
      set({ isLoading: true });
      initializeParsers();
      set({ isLoading: false });
    },

    // 初始化数据目录：固定项目名 llm-wiki-data，清空旧文件条目
    initializeDataDir: async (dataPath: string) => {
      set({ isLoading: true, error: null });
      try {
        initializeParsers();
        set({
          project: 'llm-wiki-data',
          projectPath: dataPath,
          fileEntries: new Map(),
          fileTree: null,
          selectedFile: null,
        });
        console.log(`[WikiStore] 已初始化数据目录: ${dataPath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        set({ error: errorMessage });
      } finally {
        set({ isLoading: false });
      }
    },
  };
});

/**
 * 选择器钩子
 */
export const useFileEntries = () => useWikiStore((state) => Array.from(state.fileEntries.values()));
export const useSelectedFile = () => useWikiStore((state) => state.selectedFile);
export const useActiveView = () => useWikiStore((state) => state.activeView);
export const useIsLoading = () => useWikiStore((state) => state.isLoading);

/**
 * 文件类型图标映射
 */
export const formatIcons: Record<KnowledgeFormat, string> = {
  [KnowledgeFormat.PDF]: '📄',
  [KnowledgeFormat.DOCX]: '📝',
  [KnowledgeFormat.PPTX]: '📊',
  [KnowledgeFormat.XLSX]: '📈',
  [KnowledgeFormat.MD]: '📝',
  [KnowledgeFormat.TXT]: '📄',
  [KnowledgeFormat.HTML]: '🌐',
  [KnowledgeFormat.JPEG]: '🖼️',
  [KnowledgeFormat.PNG]: '🖼️',
  [KnowledgeFormat.WEBP]: '🖼️',
  [KnowledgeFormat.MP3]: '🎵',
  [KnowledgeFormat.WAV]: '🎵',
  [KnowledgeFormat.MP4]: '🎬',
  [KnowledgeFormat.WEBM]: '🎬',
};

/**
 * 知识类型颜色映射
 */
export const typeColors: Record<KnowledgeType, string> = {
  [KnowledgeType.DOCUMENT]: '#3b82f6',
  [KnowledgeType.WEBPAGE]: '#10b981',
  [KnowledgeType.IMAGE]: '#8b5cf6',
  [KnowledgeType.AUDIO]: '#f59e0b',
  [KnowledgeType.VIDEO]: '#ef4444',
  [KnowledgeType.IDEA]: '#ec4899',
  [KnowledgeType.QUESTION]: '#06b6d4',
  [KnowledgeType.ANNOTATION]: '#f97316',
  [KnowledgeType.MARKDOWN]: '#6366f1',
};