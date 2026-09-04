/**
 * 记忆管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager, createMemoryManager } from '../memory-manager';
import type {
  ChainOfThought,
  MemoryEntry,
  MemorySearchOptions,
  LocalKnowledgePriorityResult,
} from '../../../types/memory';

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = createMemoryManager({
      maxMemoryEntries: 100,
      defaultExpiryDays: 365,
      localKnowledgeThreshold: 0.7,
      semanticSimilarityThreshold: 0.5,
    });
  });

  describe('ChainOfThought', () => {
    const createTestCot = (
      id: string,
      sessionId: string,
      question: string
    ): ChainOfThought => ({
      id,
      sessionId,
      question,
      steps: [
        {
          step: 1,
          type: 'observation',
          thought: '测试步骤',
          confidence: 0.8,
          timestamp: new Date().toISOString(),
        },
      ],
      answer: '测试答案',
      knowledgeSource: 'local',
      localKnowledgeCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('应该记录思维链', async () => {
      const cot = createTestCot('cot1', 'session1', '测试问题');
      await manager.recordChainOfThought(cot);

      const retrieved = await manager.getChainOfThought('cot1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.question).toBe('测试问题');
    });

    it('应该获取会话的思维链', async () => {
      const cot1 = createTestCot('cot1', 'session1', '问题1');
      const cot2 = createTestCot('cot2', 'session1', '问题2');
      const cot3 = createTestCot('cot3', 'session2', '问题3');

      await manager.recordChainOfThought(cot1);
      await manager.recordChainOfThought(cot2);
      await manager.recordChainOfThought(cot3);

      const sessionCots = await manager.getChainOfThoughtBySession('session1');
      expect(sessionCots.length).toBe(2);
    });

    it('对不存在的思维链返回null', async () => {
      const cot = await manager.getChainOfThought('non-existent');
      expect(cot).toBeNull();
    });
  });

  describe('Preferences', () => {
    it('应该记录偏好', async () => {
      const preference = {
        type: 'language' as const,
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit' as const,
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      await manager.recordPreference(preference);
      const prefs = await manager.getPreferences();

      expect(prefs.length).toBe(1);
      expect(prefs[0].value).toBe('chinese');
    });

    it('应该获取特定类型的偏好', async () => {
      const pref1 = {
        type: 'language' as const,
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit' as const,
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };
      const pref2 = {
        type: 'answer_style' as const,
        value: '简明扼要',
        confidence: 0.7,
        learnedFrom: 'behavior' as const,
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      await manager.recordPreference(pref1);
      await manager.recordPreference(pref2);

      const languagePrefs = await manager.getPreferencesByType('language');
      expect(languagePrefs.length).toBe(1);
      expect(languagePrefs[0].value).toBe('chinese');
    });

    it('应该重置偏好', async () => {
      const preference = {
        type: 'language' as const,
        value: 'chinese',
        confidence: 0.8,
        learnedFrom: 'explicit' as const,
        learnCount: 1,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      await manager.recordPreference(preference);
      await manager.resetPreferences();

      const prefs = await manager.getPreferences();
      expect(prefs.length).toBe(0);
    });
  });

  describe('Memory Search', () => {
    beforeEach(async () => {
      // 添加一些测试记忆
      const entry1: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '牛顿第一定律：物体在不受外力作用时，将保持静止或匀速直线运动状态。',
        metadata: { title: '牛顿定律' },
        importance: 0.5,
      };

      const entry2: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '微积分是数学的一个分支，研究函数的导数和积分。',
        metadata: { title: '微积分' },
        importance: 0.5,
      };

      await manager.addMemoryEntry(entry1);
      await manager.addMemoryEntry(entry2);
    });

    it('应该搜索记忆', async () => {
      const results = await manager.searchMemory('牛顿');
      expect(results.length).toBeGreaterThan(0);
    });

    it('应该支持搜索选项', async () => {
      const options: MemorySearchOptions = {
        maxResults: 1,
        minSimilarity: 0.1,
      };

      const results = await manager.searchMemory('定律', options);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('应该返回空结果当没有匹配', async () => {
      const results = await manager.searchMemory('不存在的关键词xyz');
      expect(results.length).toBe(0);
    });
  });

  describe('Local Knowledge Priority', () => {
    it('应该返回本地知识优先结果', async () => {
      // 添加一些本地知识
      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '测试知识内容，用于检索。',
        metadata: { title: '测试知识' },
        importance: 0.5,
      };

      await manager.addMemoryEntry(entry);

      const result = await manager.getLocalKnowledgePriority('测试知识');

      expect(result).toHaveProperty('foundLocal');
      expect(result).toHaveProperty('localKnowledge');
      expect(result).toHaveProperty('externalKnowledge');
      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('retrievedAt');
    });

    it('在没有本地知识时返回外部回退策略', async () => {
      const result = await manager.getLocalKnowledgePriority('不存在的内容');

      expect(result.foundLocal).toBe(false);
      expect(result.strategy).toBe('external_fallback');
    });
  });

  describe('Memory Entry Management', () => {
    it('应该添加记忆条目', async () => {
      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '测试内容',
        metadata: { key: 'value' },
        importance: 0.5,
      };

      const added = await manager.addMemoryEntry(entry);
      expect(added.id).toBeDefined();
      expect(added.content).toBe('测试内容');
    });

    it('应该更新访问记录', async () => {
      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '测试内容',
        metadata: {},
        importance: 0.5,
      };

      const added = await manager.addMemoryEntry(entry);
      await manager.updateMemoryAccess(added.id);

      // 再次获取应该增加访问计数
      const retrieved = await manager.getChainOfThought(added.id);
      // 注意：这里测试的是记忆管理器的行为
    });

    it('应该清理过期记忆', async () => {
      const entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastAccessedAt' | 'accessCount'> = {
        type: 'knowledge_entry' as const,
        content: '测试内容',
        metadata: {},
        importance: 0.5,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // 已过期
      };

      await manager.addMemoryEntry(entry);
      const deleted = await manager.cleanupExpiredMemories();

      expect(deleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Knowledge Entries', () => {
    it('应该添加知识条目', async () => {
      const entry = {
        id: 'knowledge1',
        title: '测试知识',
        content: '这是测试知识内容',
        tags: ['test', 'example'],
        sourceType: 'local' as const,
        sourceName: '测试来源',
        createdAt: new Date().toISOString(),
      };

      await manager.addKnowledgeEntry(entry);
      const retrieved = manager.getKnowledgeEntry('knowledge1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('测试知识');
    });

    it('应该搜索知识库', async () => {
      const entry = {
        id: 'knowledge1',
        title: '物理知识',
        content: '牛顿定律是物理学基础',
        tags: ['physics'],
        sourceType: 'local' as const,
        sourceName: '测试来源',
        createdAt: new Date().toISOString(),
      };

      await manager.addKnowledgeEntry(entry);
      const results = await manager.searchKnowledge('牛顿');

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('UserProfile', () => {
    it('应该构建用户画像', async () => {
      const preference = {
        type: 'domain' as const,
        value: '计算机科学',
        confidence: 0.8,
        learnedFrom: 'behavior' as const,
        learnCount: 5,
        lastLearnedAt: new Date().toISOString(),
        firstLearnedAt: new Date().toISOString(),
      };

      await manager.recordPreference(preference);
      const profile = await manager.getUserProfile();

      expect(profile).not.toBeNull();
      expect(profile!.preferences.length).toBeGreaterThan(0);
    });

    it('在没有偏好时返回null', async () => {
      const profile = await manager.getUserProfile();
      expect(profile).toBeNull();
    });
  });
});

describe('createMemoryManager', () => {
  it('应该创建默认的记忆管理器', () => {
    const manager = createMemoryManager();
    expect(manager).toBeInstanceOf(MemoryManager);
  });

  it('应该使用自定义配置', () => {
    const manager = createMemoryManager({
      maxMemoryEntries: 500,
      defaultExpiryDays: 180,
    });
    expect(manager).toBeInstanceOf(MemoryManager);
  });
});