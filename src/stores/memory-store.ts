/**
 * 记忆状态管理
 * 管理记忆条目、偏好、思维链等
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  MemoryType,
  type MemoryEntry,
  type MemorySearchResult,
  type MemorySearchOptions,
  type ChainOfThought,
  type UserPreference,
  type UserProfile,
  type LocalKnowledgePriorityResult,
  type KnowledgeSource,
} from '../types/memory';

/**
 * 记忆状态接口
 */
export interface MemoryState {
  /** 记忆条目列表 */
  memories: MemoryEntry[];
  /** 思维链列表 */
  chainOfThoughts: ChainOfThought[];
  /** 偏好列表 */
  preferences: UserPreference[];
  /** 用户画像 */
  userProfile: UserProfile | null;
  /** 统计信息 */
  stats: {
    totalMemories: number;
    totalChainOfThoughts: number;
    totalPreferences: number;
    lastCleanupAt: string | null;
  };

  // 记忆操作
  /** 添加记忆条目 */
  addMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'>) => void;
  /** 获取记忆条目 */
  getMemory: (id: string) => MemoryEntry | undefined;
  /** 更新记忆访问记录 */
  updateMemoryAccess: (id: string) => void;
  /** 删除记忆条目 */
  deleteMemory: (id: string) => void;
  /** 清空所有记忆 */
  clearMemories: () => void;
  /** 搜索记忆 */
  searchMemories: (query: string, options?: MemorySearchOptions) => MemorySearchResult[];

  // 思维链操作
  /** 添加思维链 */
  addChainOfThought: (cot: ChainOfThought) => void;
  /** 获取思维链 */
  getChainOfThought: (id: string) => ChainOfThought | undefined;
  /** 获取会话的思维链 */
  getChainOfThoughtBySession: (sessionId: string) => ChainOfThought[];
  /** 删除思维链 */
  deleteChainOfThought: (id: string) => void;

  // 偏好操作
  /** 添加偏好 */
  addPreference: (preference: UserPreference) => void;
  /** 获取偏好 */
  getPreferences: () => UserPreference[];
  /** 获取特定类型的偏好 */
  getPreferencesByType: (type: string) => UserPreference[];
  /** 更新偏好 */
  updatePreference: (type: string, value: string, updates: Partial<UserPreference>) => void;
  /** 删除偏好 */
  deletePreference: (type: string, value: string) => void;
  /** 重置所有偏好 */
  resetPreferences: () => void;

  // 用户画像
  /** 设置用户画像 */
  setUserProfile: (profile: UserProfile | null) => void;

  // 本地知识优先
  /** 获取本地知识优先检索结果 */
  getLocalKnowledgePriority: (query: string) => LocalKnowledgePriorityResult;

  // 统计
  /** 获取统计信息 */
  getStats: () => MemoryState['stats'];
  /** 清理过期记忆 */
  cleanupExpiredMemories: () => number;
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

/**
 * 计算文本相似度
 * 支持空格分词（英文）与子串匹配（中文/无空格文本）两种策略
 */
function calculateTextSimilarity(query: string, text: string): number {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // 中文/无空格文本：子串匹配兜底
  // 当 query 整体作为子串出现在 text 中时，认为存在语义关联
  if (queryLower.length > 1 && textLower.includes(queryLower)) {
    return Math.max(0.5, queryLower.length / textLower.length);
  }

  // 空格分词匹配（适用于英文/有空格的文本）
  const queryWords = new Set(
    queryLower
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
  const textWords = new Set(
    textLower
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );

  let intersection = 0;
  for (const word of queryWords) {
    if (textWords.has(word)) {
      intersection++;
    }
  }

  if (queryWords.size === 0) {
    return 0;
  }

  return intersection / queryWords.size;
}

/**
 * 创建记忆状态
 */
export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      memories: [],
      chainOfThoughts: [],
      preferences: [],
      userProfile: null,
      stats: {
        totalMemories: 0,
        totalChainOfThoughts: 0,
        totalPreferences: 0,
        lastCleanupAt: null,
      },

      // 记忆操作
      addMemory: (entry) => {
        const id = generateId();
        const now = new Date().toISOString();
        const newEntry: MemoryEntry = {
          ...entry,
          id,
          accessCount: 0,
          lastAccessedAt: now,
          createdAt: now,
        };

        set((state) => ({
          memories: [...state.memories, newEntry],
          stats: {
            ...state.stats,
            totalMemories: state.memories.length + 1,
          },
        }));
      },

      getMemory: (id) => {
        const memory = get().memories.find((m) => m.id === id);
        if (memory) {
          // 更新访问记录
          set((state) => ({
            memories: state.memories.map((m) =>
              m.id === id
                ? {
                    ...m,
                    accessCount: m.accessCount + 1,
                    lastAccessedAt: new Date().toISOString(),
                  }
                : m
            ),
          }));
        }
        return memory;
      },

      updateMemoryAccess: (id) => {
        set((state) => ({
          memories: state.memories.map((m) =>
            m.id === id
              ? {
                  ...m,
                  accessCount: m.accessCount + 1,
                  lastAccessedAt: new Date().toISOString(),
                }
              : m
          ),
        }));
      },

      deleteMemory: (id) => {
        set((state) => ({
          memories: state.memories.filter((m) => m.id !== id),
          stats: {
            ...state.stats,
            totalMemories: state.memories.length - 1,
          },
        }));
      },

      clearMemories: () => {
        set({
          memories: [],
          chainOfThoughts: [],
          preferences: [],
          stats: {
            totalMemories: 0,
            totalChainOfThoughts: 0,
            totalPreferences: 0,
            lastCleanupAt: new Date().toISOString(),
          },
        });
      },

      searchMemories: (query, options = {}) => {
        const {
          memories,
          chainOfThoughts,
          preferences,
        } = get();

        const {
          maxResults = 10,
          minSimilarity = 0.3,
          includeChainOfThought = true,
          includePreferences = true,
          includeKnowledgeEntries = true,
        } = options;

        const results: MemorySearchResult[] = [];

        // 搜索记忆条目
        for (const memory of memories) {
          if (!includeKnowledgeEntries && memory.type === MemoryType.KNOWLEDGE_ENTRY) {
            continue;
          }
          if (!includeChainOfThought && memory.type === MemoryType.CHAIN_OF_THOUGHT) {
            continue;
          }
          if (!includePreferences && memory.type === MemoryType.PREFERENCE) {
            continue;
          }

          const similarity = calculateTextSimilarity(query, memory.content);
          if (similarity >= minSimilarity) {
            results.push({
              memory,
              similarity,
            });
          }
        }

        // 搜索思维链
        if (includeChainOfThought) {
          for (const cot of chainOfThoughts) {
            const similarity = calculateTextSimilarity(
              query,
              cot.question + ' ' + cot.answer
            );
            if (similarity >= minSimilarity) {
              results.push({
                memory: {
                  id: cot.id,
                  type: MemoryType.CHAIN_OF_THOUGHT,
                  content: JSON.stringify(cot),
                  metadata: {
                    question: cot.question,
                    knowledgeSource: cot.knowledgeSource,
                  },
                  importance: 0.5,
                  accessCount: 0,
                  lastAccessedAt: cot.createdAt,
                  createdAt: cot.createdAt,
                },
                similarity,
              });
            }
          }
        }

        // 搜索偏好
        if (includePreferences) {
          for (const pref of preferences) {
            const similarity = calculateTextSimilarity(query, pref.value);
            if (similarity >= minSimilarity) {
              results.push({
                memory: {
                  id: `pref_${pref.type}_${pref.value}`,
                  type: MemoryType.PREFERENCE,
                  content: JSON.stringify(pref),
                  metadata: {
                    type: pref.type,
                    confidence: pref.confidence,
                  },
                  importance: pref.confidence,
                  accessCount: 0,
                  lastAccessedAt: pref.lastLearnedAt,
                  createdAt: pref.firstLearnedAt,
                },
                similarity,
              });
            }
          }
        }

        return results
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, maxResults);
      },

      // 思维链操作
      addChainOfThought: (cot) => {
        set((state) => ({
          chainOfThoughts: [...state.chainOfThoughts, cot],
          stats: {
            ...state.stats,
            totalChainOfThoughts: state.chainOfThoughts.length + 1,
          },
        }));
      },

      getChainOfThought: (id) => {
        return get().chainOfThoughts.find((c) => c.id === id);
      },

      getChainOfThoughtBySession: (sessionId) => {
        return get().chainOfThoughts.filter((c) => c.sessionId === sessionId);
      },

      deleteChainOfThought: (id) => {
        set((state) => ({
          chainOfThoughts: state.chainOfThoughts.filter((c) => c.id !== id),
          stats: {
            ...state.stats,
            totalChainOfThoughts: state.chainOfThoughts.length - 1,
          },
        }));
      },

      // 偏好操作
      addPreference: (preference) => {
        set((state) => {
          // 检查是否已存在相同偏好
          const existingIndex = state.preferences.findIndex(
            (p) =>
              p.type === preference.type && p.value === preference.value
          );

          if (existingIndex >= 0) {
            // 更新现有偏好
            const updated = [...state.preferences];
            updated[existingIndex] = {
              ...updated[existingIndex],
              ...preference,
              learnCount: updated[existingIndex].learnCount + 1,
            };
            return { preferences: updated };
          }

          return {
            preferences: [...state.preferences, preference],
            stats: {
              ...state.stats,
              totalPreferences: state.preferences.length + 1,
            },
          };
        });
      },

      getPreferences: () => {
        return get().preferences.sort((a, b) => b.confidence - a.confidence);
      },

      getPreferencesByType: (type) => {
        return get()
          .preferences.filter((p) => p.type === type)
          .sort((a, b) => b.confidence - a.confidence);
      },

      updatePreference: (type, value, updates) => {
        set((state) => ({
          preferences: state.preferences.map((p) =>
            p.type === type && p.value === value ? { ...p, ...updates } : p
          ),
        }));
      },

      deletePreference: (type, value) => {
        set((state) => ({
          preferences: state.preferences.filter(
            (p) => !(p.type === type && p.value === value)
          ),
          stats: {
            ...state.stats,
            totalPreferences: state.preferences.length - 1,
          },
        }));
      },

      resetPreferences: () => {
        set({
          preferences: [],
          stats: {
            ...get().stats,
            totalPreferences: 0,
          },
        });
      },

      // 用户画像
      setUserProfile: (profile) => {
        set({ userProfile: profile });
      },

      // 本地知识优先
      getLocalKnowledgePriority: (query) => {
        const localKnowledge: KnowledgeSource[] = [];
        const externalKnowledge: KnowledgeSource[] = [];

        // 搜索本地记忆
        const searchResults = get().searchMemories(query, {
          maxResults: 5,
          minSimilarity: 0.3,
        });

        for (const result of searchResults) {
          localKnowledge.push({
            id: result.memory.id,
            type: 'local' as const,
            name: String(result.memory.metadata?.title ?? '本地知识'),
            content: result.memory.content,
            relevance: result.similarity,
            metadata: result.memory.metadata,
          });
        }

        // 判断策略
        let strategy: 'local_first' | 'local_only' | 'external_fallback';
        if (localKnowledge.length >= 3) {
          strategy = 'local_only';
        } else if (localKnowledge.length > 0) {
          strategy = 'local_first';
        } else {
          strategy = 'external_fallback';
        }

        return {
          foundLocal: localKnowledge.length > 0,
          localKnowledge,
          externalKnowledge,
          strategy,
          retrievedAt: new Date().toISOString(),
        };
      },

      // 统计
      getStats: () => {
        return get().stats;
      },

      cleanupExpiredMemories: () => {
        const now = new Date();
        let deletedCount = 0;

        set((state) => {
          const validMemories = state.memories.filter((m) => {
            if (!m.expiresAt) return true;
            if (new Date(m.expiresAt) < now) {
              deletedCount++;
              return false;
            }
            return true;
          });

          return {
            memories: validMemories,
            stats: {
              ...state.stats,
              totalMemories: validMemories.length,
              lastCleanupAt: now.toISOString(),
            },
          };
        });

        return deletedCount;
      },
    }),
    {
      name: 'memory-storage',
      partialize: (state) => ({
        memories: state.memories,
        chainOfThoughts: state.chainOfThoughts,
        preferences: state.preferences,
        userProfile: state.userProfile,
        stats: state.stats,
      }),
    }
  )
);

/**
 * Hook to get all memories
 */
export function useMemories() {
  return useMemoryStore((state) => state.memories);
}

/**
 * Hook to get all chain of thoughts
 */
export function useChainOfThoughts() {
  return useMemoryStore((state) => state.chainOfThoughts);
}

/**
 * Hook to get all preferences
 */
export function usePreferences() {
  return useMemoryStore((state) => state.preferences);
}

/**
 * Hook to get user profile
 */
export function useUserProfile() {
  return useMemoryStore((state) => state.userProfile);
}