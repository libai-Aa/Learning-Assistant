/**
 * 聊天状态管理
 * 扩展支持记忆机制
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChainOfThought,
  UserPreference,
  UserProfile,
  MemoryEntry,
  MemorySearchOptions,
  LocalKnowledgePriorityResult,
} from '../types/memory';
import { MemoryManager } from '../lib/agent/memory-manager';
import { PreferenceLearner } from '../lib/agent/preference-learner';

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  /** 使用的本地知识ID列表 */
  usedKnowledgeIds?: string[];
  /** 关联的思维链ID */
  chainOfThoughtId?: string;
  /** 是否为第一性原理回答 */
  isFirstPrinciples?: boolean;
}

/**
 * 聊天会话接口
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 聊天状态接口
 */
export interface ChatState {
  /** 会话列表 */
  sessions: ChatSession[];
  /** 当前活跃会话ID */
  currentSessionId: string | null;
  /** 是否启用记忆机制 */
  memoryEnabled: boolean;
  /** 是否启用第一性原理 */
  firstPrinciplesEnabled: boolean;
  /** 是否启用本地知识优先 */
  localKnowledgePriorityEnabled: boolean;

  // 记忆管理
  memoryManager: MemoryManager | null;
  preferenceLearner: PreferenceLearner | null;

  // 操作方法
  /** 创建新会话 */
  createSession: () => string;
  /** 切换会话 */
  switchSession: (sessionId: string) => void;
  /** 删除会话 */
  deleteSession: (sessionId: string) => void;
  /** 清空所有会话 */
  clearAllSessions: () => void;

  /** 添加消息 */
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  /** 更新消息 */
  updateMessage: (
    sessionId: string,
    messageId: string,
    updates: Partial<ChatMessage>
  ) => void;

  /** 启用/禁用记忆机制 */
  setMemoryEnabled: (enabled: boolean) => void;
  /** 启用/禁用第一性原理 */
  setFirstPrinciplesEnabled: (enabled: boolean) => void;
  /** 启用/禁用本地知识优先 */
  setLocalKnowledgePriorityEnabled: (enabled: boolean) => void;

  // 记忆相关方法
  /** 记录思维链 */
  recordChainOfThought: (cot: ChainOfThought) => Promise<void>;
  /** 获取会话的思维链 */
  getSessionChainOfThought: (sessionId: string) => Promise<ChainOfThought[]>;
  /** 记录偏好 */
  recordPreference: (preference: UserPreference) => Promise<void>;
  /** 获取偏好 */
  getPreferences: () => Promise<UserPreference[]>;
  /** 重置偏好 */
  resetPreferences: () => Promise<void>;
  /** 搜索记忆 */
  searchMemory: (
    query: string,
    options?: MemorySearchOptions
  ) => Promise<MemoryEntry[]>;
  /** 获取本地知识优先检索结果 */
  getLocalKnowledgePriority: (
    query: string
  ) => Promise<LocalKnowledgePriorityResult>;
  /** 获取用户画像 */
  getUserProfile: () => Promise<UserProfile | null>;

  /** 初始化记忆管理器 */
  initMemoryManager: () => void;
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .substring(2, 9)}`;
}

/**
 * 创建聊天状态
 */
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      memoryEnabled: true,
      firstPrinciplesEnabled: true,
      localKnowledgePriorityEnabled: true,
      memoryManager: null,
      preferenceLearner: null,

      createSession: () => {
        const id = `session_${Date.now().toString(36)}`;
        const newSession: ChatSession = {
          id,
          title: '新对话',
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          sessions: [...state.sessions, newSession],
          currentSessionId: id,
        }));

        return id;
      },

      switchSession: (sessionId: string) => {
        set({ currentSessionId: sessionId });
      },

      deleteSession: (sessionId: string) => {
        set((state) => {
          const sessions = state.sessions.filter(
            (s) => s.id !== sessionId
          );
          const currentSessionId =
            state.currentSessionId === sessionId
              ? sessions[0]?.id || null
              : state.currentSessionId;

          return { sessions, currentSessionId };
        });
      },

      clearAllSessions: () => {
        set({
          sessions: [],
          currentSessionId: null,
        });
      },

      addMessage: (message) => {
        const { currentSessionId, sessions } = get();
        if (!currentSessionId) return;

        const newMessage: ChatMessage = {
          ...message,
          id: generateId(),
          timestamp: new Date().toISOString(),
        };

        set({
          sessions: sessions.map((session) =>
            session.id === currentSessionId
              ? {
                  ...session,
                  messages: [...session.messages, newMessage],
                  updatedAt: new Date().toISOString(),
                }
              : session
          ),
        });
      },

      updateMessage: (sessionId, messageId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, ...updates } : msg
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : session
          ),
        }));
      },

      setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
      setFirstPrinciplesEnabled: (enabled) =>
        set({ firstPrinciplesEnabled: enabled }),
      setLocalKnowledgePriorityEnabled: (enabled) =>
        set({ localKnowledgePriorityEnabled: enabled }),

      // 记忆相关方法
      recordChainOfThought: async (cot) => {
        const { memoryManager } = get();
        if (memoryManager) {
          await memoryManager.recordChainOfThought(cot);
        }
      },

      getSessionChainOfThought: async (sessionId) => {
        const { memoryManager } = get();
        if (memoryManager) {
          return memoryManager.getChainOfThoughtBySession(sessionId);
        }
        return [];
      },

      recordPreference: async (preference) => {
        const { memoryManager, preferenceLearner } = get();
        if (memoryManager) {
          await memoryManager.recordPreference(preference);
        }
        if (preferenceLearner) {
          // 同步到偏好学习器
          const key = `${preference.type}_${preference.value}`;
          const behaviorType: 'explicit_preference' | 'implicit_preference' | 'behavior' =
            preference.learnedFrom === 'explicit' ? 'explicit_preference' :
            preference.learnedFrom === 'implicit' ? 'implicit_preference' : 'behavior';
          preferenceLearner.learnFromBehavior({
            id: key,
            type: behaviorType,
            preferenceType: preference.type,
            preferenceValue: preference.value,
            timestamp: preference.lastLearnedAt,
          });
        }
      },

      getPreferences: async () => {
        const { memoryManager } = get();
        if (memoryManager) {
          return memoryManager.getPreferences();
        }
        return [];
      },

      resetPreferences: async () => {
        const { memoryManager, preferenceLearner } = get();
        if (memoryManager) {
          await memoryManager.resetPreferences();
        }
        if (preferenceLearner) {
          preferenceLearner.reset();
        }
      },

      searchMemory: async (query, options) => {
        const { memoryManager } = get();
        if (memoryManager) {
          const results = await memoryManager.searchMemory(query, options);
          return results.map((r) => r.memory);
        }
        return [];
      },

      getLocalKnowledgePriority: async (query) => {
        const { memoryManager } = get();
        if (memoryManager) {
          return memoryManager.getLocalKnowledgePriority(query);
        }
        return {
          foundLocal: false,
          localKnowledge: [],
          externalKnowledge: [],
          strategy: 'external_fallback',
          retrievedAt: new Date().toISOString(),
        };
      },

      getUserProfile: async () => {
        const { memoryManager } = get();
        if (memoryManager) {
          return memoryManager.getUserProfile();
        }
        return null;
      },

      initMemoryManager: () => {
        const { memoryManager } = get();
        if (!memoryManager) {
          const manager = new MemoryManager();
          const learner = new PreferenceLearner();
          set({ memoryManager: manager, preferenceLearner: learner });
        }
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        memoryEnabled: state.memoryEnabled,
        firstPrinciplesEnabled: state.firstPrinciplesEnabled,
        localKnowledgePriorityEnabled: state.localKnowledgePriorityEnabled,
      }),
    }
  )
);

/**
 * Hook to get current session
 */
export function useCurrentSession() {
  const sessions = useChatStore((state) => state.sessions);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  return sessions.find((s) => s.id === currentSessionId) || null;
}

/**
 * Hook to get messages of current session
 */
export function useCurrentMessages() {
  const session = useCurrentSession();
  return session?.messages || [];
}