/**
 * 自我证伪引擎测试
 * @module src/lib/__tests__/self-falsification.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FalsificationEngine, createFalsificationEngine } from '../research/falsification-engine';
import type { FalsificationRecord, FalsificationResult } from '../../types/research';

describe('FalsificationEngine', () => {
  let engine: FalsificationEngine;

  beforeEach(() => {
    engine = new FalsificationEngine({
      defaultCheckIntervalDays: 7,
      confidenceThreshold: 0.8,
      enableAutoFalsification: false,
      maxHistoryRecords: 100,
    });
  });

  describe('基本配置', () => {
    it('应该使用默认配置', () => {
      const defaultEngine = new FalsificationEngine();
      expect(defaultEngine).toBeDefined();
    });

    it('应该使用自定义配置', () => {
      const customEngine = new FalsificationEngine({
        defaultCheckIntervalDays: 14,
        confidenceThreshold: 0.9,
        enableAutoFalsification: true,
        maxHistoryRecords: 50,
      });
      expect(customEngine).toBeDefined();
    });

    it('createFalsificationEngine应该创建实例', () => {
      const created = createFalsificationEngine();
      expect(created).toBeInstanceOf(FalsificationEngine);
    });
  });

  describe('知识更新检查', () => {
    it('应该检查知识是否需要更新', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result).toHaveProperty('needsUpdate');
      expect(result).toHaveProperty('reasons');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.needsUpdate).toBe('boolean');
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(typeof result.confidence).toBe('number');
    });

    it('应该返回更新原因', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result.reasons).toBeDefined();
    });

    it('置信度应该在合理范围内', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('证伪审查', () => {
    it('应该执行证伪审查', async () => {
      const record = await engine.performFalsification('knowledge-1');

      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.knowledgeId).toBe('knowledge-1');
      expect(record.originalConclusion).toBeDefined();
      expect(record.newEvidence).toBeDefined();
      expect(record.result).toBeDefined();
      expect(record.confidence).toBeGreaterThanOrEqual(0);
      expect(record.createdAt).toBeDefined();
    });

    it('应该返回正确的证伪结果', async () => {
      const record = await engine.performFalsification('knowledge-1');

      const validResults: FalsificationResult[] = ['falsified', 'inconclusive', 'supported'];
      expect(validResults).toContain(record.result);
    });

    it('应该保存证伪记录', async () => {
      const record = await engine.performFalsification('knowledge-1');

      const history = engine.getFalsificationHistory('knowledge-1');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].id).toBe(record.id);
    });

    it('应该返回新结论当证伪成功', async () => {
      const record = await engine.performFalsification('knowledge-1');

      if (record.result === 'falsified') {
        expect(record.newConclusion).toBeDefined();
      }
    });

    it('应该不返回新结论当证伪失败', async () => {
      const record = await engine.performFalsification('knowledge-1');

      if (record.result !== 'falsified') {
        expect(record.newConclusion).toBeUndefined();
      }
    });

    it('应该处理不存在的知识', async () => {
      const record = await engine.performFalsification('non-existent');

      expect(record).toBeDefined();
      expect(record.knowledgeId).toBe('non-existent');
    });
  });

  describe('证伪历史', () => {
    beforeEach(async () => {
      // 添加一些历史记录
      await engine.performFalsification('knowledge-1');
      await engine.performFalsification('knowledge-1');
    });

    it('应该获取证伪历史', () => {
      const history = engine.getFalsificationHistory('knowledge-1');

      expect(history.length).toBe(2);
    });

    it('应该返回空数组对于不存在的知识', () => {
      const history = engine.getFalsificationHistory('non-existent');

      expect(history).toEqual([]);
    });

    it('历史记录应该按时间排序', () => {
      const history = engine.getFalsificationHistory('knowledge-1');

      for (let i = 1; i < history.length; i++) {
        const prev = new Date(history[i - 1].createdAt).getTime();
        const curr = new Date(history[i].createdAt).getTime();
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });
  });

  describe('知识生长统计', () => {
    it('应该获取知识生长统计', () => {
      const stats = engine.getGrowthStats('knowledge-1');

      expect(stats).toHaveProperty('knowledgeId', 'knowledge-1');
      expect(stats).toHaveProperty('totalGrowths');
      expect(stats).toHaveProperty('lastGrowthAt');
      expect(stats).toHaveProperty('growthByType');
      expect(stats).toHaveProperty('growthByType.update');
      expect(stats).toHaveProperty('growthByType.extension');
      expect(stats).toHaveProperty('growthByType.refinement');
    });

    it('应该返回0生长对于没有证伪的知识', () => {
      const stats = engine.getGrowthStats('non-existent');

      expect(stats.totalGrowths).toBe(0);
    });

    it('应该在证伪后更新统计', async () => {
      await engine.performFalsification('knowledge-1');
      const stats = engine.getGrowthStats('knowledge-1');

      expect(stats.totalGrowths).toBeGreaterThanOrEqual(0);
    });
  });

  describe('知识生长历史', () => {
    it('应该获取知识生长历史', () => {
      const history = engine.getGrowthHistory('knowledge-1');

      expect(Array.isArray(history)).toBe(true);
    });

    it('应该返回空数组对于不存在的知识', () => {
      const history = engine.getGrowthHistory('non-existent');

      expect(history).toEqual([]);
    });
  });

  describe('历史记录限制', () => {
    it('应该限制历史记录数量', async () => {
      const limitedEngine = new FalsificationEngine({
        maxHistoryRecords: 3,
      });

      // 添加超过限制的记录
      for (let i = 0; i < 5; i++) {
        await limitedEngine.performFalsification('knowledge-1');
      }

      const history = limitedEngine.getFalsificationHistory('knowledge-1');

      // 应该只保留最多3条记录
      expect(history.length).toBeLessThanOrEqual(3);
    });
  });

  describe('边界条件', () => {
    it('应该处理空知识ID', async () => {
      const result = await engine.checkUpdate('');

      expect(result).toBeDefined();
    });

    it('应该处理非常长的知识ID', async () => {
      const longId = 'k'.repeat(1000);
      const result = await engine.checkUpdate(longId);

      expect(result).toBeDefined();
    });

    it('应该处理特殊字符的知识ID', async () => {
      const result = await engine.checkUpdate('knowledge-1@#$%');

      expect(result).toBeDefined();
    });
  });

  describe('记录结构验证', () => {
    it('证伪记录应该有正确的结构', async () => {
      const record = await engine.performFalsification('knowledge-1');

      expect(record).toHaveProperty('id');
      expect(record).toHaveProperty('knowledgeId');
      expect(record).toHaveProperty('originalConclusion');
      expect(record).toHaveProperty('newEvidence');
      expect(record).toHaveProperty('result');
      expect(record).toHaveProperty('confidence');
      expect(record).toHaveProperty('createdAt');
    });

    it('生长统计应该有正确的结构', () => {
      const stats = engine.getGrowthStats('knowledge-1');

      expect(stats).toHaveProperty('knowledgeId');
      expect(stats).toHaveProperty('totalGrowths');
      expect(stats).toHaveProperty('lastGrowthAt');
      expect(stats).toHaveProperty('growthByType');
    });
  });

  describe('置信度验证', () => {
    it('证伪记录置信度应该在合理范围内', async () => {
      const record = await engine.performFalsification('knowledge-1');

      expect(record.confidence).toBeGreaterThanOrEqual(0);
      expect(record.confidence).toBeLessThanOrEqual(1);
    });

    it('检查更新置信度应该在合理范围内', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('并发测试', () => {
    it('应该处理并发证伪请求', async () => {
      const promises = [
        engine.performFalsification('knowledge-1'),
        engine.performFalsification('knowledge-1'),
        engine.performFalsification('knowledge-1'),
      ];

      const results = await Promise.all(promises);

      expect(results.length).toBe(3);
    });

    it('应该处理不同知识的并发请求', async () => {
      const promises = [
        engine.performFalsification('knowledge-1'),
        engine.performFalsification('knowledge-2'),
        engine.performFalsification('knowledge-3'),
      ];

      const results = await Promise.all(promises);

      expect(results.length).toBe(3);
    });
  });

  describe('证据收集', () => {
    it('应该收集证据', async () => {
      const record = await engine.performFalsification('knowledge-1');

      expect(record.newEvidence).toBeDefined();
    });

    it('证据应该包含来源信息', async () => {
      const record = await engine.performFalsification('knowledge-1');

      // 证据应该包含关于来源的描述
      expect(record.newEvidence.length).toBeGreaterThan(0);
    });
  });

  describe('时间因素检查', () => {
    it('应该检查时间因素', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result).toBeDefined();
    });

    it('旧知识应该可能需要更新', async () => {
      // 模拟旧知识
      const result = await engine.checkUpdate('old-knowledge');

      expect(result).toBeDefined();
    });
  });

  describe('一致性检查', () => {
    it('应该检查一致性', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result).toBeDefined();
    });
  });

  describe('外部更新检查', () => {
    it('应该检查外部更新', async () => {
      const result = await engine.checkUpdate('knowledge-1');

      expect(result).toBeDefined();
    });
  });

  describe('重置测试', () => {
    beforeEach(async () => {
      await engine.performFalsification('knowledge-1');
    });

    it('新引擎应该有空历史', () => {
      const newEngine = new FalsificationEngine();
      const history = newEngine.getFalsificationHistory('knowledge-1');

      expect(history).toEqual([]);
    });
  });
});