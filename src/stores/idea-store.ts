/**
 * 想法状态管理 (IdeaStore)
 * 使用 Zustand 实现想法的 CRUD 操作和状态管理
 */

import { create } from 'zustand';

import { persist } from 'zustand/middleware';
import { useMemo } from 'react';
import {
  Idea,
  CreateIdeaRequest,
  UpdateIdeaRequest,
  IdeaFilter,
  IdeaSortOptions,
  IdeaStats,
  PracticeStatusValue,
  ImportanceLevelValue,
  UrgencyLevelValue,
} from '../types/idea';
import { ImportanceLevel, UrgencyLevel } from '../types/knowledge';

/**
 * IdeaStore 状态接口
 */
interface IdeaStoreState {
  /** 所有想法列表 */
  ideas: Idea[];
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // CRUD 操作
  /**
   * 创建新想法
   */
  createIdea: (request: CreateIdeaRequest) => string;

  /**
   * 获取想法详情
   */
  getIdea: (id: string) => Idea | undefined;

  /**
   * 获取所有想法
   */
  getAllIdeas: () => Idea[];

  /**
   * 根据状态获取想法
   */
  getIdeasByStatus: (status: PracticeStatusValue) => Idea[];

  /**
   * 根据知识条目获取想法
   */
  getIdeasByKnowledge: (knowledgeId: string) => Idea[];

  /**
   * 根据过滤条件获取想法
   */
  getIdeasByFilter: (filter: IdeaFilter) => Idea[];

  /**
   * 获取排序后的想法
   */
  getSortedIdeas: (sortOptions: IdeaSortOptions, filter?: IdeaFilter) => Idea[];

  /**
   * 更新想法
   */
  updateIdea: (id: string, request: UpdateIdeaRequest) => boolean;

  /**
   * 更新实践状态
   */
  updatePracticeStatus: (id: string, status: PracticeStatusValue, reason?: string) => boolean;

  /**
   * 删除想法
   */
  deleteIdea: (id: string) => boolean;

  /**
   * 批量删除想法
   */
  deleteIdeas: (ids: string[]) => number;

  /**
   * 获取统计信息
   */
  getStats: () => IdeaStats;

  /**
   * 设置重要性等级
   */
  setImportance: (id: string, importance: ImportanceLevelValue) => boolean;

  /**
   * 设置紧急度等级
   */
  setUrgency: (id: string, urgency: UrgencyLevelValue) => boolean;

  /**
   * 设置优先级分数
   */
  setPriorityScore: (id: string, score: number) => boolean;

  /**
   * 获取待提醒的想法
   */
  getReminders: () => Idea[];

  /**
   * 清空所有想法
   */
  clearAll: () => void;

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
 * 生成唯一ID
 */
function generateId(): string {
  return `idea_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 创建初始想法对象
 */
function createIdeaFromRequest(request: CreateIdeaRequest): Idea {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    content: request.content,
    practiceStatus: 'new',
    source: request.source,
    knowledgeId: request.knowledgeId,
    annotationId: request.annotationId,
    researchQuestionId: request.researchQuestionId,
    importance: ImportanceLevel.MEDIUM,
    urgency: UrgencyLevel.NORMAL,
    priorityScore: 50,
    tags: request.tags || [],
    createdBy: 'user',
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
  };
}

/**
 * IdeaStore Hook
 */
export const useIdeaStore = create<IdeaStoreState>()(
  persist(
    (set, get) => ({
      ideas: [],
      isLoading: false,
      error: null,

      createIdea: (request: CreateIdeaRequest) => {
        const idea = createIdeaFromRequest(request);
        set((state) => ({
          ideas: [...state.ideas, idea],
        }));
        return idea.id;
      },

      getIdea: (id: string) => {
        return get().ideas.find((idea) => idea.id === id);
      },

      getAllIdeas: () => {
        return get().ideas;
      },

      getIdeasByStatus: (status: PracticeStatusValue) => {
        return get().ideas.filter((idea) => idea.practiceStatus === status);
      },

      getIdeasByKnowledge: (knowledgeId: string) => {
        return get().ideas.filter((idea) => idea.knowledgeId === knowledgeId);
      },

      getIdeasByFilter: (filter: IdeaFilter) => {
        let results = get().ideas;

        if (filter.practiceStatus) {
          results = results.filter((idea) => idea.practiceStatus === filter.practiceStatus);
        }

        if (filter.source) {
          results = results.filter((idea) => idea.source === filter.source);
        }

        if (filter.knowledgeId) {
          results = results.filter((idea) => idea.knowledgeId === filter.knowledgeId);
        }

        if (filter.tag) {
          results = results.filter((idea) => idea.tags.includes(filter.tag!));
        }

        if (filter.importance) {
          results = results.filter((idea) => idea.importance === filter.importance);
        }

        if (filter.urgency) {
          results = results.filter((idea) => idea.urgency === filter.urgency);
        }

        if (filter.createdAtFrom) {
          results = results.filter((idea) => idea.createdAt >= filter.createdAtFrom!);
        }

        if (filter.createdAtTo) {
          results = results.filter((idea) => idea.createdAt <= filter.createdAtTo!);
        }

        if (filter.hasReminder !== undefined) {
          results = results.filter((idea) =>
            filter.hasReminder ? !!idea.reminderAt : !idea.reminderAt
          );
        }

        return results;
      },

      getSortedIdeas: (sortOptions: IdeaSortOptions, filter?: IdeaFilter) => {
        let results = filter ? get().getIdeasByFilter(filter) : get().ideas;

        const sorted = [...results].sort((a, b) => {
          let comparison = 0;

          switch (sortOptions.sortBy) {
            case 'createdAt':
              comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              break;
            case 'updatedAt':
              comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
              break;
            case 'priorityScore':
              comparison = a.priorityScore - b.priorityScore;
              break;
            case 'statusChangedAt':
              comparison =
                new Date(a.statusChangedAt).getTime() - new Date(b.statusChangedAt).getTime();
              break;
          }

          return sortOptions.sortOrder === 'asc' ? comparison : -comparison;
        });

        return sorted;
      },

      updateIdea: (id: string, request: UpdateIdeaRequest) => {
        const state = get();
        const index = state.ideas.findIndex((idea) => idea.id === id);

        if (index === -1) return false;

        const idea = state.ideas[index];
        const updatedIdea: Idea = {
          ...idea,
          ...request,
          updatedAt: new Date().toISOString(),
        };

        if (request.practiceStatus && request.practiceStatus !== idea.practiceStatus) {
          updatedIdea.statusChangedAt = new Date().toISOString();
        }

        set((state) => ({
          ideas: [
            ...state.ideas.slice(0, index),
            updatedIdea,
            ...state.ideas.slice(index + 1),
          ],
        }));

        return true;
      },

      updatePracticeStatus: (id: string, status: PracticeStatusValue, reason?: string) => {
        const state = get();
        const index = state.ideas.findIndex((idea) => idea.id === id);

        if (index === -1) return false;

        const idea = state.ideas[index];
        const now = new Date().toISOString();

        const updatedIdea: Idea = {
          ...idea,
          practiceStatus: status,
          updatedAt: now,
          statusChangedAt: now,
        };

        // 如果标记为完成，记录实践成果
        if (status === 'done' && !updatedIdea.outcome) {
          updatedIdea.outcome = reason || '已完成';
        }

        set((state) => ({
          ideas: [
            ...state.ideas.slice(0, index),
            updatedIdea,
            ...state.ideas.slice(index + 1),
          ],
        }));

        return true;
      },

      deleteIdea: (id: string) => {
        const state = get();
        const index = state.ideas.findIndex((idea) => idea.id === id);

        if (index === -1) return false;

        set((state) => ({
          ideas: state.ideas.filter((idea) => idea.id !== id),
        }));

        return true;
      },

      deleteIdeas: (ids: string[]) => {
        const state = get();
        const initialLength = state.ideas.length;

        set((state) => ({
          ideas: state.ideas.filter((idea) => !ids.includes(idea.id)),
        }));

        return initialLength - get().ideas.length;
      },

      getStats: () => {
        const ideas = get().ideas;

        const stats: IdeaStats = {
          total: ideas.length,
          byStatus: {
            new: 0,
            pending: 0,
            active: 0,
            done: 0,
            falsified: 0,
          },
          bySource: {
            reading: 0,
            annotation: 0,
            research: 0,
            chat: 0,
            manual: 0,
          },
          byImportance: {
            high: 0,
            medium: 0,
            low: 0,
          },
          byUrgency: {
            urgent: 0,
            normal: 0,
            not_urgent: 0,
          },
        };

        ideas.forEach((idea) => {
          stats.byStatus[idea.practiceStatus]++;
          stats.bySource[idea.source]++;
          stats.byImportance[idea.importance]++;
          stats.byUrgency[idea.urgency]++;
        });

        return stats;
      },

      setImportance: (id: string, importance: ImportanceLevelValue) => {
        return get().updateIdea(id, { importance });
      },

      setUrgency: (id: string, urgency: UrgencyLevelValue) => {
        return get().updateIdea(id, { urgency });
      },

      setPriorityScore: (id: string, score: number) => {
        const state = get();
        const index = state.ideas.findIndex((idea) => idea.id === id);

        if (index === -1) return false;

        set((state) => ({
          ideas: [
            ...state.ideas.slice(0, index),
            { ...state.ideas[index], priorityScore: score },
            ...state.ideas.slice(index + 1),
          ],
        }));

        return true;
      },

      getReminders: () => {
        const now = new Date().toISOString();
        return get().ideas.filter(
          (idea) => idea.reminderAt && idea.reminderAt <= now && idea.practiceStatus !== 'done'
        );
      },

      clearAll: () => {
        set({ ideas: [] });
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'idea-storage',
      version: 1,
    }
  )
);

/**
 * 选择器 Hooks
 */

/**
 * 获取所有想法
 */
export const useAllIdeas = () => useIdeaStore((state) => state.getAllIdeas());

/**
 * 获取按状态分组的想法
 */
export const useIdeasByStatus = (status: PracticeStatusValue) =>
  useIdeaStore((state) => state.getIdeasByStatus(status));

/**
 * 获取想法统计
 */
export const useIdeaStats = () => {
  const ideas = useIdeaStore((state) => state.ideas);
  return useMemo(() => ({
    total: ideas.length,
    byStatus: {
      new: ideas.filter(i => i.practiceStatus === 'new').length,
      pending: ideas.filter(i => i.practiceStatus === 'pending').length,
      active: ideas.filter(i => i.practiceStatus === 'active').length,
      done: ideas.filter(i => i.practiceStatus === 'done').length,
      falsified: ideas.filter(i => i.practiceStatus === 'falsified').length,
    },
  }), [ideas]);
};

/**
 * 获取待办想法（新 + 待跟进）
 */
export const usePendingIdeas = () => {
  // React 19 + zustand 5: selector不能返回新引用，否则useSyncExternalStore无限重渲染
  // 方案：只订阅ideas数组（引用稳定），用useMemo计算pendingIdeas
  const ideas = useIdeaStore((state) => state.ideas);
  return useMemo(() => {
    const newIdeas = ideas.filter((idea) => idea.practiceStatus === 'new');
    const pendingIdeas = ideas.filter((idea) => idea.practiceStatus === 'pending');
    return [...newIdeas, ...pendingIdeas].sort(
      (a, b) => b.priorityScore - a.priorityScore
    );
  }, [ideas]);
};