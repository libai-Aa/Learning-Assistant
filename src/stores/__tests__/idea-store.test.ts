/**
 * IdeaStore 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useIdeaStore } from '../../stores/idea-store';
import { ImportanceLevel, UrgencyLevel } from '../../types/knowledge';
import { PracticeStatus, IdeaSource } from '../../types/idea';

// Mock Zustand persist
vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
}));

describe('IdeaStore', () => {
  // 在每个测试前重置 store
  beforeEach(() => {
    // 清除所有想法
    useIdeaStore.setState({ ideas: [] });
  });

  describe('createIdea', () => {
    it('should create a new idea and return its id', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '这是一个新想法',
        source: 'manual',
      });

      expect(id).toBeDefined();
      expect(id).toMatch(/^idea_/);

      const ideas = store.getAllIdeas();
      expect(ideas).toHaveLength(1);
      expect(ideas[0].content).toBe('这是一个新想法');
      expect(ideas[0].practiceStatus).toBe('new');
    });

    it('should create idea with optional fields', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '带标签的想法',
        source: 'reading',
        knowledgeId: 'knowledge_123',
        tags: ['重要', '待跟进'],
      });

      const idea = store.getIdea(id);
      expect(idea).toBeDefined();
      expect(idea?.knowledgeId).toBe('knowledge_123');
      expect(idea?.tags).toEqual(['重要', '待跟进']);
    });
  });

  describe('getIdea', () => {
    it('should return undefined for non-existent idea', () => {
      const store = useIdeaStore.getState();

      const idea = store.getIdea('non_existent_id');

      expect(idea).toBeUndefined();
    });

    it('should return existing idea by id', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      const idea = store.getIdea(id);

      expect(idea).toBeDefined();
      expect(idea?.id).toBe(id);
      expect(idea?.content).toBe('测试想法');
    });
  });

  describe('getAllIdeas', () => {
    it('should return empty array when no ideas', () => {
      const store = useIdeaStore.getState();

      const ideas = store.getAllIdeas();

      expect(ideas).toEqual([]);
    });

    it('should return all ideas', () => {
      const store = useIdeaStore.getState();

      store.createIdea({ content: '想法1', source: 'manual' });
      store.createIdea({ content: '想法2', source: 'manual' });

      const ideas = store.getAllIdeas();

      expect(ideas).toHaveLength(2);
    });
  });

  describe('getIdeasByStatus', () => {
    beforeEach(() => {
      const store = useIdeaStore.getState();
      store.createIdea({ content: '新想法1', source: 'manual' });
      store.createIdea({ content: '新想法2', source: 'manual' });
      store.createIdea({ content: '待跟进想法', source: 'manual' });
    });

    it('should return ideas by status', () => {
      const store = useIdeaStore.getState();

      // 将第三个想法设为 pending
      const allIdeas = store.getAllIdeas();
      store.updatePracticeStatus(allIdeas[2].id, 'pending');

      const newIdeas = store.getIdeasByStatus('new');
      const pendingIdeas = store.getIdeasByStatus('pending');

      expect(newIdeas).toHaveLength(2);
      expect(pendingIdeas).toHaveLength(1);
      expect(pendingIdeas[0].content).toBe('待跟进想法');
    });

    it('should return empty array for status with no ideas', () => {
      const store = useIdeaStore.getState();

      const doneIdeas = store.getIdeasByStatus('done');

      expect(doneIdeas).toEqual([]);
    });
  });

  describe('getIdeasByKnowledge', () => {
    it('should return ideas associated with specific knowledge', () => {
      const store = useIdeaStore.getState();

      store.createIdea({
        content: '想法关联到知识1',
        source: 'reading',
        knowledgeId: 'knowledge_1',
      });
      store.createIdea({
        content: '想法关联到知识2',
        source: 'reading',
        knowledgeId: 'knowledge_2',
      });
      store.createIdea({
        content: '独立想法',
        source: 'manual',
      });

      const ideasForKnowledge1 = store.getIdeasByKnowledge('knowledge_1');

      expect(ideasForKnowledge1).toHaveLength(1);
      expect(ideasForKnowledge1[0].knowledgeId).toBe('knowledge_1');
    });

    it('should return empty array for non-existent knowledge', () => {
      const store = useIdeaStore.getState();

      const ideas = store.getIdeasByKnowledge('non_existent');

      expect(ideas).toEqual([]);
    });
  });

  describe('updateIdea', () => {
    it('should update idea content', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '原始内容',
        source: 'manual',
      });

      const updated = store.updateIdea(id, { content: '更新后的内容' });

      expect(updated).toBe(true);

      const idea = store.getIdea(id);
      expect(idea?.content).toBe('更新后的内容');
    });

    it('should update idea tags', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
        tags: ['标签1'],
      });

      store.updateIdea(id, { tags: ['标签1', '标签2', '标签3'] });

      const idea = store.getIdea(id);
      expect(idea?.tags).toEqual(['标签1', '标签2', '标签3']);
    });

    it('should return false for non-existent idea', () => {
      const store = useIdeaStore.getState();

      const updated = store.updateIdea('non_existent', { content: '新内容' });

      expect(updated).toBe(false);
    });
  });

  describe('updatePracticeStatus', () => {
    it('should update practice status and statusChangedAt', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      const beforeUpdate = new Date().toISOString();

      const updated = store.updatePracticeStatus(id, 'pending');

      expect(updated).toBe(true);

      const idea = store.getIdea(id);
      expect(idea?.practiceStatus).toBe('pending');
      expect(idea?.statusChangedAt).toBeDefined();
    });

    it('should set outcome when status is done', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      store.updatePracticeStatus(id, 'done', '已完成测试');

      const idea = store.getIdea(id);
      expect(idea?.practiceStatus).toBe('done');
      expect(idea?.outcome).toBe('已完成测试');
    });

    it('should return false for non-existent idea', () => {
      const store = useIdeaStore.getState();

      const updated = store.updatePracticeStatus('non_existent', 'done');

      expect(updated).toBe(false);
    });
  });

  describe('deleteIdea', () => {
    it('should delete an idea', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '要删除的想法',
        source: 'manual',
      });

      expect(store.getAllIdeas()).toHaveLength(1);

      const deleted = store.deleteIdea(id);

      expect(deleted).toBe(true);
      expect(store.getAllIdeas()).toHaveLength(0);
    });

    it('should return false for non-existent idea', () => {
      const store = useIdeaStore.getState();

      const deleted = store.deleteIdea('non_existent');

      expect(deleted).toBe(false);
    });
  });

  describe('deleteIdeas', () => {
    it('should delete multiple ideas', () => {
      const store = useIdeaStore.getState();

      const id1 = store.createIdea({ content: '想法1', source: 'manual' });
      const id2 = store.createIdea({ content: '想法2', source: 'manual' });
      const id3 = store.createIdea({ content: '想法3', source: 'manual' });

      expect(store.getAllIdeas()).toHaveLength(3);

      const deletedCount = store.deleteIdeas([id1, id2]);

      expect(deletedCount).toBe(2);
      expect(store.getAllIdeas()).toHaveLength(1);
      expect(store.getAllIdeas()[0].id).toBe(id3);
    });

    it('should return 0 for non-existent ids', () => {
      const store = useIdeaStore.getState();

      const deletedCount = store.deleteIdeas(['non_existent_1', 'non_existent_2']);

      expect(deletedCount).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      const store = useIdeaStore.getState();
      // 创建不同状态的想法
      store.createIdea({ content: '新想法', source: 'reading' });
      store.createIdea({ content: '待跟进', source: 'manual' });
    });

    it('should return stats with total count', () => {
      const store = useIdeaStore.getState();

      const stats = store.getStats();

      expect(stats.total).toBe(2);
    });

    it('should return stats by status', () => {
      const store = useIdeaStore.getState();
      const allIdeas = store.getAllIdeas();
      store.updatePracticeStatus(allIdeas[1].id, 'pending');

      const stats = store.getStats();

      expect(stats.byStatus.new).toBe(1);
      expect(stats.byStatus.pending).toBe(1);
    });

    it('should return stats by source', () => {
      const store = useIdeaStore.getState();

      const stats = store.getStats();

      expect(stats.bySource.reading).toBe(1);
      expect(stats.bySource.manual).toBe(1);
    });

    it('should return stats by importance and urgency', () => {
      const store = useIdeaStore.getState();
      const allIdeas = store.getAllIdeas();

      // 设置不同的重要性和紧急度
      store.setImportance(allIdeas[0].id, 'high');
      store.setUrgency(allIdeas[0].id, 'urgent');

      const stats = store.getStats();

      expect(stats.byImportance.high).toBe(1);
      expect(stats.byImportance.medium).toBe(1);
      expect(stats.byUrgency.urgent).toBe(1);
      expect(stats.byUrgency.normal).toBe(1);
    });
  });

  describe('setImportance and setUrgency', () => {
    it('should set importance level', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      store.setImportance(id, ImportanceLevel.HIGH);

      const idea = store.getIdea(id);
      expect(idea?.importance).toBe(ImportanceLevel.HIGH);
    });

    it('should set urgency level', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      store.setUrgency(id, UrgencyLevel.URGENT);

      const idea = store.getIdea(id);
      expect(idea?.urgency).toBe(UrgencyLevel.URGENT);
    });
  });

  describe('setPriorityScore', () => {
    it('should set priority score', () => {
      const store = useIdeaStore.getState();

      const id = store.createIdea({
        content: '测试想法',
        source: 'manual',
      });

      store.setPriorityScore(id, 85);

      const idea = store.getIdea(id);
      expect(idea?.priorityScore).toBe(85);
    });
  });

  describe('getReminders', () => {
    it('should return ideas with reminder time that has passed', () => {
      const store = useIdeaStore.getState();

      const pastTime = new Date(Date.now() - 1000).toISOString();
      const futureTime = new Date(Date.now() + 1000 * 60 * 60).toISOString();

      const id1 = store.createIdea({
        content: '过去的提醒',
        source: 'manual',
      });
      const id2 = store.createIdea({
        content: '未来的提醒',
        source: 'manual',
      });

      // 直接设置 reminderAt
      store.updateIdea(id1, { reminderAt: pastTime });
      store.updateIdea(id2, { reminderAt: futureTime });

      const reminders = store.getReminders();

      expect(reminders).toHaveLength(1);
      expect(reminders[0].id).toBe(id1);
    });

    it('should exclude completed ideas from reminders', () => {
      const store = useIdeaStore.getState();

      const pastTime = new Date(Date.now() - 1000).toISOString();

      const id = store.createIdea({
        content: '完成的想法',
        source: 'manual',
      });

      store.updateIdea(id, { reminderAt: pastTime });
      store.updatePracticeStatus(id, 'done');

      const reminders = store.getReminders();

      expect(reminders).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all ideas', () => {
      const store = useIdeaStore.getState();

      store.createIdea({ content: '想法1', source: 'manual' });
      store.createIdea({ content: '想法2', source: 'manual' });

      expect(store.getAllIdeas()).toHaveLength(2);

      store.clearAll();

      expect(store.getAllIdeas()).toHaveLength(0);
    });
  });
});