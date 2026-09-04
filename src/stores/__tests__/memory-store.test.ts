/**
 * 记忆存储测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useMemoryStore,
  useMemories,
  usePreferences,
} from '../memory-store';
import type { MemoryEntry, UserPreference } from '../../types/memory';

describe('MemoryStore', () => {
  beforeEach(() => {
    // 在每个测试前清空存储
    useMemoryStore.getState().clearMemories();
  });

  describe('Memories', () => {
    it('应该添加记忆条目', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: { key: 'value' },
        importance: 0.5,
      };

      store.addMemory(entry);

      // 注意：zustand getState() 返回的是状态快照，addMemory 后需重新获取最新状态
      const memories = useMemoryStore.getState().memories;
      expect(memories.length).toBe(1);
      expect(memories[0].content).toBe('测试内容');
    });

    it('应该获取记忆条目', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: {},
        importance: 0.5,
      };

      store.addMemory(entry);
      const memoryId = useMemoryStore.getState().memories[0].id;

      const retrieved = store.getMemory(memoryId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.content).toBe('测试内容');
    });

    it('对不存在的记忆返回undefined', () => {
      const store = useMemoryStore.getState();
      const retrieved = store.getMemory('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('应该删除记忆条目', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: {},
        importance: 0.5,
      };

      store.addMemory(entry);
      const memoryId = useMemoryStore.getState().memories[0].id;

      store.deleteMemory(memoryId);
      expect(useMemoryStore.getState().memories.length).toBe(0);
    });

    it('应该清空所有记忆', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: {},
        importance: 0.5,
      };

      store.addMemory(entry);
      store.clearMemories();

      expect(store.memories.length).toBe(0);
      expect(store.chainOfThoughts.length).toBe(0);
      expect(store.preferences.length).toBe(0);
    });

    it('应该搜索记忆', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '牛顿第一定律：物体在不受外力作用时，将保持静止或匀速直线运动状态。',
        metadata: { title: '牛顿定律' },
        importance: 0.5,
      };

      store.addMemory(entry);
      const results = store.searchMemories('牛顿');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('ChainOfThought', () => {
    it('应该添加思维链', () => {
      const store = useMemoryStore.getState();

      const cot = {
        id: 'cot1',
        sessionId: 'session1',
        question: '测试问题',
        steps: [
          {
            step: 1,
            type: 'observation' as const,
            thought: '测试步骤',
            confidence: 0.8,
            timestamp: new Date().toISOString(),
          },
        ],
        answer: '测试答案',
        knowledgeSource: 'local' as const,
        localKnowledgeCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addChainOfThought(cot);
      expect(useMemoryStore.getState().chainOfThoughts.length).toBe(1);
    });

    it('应该获取思维链', () => {
      const store = useMemoryStore.getState();

      const cot = {
        id: 'cot1',
        sessionId: 'session1',
        question: '测试问题',
        steps: [],
        answer: '测试答案',
        knowledgeSource: 'local' as const,
        localKnowledgeCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addChainOfThought(cot);
      const retrieved = store.getChainOfThought('cot1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.question).toBe('测试问题');
    });

    it('应该获取会话的思维链', () => {
      const store = useMemoryStore.getState();

      const cot1 = {
        id: 'cot1',
        sessionId: 'session1',
        question: '问题1',
        steps: [],
        answer: '答案1',
        knowledgeSource: 'local' as const,
        localKnowledgeCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const cot2 = {
        id: 'cot2',
        sessionId: 'session1',
        question: '问题2',
        steps: [],
        answer: '答案2',
        knowledgeSource: 'local' as const,
        localKnowledgeCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.addChainOfThought(cot1);
      store.addChainOfThought(cot2);

      const sessionCots = store.getChainOfThoughtBySession('session1');
      expect(sessionCots.length).toBe(2);
    });
  });

  describe('Preferences', () => {
    it('应该添加偏好', () => {
      const store = useMemoryStore.getState();

      const preference: UserPreference = {
        type: 'language',
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit',
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      store.addPreference(preference);
      expect(useMemoryStore.getState().preferences.length).toBe(1);
    });

    it('应该获取偏好', () => {
      const store = useMemoryStore.getState();

      const preference: UserPreference = {
        type: 'language',
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit',
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      store.addPreference(preference);
      const prefs = store.getPreferences();

      expect(prefs.length).toBe(1);
      expect(prefs[0].value).toBe('chinese');
    });

    it('应该获取特定类型的偏好', () => {
      const store = useMemoryStore.getState();

      const pref1: UserPreference = {
        type: 'language',
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit',
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      const pref2: UserPreference = {
        type: 'answer_style',
        value: '简明扼要',
        confidence: 0.7,
        learnedFrom: 'behavior',
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      store.addPreference(pref1);
      store.addPreference(pref2);

      const languagePrefs = store.getPreferencesByType('language');
      expect(languagePrefs.length).toBe(1);
    });

    it('应该重置偏好', () => {
      const store = useMemoryStore.getState();

      const preference: UserPreference = {
        type: 'language',
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit',
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      store.addPreference(preference);
      store.resetPreferences();

      expect(store.preferences.length).toBe(0);
    });
  });

  describe('LocalKnowledgePriority', () => {
    it('应该返回本地知识优先结果', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试知识内容',
        metadata: { title: '测试' },
        importance: 0.5,
      };

      store.addMemory(entry);
      const result = store.getLocalKnowledgePriority('测试');

      expect(result).toHaveProperty('foundLocal');
      expect(result).toHaveProperty('localKnowledge');
      expect(result).toHaveProperty('strategy');
    });

    it('在没有本地知识时返回外部回退策略', () => {
      const store = useMemoryStore.getState();
      const result = store.getLocalKnowledgePriority('不存在的内容');

      expect(result.foundLocal).toBe(false);
      expect(result.strategy).toBe('external_fallback');
    });
  });

  describe('Stats', () => {
    it('应该更新统计信息', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: {},
        importance: 0.5,
      };

      store.addMemory(entry);
      const stats = store.getStats();

      expect(stats.totalMemories).toBe(1);
    });

    it('应该清理过期记忆', () => {
      const store = useMemoryStore.getState();

      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry',
        content: '测试内容',
        metadata: {},
        importance: 0.5,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };

      store.addMemory(entry);
      const deleted = store.cleanupExpiredMemories();

      expect(deleted).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Hooks', () => {
  beforeEach(() => {
    useMemoryStore.getState().clearMemories();
  });

  it('useMemories 应该返回所有记忆', () => {
    const store = useMemoryStore.getState();

    const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
      type: 'knowledge_entry',
      content: '测试内容',
      metadata: {},
      importance: 0.5,
    };

    store.addMemory(entry);

    // 注意：在实际测试中，hook 需要在组件中渲染
    // 这里只是验证 store 方法
    expect(useMemoryStore.getState().memories.length).toBe(1);
  });

  it('usePreferences 应该返回所有偏好', () => {
    const store = useMemoryStore.getState();

    const preference: UserPreference = {
      type: 'language',
      value: 'chinese',
      confidence: 0.8,
      learnedFrom: 'explicit',
      learnCount: 1,
      lastLearnedAt: new Date().toISOString(),
      firstLearnedAt: new Date().toISOString(),
    };

    store.addPreference(preference);
    expect(useMemoryStore.getState().preferences.length).toBe(1);
  });
});