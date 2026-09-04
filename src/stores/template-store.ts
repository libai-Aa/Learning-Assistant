/**
 * 模板状态管理 (TemplateStore)
 *
 * @description 使用 Zustand + persist middleware 实现模板的 CRUD、
 *   批量操作、筛选/排序、持久化存储。底层逻辑委托给 TemplateManager
 *   单例，Store 负责 React 响应式状态与 localStorage 持久化。
 *
 * 持久化键：`template-storage`
 *
 * @module src/stores/template-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DocumentTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  TemplateFilter,
  TemplateSortOptions,
  TemplateStats,
  TemplateRecommendation,
  TemplateCategoryValue,
  DocumentTypeValue,

} from '../types/template';
import { templateManager } from '../lib/wps/template-manager';

/**
 * TemplateStore 状态接口
 */
interface TemplateStoreState {
  /** 所有模板列表（持久化主数据） */
  templates: DocumentTemplate[];
  /** 当前选中模板 ID */
  selectedId: string | null;
  /** 当前筛选条件 */
  filter: TemplateFilter;
  /** 当前排序选项 */
  sortOptions: TemplateSortOptions;
  /** 搜索关键词 */
  searchQuery: string;
  /** 视图模式：网格 / 列表 */
  viewMode: 'grid' | 'list';
  /** 批量选中的模板 ID */
  selectedIds: string[];
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // ===== CRUD =====

  /** 添加模板，返回新 ID */
  addTemplate: (request: CreateTemplateRequest) => string;
  /** 从 WPS 当前文档添加（便捷方法） */
  addFromCurrentDocument: (
    name: string,
    type: DocumentTypeValue,
    filePath: string,
    options?: {
      category?: TemplateCategoryValue;
      tags?: string[];
      useCases?: string[];
      suitableFor?: string[];
      notes?: string;
      originalPath?: string;
    }
  ) => string;
  /** 获取模板详情 */
  getTemplate: (id: string) => DocumentTemplate | undefined;
  /** 获取所有模板 */
  getAllTemplates: () => DocumentTemplate[];
  /** 更新模板 */
  updateTemplate: (id: string, request: UpdateTemplateRequest) => boolean;
  /** 删除模板 */
  deleteTemplate: (id: string) => boolean;
  /** 批量删除，返回实际删除数量 */
  deleteTemplates: (ids: string[]) => number;
  /** 清空所有模板 */
  clearAll: () => void;

  // ===== 使用统计与评分 =====

  /** 记录使用（usageCount +1） */
  incrementUsage: (id: string) => boolean;
  /** 设置评分 1-5 */
  setRating: (id: string, rating: number) => boolean;
  /** 设置备注 */
  setNotes: (id: string, notes: string) => boolean;

  // ===== 查询 =====

  /** 按分类查询 */
  getByCategory: (category: TemplateCategoryValue) => DocumentTemplate[];
  /** 按标签查询 */
  getByTag: (tag: string) => DocumentTemplate[];
  /** 按使用场景查询 */
  getByUseCase: (useCase: string) => DocumentTemplate[];
  /** 综合过滤查询 */
  query: (filter: TemplateFilter) => DocumentTemplate[];
  /** 全文搜索 */
  search: (query: string) => DocumentTemplate[];
  /** 获取当前筛选+排序+搜索后的可见模板 */
  getVisibleTemplates: () => DocumentTemplate[];

  // ===== 推荐 =====

  /** 相似模板推荐 */
  recommend: (targetId: string, topK?: number, minScore?: number) => TemplateRecommendation[];
  /** 基于场景推荐 */
  recommendByScenario: (
    scenario: {
      useCases?: string[];
      suitableFor?: string[];
      category?: TemplateCategoryValue;
      type?: DocumentTypeValue;
    },
    topK?: number
  ) => TemplateRecommendation[];

  // ===== 统计 =====

  /** 获取统计信息 */
  getStats: () => TemplateStats;
  /** 获取所有标签（去重） */
  getAllTags: () => string[];
  /** 获取所有使用场景（去重） */
  getAllUseCases: () => string[];

  // ===== UI 状态 =====

  /** 设置当前选中模板 */
  setSelected: (id: string | null) => void;
  /** 设置筛选条件 */
  setFilter: (filter: TemplateFilter) => void;
  /** 合并筛选条件（部分更新） */
  patchFilter: (filter: Partial<TemplateFilter>) => void;
  /** 重置筛选 */
  resetFilter: () => void;
  /** 设置排序 */
  setSortOptions: (options: TemplateSortOptions) => void;
  /** 设置搜索关键词 */
  setSearchQuery: (query: string) => void;
  /** 切换视图模式 */
  setViewMode: (mode: 'grid' | 'list') => void;

  // ===== 批量选择 =====

  /** 切换某个模板的选中状态 */
  toggleSelected: (id: string) => void;
  /** 批量选中多个 */
  selectMany: (ids: string[]) => void;
  /** 清空批量选择 */
  clearSelection: () => void;
  /** 全选当前可见模板 */
  selectAllVisible: () => void;

  // ===== 拖拽排序 =====

  /** 移动模板到目标位置（仅调整数组顺序，不修改 updatedAt） */
  moveTemplate: (sourceId: string, targetIndex: number) => void;

  // ===== 状态控制 =====

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * 默认筛选条件（空 = 不过滤）
 */
const DEFAULT_FILTER: TemplateFilter = {};

/**
 * 默认排序：按创建时间降序（最新在前）
 */
const DEFAULT_SORT: TemplateSortOptions = {
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

/**
 * 内部辅助：将管理器数据同步到 Store 状态
 */
function syncFromManager(): Pick<TemplateStoreState, 'templates'> {
  return { templates: templateManager.dump() };
}

/**
 * TemplateStore Hook
 */
export const useTemplateStore = create<TemplateStoreState>()(
  persist(
    (set, get) => ({
      templates: [],
      selectedId: null,
      filter: DEFAULT_FILTER,
      sortOptions: DEFAULT_SORT,
      searchQuery: '',
      viewMode: 'grid',
      selectedIds: [],
      isLoading: false,
      error: null,

      // ===== CRUD =====

      addTemplate: (request: CreateTemplateRequest) => {
        const id = templateManager.addTemplate(request);
        set(syncFromManager());
        return id;
      },

      addFromCurrentDocument: (name, type, filePath, options = {}) => {
        const id = templateManager.addFromCurrentDocument(name, type, filePath, options);
        set(syncFromManager());
        return id;
      },

      getTemplate: (id: string) => {
        return templateManager.getTemplate(id);
      },

      getAllTemplates: () => {
        return templateManager.getAllTemplates();
      },

      updateTemplate: (id: string, request: UpdateTemplateRequest) => {
        const ok = templateManager.updateTemplate(id, request);
        if (ok) set(syncFromManager());
        return ok;
      },

      deleteTemplate: (id: string) => {
        const ok = templateManager.deleteTemplate(id);
        if (ok) {
          set((state) => ({
            ...syncFromManager(),
            selectedId: state.selectedId === id ? null : state.selectedId,
            selectedIds: state.selectedIds.filter((x) => x !== id),
          }));
        }
        return ok;
      },

      deleteTemplates: (ids: string[]) => {
        const deleted = templateManager.deleteTemplates(ids);
        if (deleted > 0) {
          const idSet = new Set(ids);
          set((state) => ({
            ...syncFromManager(),
            selectedId: idSet.has(state.selectedId || '') ? null : state.selectedId,
            selectedIds: state.selectedIds.filter((x) => !idSet.has(x)),
          }));
        }
        return deleted;
      },

      clearAll: () => {
        templateManager.clear();
        set({
          templates: [],
          selectedId: null,
          selectedIds: [],
        });
      },

      // ===== 使用统计与评分 =====

      incrementUsage: (id: string) => {
        const ok = templateManager.incrementUsage(id);
        if (ok) set(syncFromManager());
        return ok;
      },

      setRating: (id: string, rating: number) => {
        const ok = templateManager.setRating(id, rating);
        if (ok) set(syncFromManager());
        return ok;
      },

      setNotes: (id: string, notes: string) => {
        const ok = templateManager.setNotes(id, notes);
        if (ok) set(syncFromManager());
        return ok;
      },

      // ===== 查询 =====

      getByCategory: (category: TemplateCategoryValue) => {
        return templateManager.getByCategory(category);
      },

      getByTag: (tag: string) => {
        return templateManager.getByTag(tag);
      },

      getByUseCase: (useCase: string) => {
        return templateManager.getByUseCase(useCase);
      },

      query: (filter: TemplateFilter) => {
        return templateManager.query(filter);
      },

      search: (query: string) => {
        return templateManager.search(query);
      },

      getVisibleTemplates: () => {
        const state = get();
        let results = templateManager.getAllTemplates();

        // 1. 筛选
        const hasFilter =
          state.filter.category ||
          state.filter.type ||
          state.filter.tag ||
          state.filter.useCase ||
          state.filter.suitableFor ||
          state.filter.source ||
          state.filter.minRating !== undefined ||
          state.filter.minUsageCount !== undefined ||
          state.filter.createdAtFrom ||
          state.filter.createdAtTo;
        if (hasFilter) {
          results = templateManager.query(state.filter);
        }

        // 2. 搜索
        if (state.searchQuery.trim()) {
          const ids = new Set(
            templateManager.search(state.searchQuery).map((t) => t.id)
          );
          results = results.filter((t) => ids.has(t.id));
        }

        // 3. 排序
        const { sortBy, sortOrder } = state.sortOptions;
        results = [...results].sort((a, b) => {
          let cmp = 0;
          switch (sortBy) {
            case 'createdAt':
              cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              break;
            case 'updatedAt':
              cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
              break;
            case 'usageCount':
              cmp = a.usageCount - b.usageCount;
              break;
            case 'userRating':
              cmp = (a.userRating || 0) - (b.userRating || 0);
              break;
            case 'name':
              cmp = a.name.localeCompare(b.name);
              break;
          }
          return sortOrder === 'asc' ? cmp : -cmp;
        });

        return results;
      },

      // ===== 推荐 =====

      recommend: (targetId: string, topK = 5, minScore = 0.1) => {
        return templateManager.recommend(targetId, topK, minScore);
      },

      recommendByScenario: (scenario, topK = 5) => {
        return templateManager.recommendByScenario(scenario, topK);
      },

      // ===== 统计 =====

      getStats: () => {
        return templateManager.getStats();
      },

      getAllTags: () => {
        return templateManager.getAllTags();
      },

      getAllUseCases: () => {
        return templateManager.getAllUseCases();
      },

      // ===== UI 状态 =====

      setSelected: (id: string | null) => {
        set({ selectedId: id });
      },

      setFilter: (filter: TemplateFilter) => {
        set({ filter });
      },

      patchFilter: (filter: Partial<TemplateFilter>) => {
        set((state) => ({ filter: { ...state.filter, ...filter } }));
      },

      resetFilter: () => {
        set({ filter: DEFAULT_FILTER, searchQuery: '' });
      },

      setSortOptions: (options: TemplateSortOptions) => {
        set({ sortOptions: options });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      setViewMode: (mode: 'grid' | 'list') => {
        set({ viewMode: mode });
      },

      // ===== 批量选择 =====

      toggleSelected: (id: string) => {
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((x) => x !== id)
            : [...state.selectedIds, id],
        }));
      },

      selectMany: (ids: string[]) => {
        set((state) => {
          const set_ = new Set(state.selectedIds);
          ids.forEach((id) => set_.add(id));
          return { selectedIds: Array.from(set_) };
        });
      },

      clearSelection: () => {
        set({ selectedIds: [] });
      },

      selectAllVisible: () => {
        const visible = get().getVisibleTemplates();
        set({ selectedIds: visible.map((t) => t.id) });
      },

      // ===== 拖拽排序 =====

      moveTemplate: (sourceId: string, targetIndex: number) => {
        const state = get();
        const list = [...state.templates];
        const sourceIndex = list.findIndex((t) => t.id === sourceId);
        if (sourceIndex === -1 || targetIndex < 0 || targetIndex >= list.length) return;

        const [moved] = list.splice(sourceIndex, 1);
        list.splice(targetIndex, 0, moved);

        // 同步管理器顺序
        templateManager.load(list);
        set({ templates: list });
      },

      // ===== 状态控制 =====

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'template-storage',
      version: 1,
      // 仅持久化模板主数据，UI 状态（筛选/排序/选择）不持久化
      partialize: (state) => ({ templates: state.templates }),
      // 从持久化恢复时同步到管理器
      onRehydrateStorage: () => (state) => {
        if (state && state.templates) {
          templateManager.load(state.templates);
        }
      },
    }
  )
);

// ============ 选择器 Hooks ============

/**
 * 获取所有模板
 */
export const useAllTemplates = () =>
  useTemplateStore((state) => state.getAllTemplates());

/**
 * 获取当前选中模板
 */
export const useSelectedTemplate = () =>
  useTemplateStore((state) => {
    if (!state.selectedId) return undefined;
    return state.getTemplate(state.selectedId);
  });

/**
 * 获取可见模板（应用筛选+排序+搜索）
 */
export const useVisibleTemplates = () =>
  useTemplateStore((state) => state.getVisibleTemplates());

/**
 * 获取模板统计
 */
export const useTemplateStats = () =>
  useTemplateStore((state) => state.getStats());

/**
 * 获取所有标签
 */
export const useAllTemplateTags = () =>
  useTemplateStore((state) => state.getAllTags());

/**
 * 获取所有使用场景
 */
export const useAllTemplateUseCases = () =>
  useTemplateStore((state) => state.getAllUseCases());

/**
 * 获取按分类分组的模板数量
 */
export const useTemplateCountByCategory = () =>
  useTemplateStore((state) => {
    const stats = state.getStats();
    return stats.byCategory;
  });