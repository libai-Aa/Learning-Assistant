/**
 * 标注状态管理 (AnnotationStore)
 * 使用 Zustand 实现标注（高亮、批注、想法标注）的 CRUD 操作和状态管理
 * 通过 persist middleware 实现本地持久化存储
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Annotation,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  AnnotationFilter,
  AnnotationStats,
  AnnotationTypeValue,
  HighlightColorValue,
} from '../types/annotation';

/**
 * AnnotationStore 状态接口
 */
interface AnnotationStoreState {
  /** 所有标注列表 */
  annotations: Annotation[];
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // ===== CRUD 操作 =====

  /**
   * 创建新标注，返回新生成的标注 ID
   */
  addAnnotation: (request: CreateAnnotationRequest) => string;

  /**
   * 根据 ID 获取标注详情
   */
  getAnnotation: (id: string) => Annotation | undefined;

  /**
   * 获取所有标注
   */
  getAllAnnotations: () => Annotation[];

  /**
   * 更新标注，返回是否更新成功
   */
  updateAnnotation: (id: string, request: UpdateAnnotationRequest) => boolean;

  /**
   * 删除标注，返回是否删除成功
   */
  deleteAnnotation: (id: string) => boolean;

  /**
   * 批量删除标注，返回实际删除的数量
   */
  deleteAnnotations: (ids: string[]) => number;

  // ===== 查询操作 =====

  /**
   * 根据知识条目 ID 查询标注
   */
  getAnnotationsByKnowledge: (knowledgeId: string) => Annotation[];

  /**
   * 根据标注类型查询标注
   */
  getAnnotationsByType: (type: AnnotationTypeValue) => Annotation[];

  /**
   * 根据过滤条件查询标注
   */
  getAnnotationsByFilter: (filter: AnnotationFilter) => Annotation[];

  // ===== 高亮标注管理 =====

  /**
   * 获取高亮标注（可选按知识 ID 过滤）
   */
  getHighlights: (knowledgeId?: string) => Annotation[];

  /**
   * 设置高亮颜色
   */
  setHighlightColor: (id: string, color: HighlightColorValue) => boolean;

  // ===== 批注管理 =====

  /**
   * 获取批注（可选按知识 ID 过滤）
   */
  getNotes: (knowledgeId?: string) => Annotation[];

  /**
   * 添加批注（便捷方法，类型固定为 note）
   */
  addNote: (knowledgeId: string, content: string, tags?: string[]) => string;

  /**
   * 添加高亮（便捷方法，类型固定为 highlight）
   */
  addHighlight: (
    knowledgeId: string,
    textFragment: string,
    color?: HighlightColorValue,
    position?: { startOffset: number; endOffset: number }
  ) => string;

  // ===== 统计与清理 =====

  /**
   * 获取统计信息
   */
  getStats: () => AnnotationStats;

  /**
   * 清空所有标注
   */
  clearAll: () => void;

  /**
   * 清空指定知识条目下的所有标注，返回删除数量
   */
  clearByKnowledge: (knowledgeId: string) => number;

  /**
   * 设置加载状态
   */
  setLoading: (loading: boolean) => void;

  /**
   * 设置错误信息
   */
  setError: (error: string | null) => void;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `annotation_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 根据 CreateAnnotationRequest 构造完整的 Annotation 对象
 */
function createAnnotationFromRequest(request: CreateAnnotationRequest): Annotation {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    knowledgeId: request.knowledgeId,
    type: request.type,
    content: request.content,
    highlightColor: request.highlightColor,
    position: request.position,
    tags: request.tags || [],
    createdBy: 'user',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建空的统计对象（避免重复字面量）
 */
function createEmptyStats(): AnnotationStats {
  return {
    total: 0,
    byType: {
      highlight: 0,
      note: 0,
      idea: 0,
    },
    byColor: {
      yellow: 0,
      green: 0,
      blue: 0,
      pink: 0,
      purple: 0,
    },
    byKnowledge: {},
  };
}

/**
 * AnnotationStore Hook
 */
export const useAnnotationStore = create<AnnotationStoreState>()(
  persist(
    (set, get) => ({
      annotations: [],
      isLoading: false,
      error: null,

      // ===== CRUD =====

      addAnnotation: (request: CreateAnnotationRequest) => {
        const annotation = createAnnotationFromRequest(request);
        set((state) => ({
          annotations: [...state.annotations, annotation],
        }));
        return annotation.id;
      },

      getAnnotation: (id: string) => {
        return get().annotations.find((a) => a.id === id);
      },

      getAllAnnotations: () => {
        return get().annotations;
      },

      updateAnnotation: (id: string, request: UpdateAnnotationRequest) => {
        const state = get();
        const index = state.annotations.findIndex((a) => a.id === id);

        if (index === -1) return false;

        const original = state.annotations[index];
        const updated: Annotation = {
          ...original,
          ...request,
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          annotations: [
            ...state.annotations.slice(0, index),
            updated,
            ...state.annotations.slice(index + 1),
          ],
        }));

        return true;
      },

      deleteAnnotation: (id: string) => {
        const state = get();
        const exists = state.annotations.some((a) => a.id === id);
        if (!exists) return false;

        set((state) => ({
          annotations: state.annotations.filter((a) => a.id !== id),
        }));

        return true;
      },

      deleteAnnotations: (ids: string[]) => {
        const state = get();
        const initialLength = state.annotations.length;
        const idSet = new Set(ids);

        set((state) => ({
          annotations: state.annotations.filter((a) => !idSet.has(a.id)),
        }));

        return initialLength - get().annotations.length;
      },

      // ===== 查询 =====

      getAnnotationsByKnowledge: (knowledgeId: string) => {
        return get().annotations.filter((a) => a.knowledgeId === knowledgeId);
      },

      getAnnotationsByType: (type: AnnotationTypeValue) => {
        return get().annotations.filter((a) => a.type === type);
      },

      getAnnotationsByFilter: (filter: AnnotationFilter) => {
        let results = get().annotations;

        if (filter.knowledgeId) {
          results = results.filter((a) => a.knowledgeId === filter.knowledgeId);
        }

        if (filter.type) {
          results = results.filter((a) => a.type === filter.type);
        }

        if (filter.highlightColor) {
          results = results.filter((a) => a.highlightColor === filter.highlightColor);
        }

        if (filter.tag) {
          results = results.filter((a) => a.tags.includes(filter.tag!));
        }

        if (filter.createdBy) {
          results = results.filter((a) => a.createdBy === filter.createdBy);
        }

        if (filter.createdAtFrom) {
          results = results.filter((a) => a.createdAt >= filter.createdAtFrom!);
        }

        if (filter.createdAtTo) {
          results = results.filter((a) => a.createdAt <= filter.createdAtTo!);
        }

        return results;
      },

      // ===== 高亮管理 =====

      getHighlights: (knowledgeId?: string) => {
        const all = get().annotations;
        return all.filter(
          (a) => a.type === 'highlight' && (!knowledgeId || a.knowledgeId === knowledgeId)
        );
      },

      setHighlightColor: (id: string, color: HighlightColorValue) => {
        return get().updateAnnotation(id, { highlightColor: color });
      },

      // ===== 批注管理 =====

      getNotes: (knowledgeId?: string) => {
        const all = get().annotations;
        return all.filter(
          (a) => a.type === 'note' && (!knowledgeId || a.knowledgeId === knowledgeId)
        );
      },

      addNote: (knowledgeId: string, content: string, tags?: string[]) => {
        return get().addAnnotation({
          knowledgeId,
          type: 'note',
          content,
          tags,
        });
      },

      addHighlight: (
        knowledgeId: string,
        textFragment: string,
        color: HighlightColorValue = 'yellow',
        position?: { startOffset: number; endOffset: number }
      ) => {
        return get().addAnnotation({
          knowledgeId,
          type: 'highlight',
          content: textFragment,
          highlightColor: color,
          position: position
            ? {
                startOffset: position.startOffset,
                endOffset: position.endOffset,
                startContainerXPath: '',
                endContainerXPath: '',
                textFragment,
              }
            : undefined,
        });
      },

      // ===== 统计与清理 =====

      getStats: () => {
        const annotations = get().annotations;
        const stats = createEmptyStats();

        annotations.forEach((a) => {
          stats.total++;
          stats.byType[a.type]++;
          if (a.highlightColor) {
            stats.byColor[a.highlightColor]++;
          }
          stats.byKnowledge[a.knowledgeId] = (stats.byKnowledge[a.knowledgeId] || 0) + 1;
        });

        return stats;
      },

      clearAll: () => {
        set({ annotations: [] });
      },

      clearByKnowledge: (knowledgeId: string) => {
        const state = get();
        const initialLength = state.annotations.length;

        set((state) => ({
          annotations: state.annotations.filter((a) => a.knowledgeId !== knowledgeId),
        }));

        return initialLength - get().annotations.length;
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'annotation-storage',
      version: 1,
    }
  )
);

// ===== 选择器 Hooks =====

/**
 * 获取所有标注
 */
export const useAllAnnotations = () => useAnnotationStore((state) => state.getAllAnnotations());

/**
 * 获取指定知识的标注
 */
export const useAnnotationsByKnowledge = (knowledgeId: string) =>
  useAnnotationStore((state) => state.getAnnotationsByKnowledge(knowledgeId));

/**
 * 获取指定类型标注
 */
export const useAnnotationsByType = (type: AnnotationTypeValue) =>
  useAnnotationStore((state) => state.getAnnotationsByType(type));

/**
 * 获取高亮标注
 */
export const useHighlights = (knowledgeId?: string) =>
  useAnnotationStore((state) => state.getHighlights(knowledgeId));

/**
 * 获取批注
 */
export const useNotes = (knowledgeId?: string) =>
  useAnnotationStore((state) => state.getNotes(knowledgeId));

/**
 * 获取标注统计
 */
export const useAnnotationStats = () => useAnnotationStore((state) => state.getStats());