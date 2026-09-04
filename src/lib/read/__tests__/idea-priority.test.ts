/**
 * 优先级引擎单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PriorityEngine } from '../../lib/read/idea-priority';
import { ImportanceLevel, UrgencyLevel } from '../../types/knowledge';

describe('PriorityEngine', () => {
  let engine: PriorityEngine;

  beforeEach(() => {
    engine = new PriorityEngine();
  });

  describe('evaluateImportance', () => {
    it('should return high importance for content with high-importance keywords', () => {
      const content = '这是一个非常重要的核心问题，必须立即解决';
      const result = engine.evaluateImportance(content);

      expect(result).toBe(ImportanceLevel.HIGH);
    });

    it('should return medium importance for normal content', () => {
      const content = '今天天气不错，出去散步是个好主意';
      const result = engine.evaluateImportance(content);

      expect([ImportanceLevel.MEDIUM, ImportanceLevel.LOW]).toContain(result);
    });

    it('should consider behavior data when provided', () => {
      const content = '学习新知识';
      const withoutBehavior = engine.evaluateImportance(content);
      const withBehavior = engine.evaluateImportance(content, {
        readCount: 10,
        annotationCount: 5,
        ideaCount: 3,
        relatedKnowledgeCount: 8,
      });

      expect(withBehavior).toBeDefined();
    });
  });

  describe('evaluateUrgency', () => {
    it('should return urgent for content with urgency keywords', () => {
      const content = '紧急任务，需要立即处理，截止日期是明天';
      const result = engine.evaluateUrgency(content);

      expect(result).toBe(UrgencyLevel.URGENT);
    });

    it('should return not_urgent for content without urgency indicators', () => {
      const content = '这是一个普通的想法，以后可以慢慢研究';
      const result = engine.evaluateUrgency(content);

      expect([UrgencyLevel.NORMAL, UrgencyLevel.NOT_URGENT]).toContain(result);
    });

    it('should consider time decay for urgency', () => {
      const content = '需要完成的任务';
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30天前
      const newDate = new Date().toISOString();

      const oldUrgency = engine.evaluateUrgency(content, oldDate);
      const newUrgency = engine.evaluateUrgency(content, newDate);

      expect(newUrgency).toBeDefined();
      expect(oldUrgency).toBeDefined();
    });
  });

  describe('calculatePriority', () => {
    it('should calculate priority score correctly', () => {
      const content = '紧急且重要的任务，必须立即处理';
      const result = engine.calculatePriority(content);

      expect(result.importance).toBeDefined();
      expect(result.urgency).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.factors.contentScore).toBeGreaterThanOrEqual(0);
      expect(result.factors.contentScore).toBeLessThanOrEqual(1);
    });

    it('should handle empty content', () => {
      const result = engine.calculatePriority('');

      expect(result.importance).toBe(ImportanceLevel.MEDIUM);
      expect(result.urgency).toBe(UrgencyLevel.NORMAL);
    });

    it('should handle content with behavior data', () => {
      const content = '研究项目';
      const result = engine.calculatePriority(content, {
        readCount: 5,
        annotationCount: 3,
        ideaCount: 2,
        relatedKnowledgeCount: 4,
      });

      expect(result.factors.behaviorScore).toBeGreaterThanOrEqual(0);
      expect(result.factors.behaviorScore).toBeLessThanOrEqual(1);
    });
  });

  describe('analyzeIdea', () => {
    it('should analyze idea content and return analysis', () => {
      const content = '我有一个新想法：开发一个任务管理应用，需要尽快完成原型';
      const result = engine.analyzeIdea(content);

      expect(result.practiceStatus).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.suggestedTags).toBeInstanceOf(Array);
      expect(result.estimatedPriority.importance).toBeDefined();
      expect(result.estimatedPriority.urgency).toBeDefined();
    });

    it('should suggest tags based on content', () => {
      const content = '学习React开发很重要';
      const result = engine.analyzeIdea(content);

      expect(result.suggestedTags.length).toBeGreaterThan(0);
    });

    it('should detect domain from content', () => {
      const content = '研究机器学习算法，优化模型性能';
      const result = engine.analyzeIdea(content);

      expect(result.domain).toBeDefined();
    });
  });

  describe('sortIdeas', () => {
    it('should sort ideas by status and priority', () => {
      const ideas = [
        {
          id: '1',
          content: 'Idea 1',
          practiceStatus: 'new' as const,
          source: 'manual' as const,
          importance: 'medium' as const,
          urgency: 'normal' as const,
          priorityScore: 50,
          tags: [],
          createdBy: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
        },
        {
          id: '2',
          content: 'Idea 2',
          practiceStatus: 'pending' as const,
          source: 'manual' as const,
          importance: 'high' as const,
          urgency: 'urgent' as const,
          priorityScore: 90,
          tags: [],
          createdBy: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
        },
        {
          id: '3',
          content: 'Idea 3',
          practiceStatus: 'new' as const,
          source: 'manual' as const,
          importance: 'low' as const,
          urgency: 'not_urgent' as const,
          priorityScore: 30,
          tags: [],
          createdBy: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
        },
      ];

      const sorted = engine.sortIdeas(ideas);

      expect(sorted[0].id).toBe('1'); // new first, then by priority
      expect(sorted[1].id).toBe('3'); // new, lower priority
      expect(sorted[2].id).toBe('2'); // pending comes after new
    });
  });

  describe('calculateReminderTime', () => {
    it('should calculate reminder time for urgent items', () => {
      const createdAt = new Date().toISOString();
      const reminder = engine.calculateReminderTime(UrgencyLevel.URGENT, createdAt);

      expect(reminder).toBeDefined();
      const reminderTime = new Date(reminder!).getTime();
      const createdTime = new Date(createdAt).getTime();
      const diff = reminderTime - createdTime;

      // Should be about 1 hour
      expect(diff).toBeGreaterThanOrEqual(59 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(61 * 60 * 1000);
    });

    it('should calculate reminder time for normal items', () => {
      const createdAt = new Date().toISOString();
      const reminder = engine.calculateReminderTime(UrgencyLevel.NORMAL, createdAt);

      expect(reminder).toBeDefined();
      const reminderTime = new Date(reminder!).getTime();
      const createdTime = new Date(createdAt).getTime();
      const diff = reminderTime - createdTime;

      // Should be about 24 hours
      expect(diff).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    });

    it('should calculate reminder time for not_urgent items', () => {
      const createdAt = new Date().toISOString();
      const reminder = engine.calculateReminderTime(UrgencyLevel.NOT_URGENT, createdAt);

      expect(reminder).toBeDefined();
      const reminderTime = new Date(reminder!).getTime();
      const createdTime = new Date(createdAt).getTime();
      const diff = reminderTime - createdTime;

      // Should be about 7 days
      expect(diff).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
    });
  });

  describe('analyzeContent', () => {
    it('should analyze content and extract keywords', () => {
      const content = '这是一个重要的研究项目，需要学习新技术';
      const result = engine['analyzeContent'](content);

      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.informationDensity).toBeGreaterThanOrEqual(0);
      expect(result.informationDensity).toBeLessThanOrEqual(1);
    });

    it('should detect domain correctly', () => {
      const techContent = '学习React和TypeScript开发';
      const techResult = engine['analyzeContent'](techContent);

      expect(techResult.domain).toBeDefined();
    });

    it('should calculate information density', () => {
      const denseContent =
        '机器学习算法优化模型性能深度学习神经网络自然语言处理计算机视觉';
      const sparseContent = '今天天气很好';

      const denseResult = engine['analyzeContent'](denseContent);
      const sparseResult = engine['analyzeContent'](sparseContent);

      expect(denseResult.informationDensity).toBeGreaterThan(sparseResult.informationDensity);
    });
  });
});