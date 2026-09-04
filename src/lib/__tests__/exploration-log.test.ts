/**
 * 探索记录系统单元测试
 *
 * @description 测试 ExplorationLogManager 的增删改查、模板、模式分析等核心能力。
 * @module src/lib/__tests__/exploration-log.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExplorationLogManager,
  createExplorationLogManager,
  EXPLORATION_TEMPLATES,
  getAllTemplates,
  getTemplate,
} from '../research/exploration-log';
import type {
  CreateExplorationEntryInput,
  ExplorationEntry,
} from '../research/exploration-log';
import type { ExplorationEntryType } from '../../types/experiment-report';
import { ExplorationEntryTypeNames, ExplorationEntryTypeStyles } from '../../types/experiment-report';

// ============ 测试辅助 ============

/** 创建一条记录的便捷函数 */
function makeEntry(
  reportId: string,
  type: ExplorationEntryType,
  title: string,
  content: string,
  extra?: Partial<CreateExplorationEntryInput>
): CreateExplorationEntryInput {
  return {
    reportId,
    type,
    title,
    content,
    ...extra,
  };
}

/** 等待 ms 毫秒（用于制造时间差） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ ExplorationLogManager 基础测试 ============

describe('ExplorationLogManager', () => {
  let manager: ExplorationLogManager;

  beforeEach(() => {
    manager = new ExplorationLogManager();
  });

  describe('配置', () => {
    it('应使用默认配置创建实例', () => {
      const m = new ExplorationLogManager();
      expect(m).toBeInstanceOf(ExplorationLogManager);
    });

    it('应接受自定义配置', () => {
      const m = new ExplorationLogManager({
        peakWindowMinutes: 60,
        peakThreshold: 5,
        trackEmotion: false,
      });
      expect(m).toBeInstanceOf(ExplorationLogManager);
    });

    it('createExplorationLogManager 工厂函数应创建实例', () => {
      const m = createExplorationLogManager({ peakThreshold: 4 });
      expect(m).toBeInstanceOf(ExplorationLogManager);
    });
  });

  describe('增删改查', () => {
    it('应添加记录并自动生成 id/createdAt/updatedAt', () => {
      const entry = manager.addEntry(
        makeEntry('rpt-1', 'idea', '测试想法', '这是一个测试想法')
      );

      expect(entry.id).toBeDefined();
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.reportId).toBe('rpt-1');
      expect(entry.type).toBe('idea');
      expect(entry.title).toBe('测试想法');
      expect(entry.content).toBe('这是一个测试想法');
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
      expect(entry.createdAt).toBe(entry.updatedAt);
    });

    it('应支持完整的可选字段', () => {
      const entry = manager.addEntry({
        reportId: 'rpt-1',
        type: 'attempt',
        title: '尝试对比学习',
        content: '我尝试了对比学习...',
        reflection: '效果不如预期',
        tools: ['PyTorch', 'AMiner'],
        durationMinutes: 30,
        tags: ['关键', '实验'],
        metadata: {
          methodUsed: '对照实验',
          resourcesUsed: ['AMiner', '本地知识库'],
          confidenceLevel: 0.7,
          emotionalState: '兴奋',
        },
      });

      expect(entry.reflection).toBe('效果不如预期');
      expect(entry.tools).toEqual(['PyTorch', 'AMiner']);
      expect(entry.durationMinutes).toBe(30);
      expect(entry.tags).toEqual(['关键', '实验']);
      expect(entry.metadata?.methodUsed).toBe('对照实验');
      expect(entry.metadata?.confidenceLevel).toBe(0.7);
      expect(entry.metadata?.emotionalState).toBe('兴奋');
    });

    it('应获取单条记录', () => {
      const created = manager.addEntry(
        makeEntry('rpt-1', 'idea', '想法1', '内容1')
      );
      const fetched = manager.getEntry(created.id);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(created.id);
    });

    it('获取不存在的记录应返回 undefined', () => {
      expect(manager.getEntry('non-existent')).toBeUndefined();
    });

    it('应更新记录并刷新 updatedAt', async () => {
      const created = manager.addEntry(
        makeEntry('rpt-1', 'idea', '原标题', '原内容')
      );
      await sleep(5);

      const updated = manager.updateEntry(created.id, {
        title: '新标题',
        content: '新内容',
      });

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('新标题');
      expect(updated?.content).toBe('新内容');
      expect(updated?.updatedAt).not.toBe(created.createdAt);
    });

    it('更新不存在的记录应返回 undefined', () => {
      const result = manager.updateEntry('non-existent', { title: 'x' });
      expect(result).toBeUndefined();
    });

    it('应浅合并 metadata 而非覆盖', () => {
      const created = manager.addEntry({
        reportId: 'rpt-1',
        type: 'idea',
        title: '想法',
        content: '内容',
        metadata: {
          methodUsed: '苏格拉底',
          confidenceLevel: 0.5,
        },
      });

      manager.updateEntry(created.id, {
        metadata: { confidenceLevel: 0.8 },
      });

      const fetched = manager.getEntry(created.id);
      expect(fetched?.metadata?.methodUsed).toBe('苏格拉底'); // 保留
      expect(fetched?.metadata?.confidenceLevel).toBe(0.8); // 更新
    });

    it('应删除记录', () => {
      const created = manager.addEntry(
        makeEntry('rpt-1', 'idea', '想法', '内容')
      );
      const deleted = manager.deleteEntry(created.id);
      expect(deleted).toBe(true);
      expect(manager.getEntry(created.id)).toBeUndefined();
    });

    it('删除不存在的记录应返回 false', () => {
      expect(manager.deleteEntry('non-existent')).toBe(false);
    });
  });

  describe('查询接口', () => {
    beforeEach(() => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法1', '内容1', { tags: ['a'] }));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试1', '内容2', { tags: ['b'] }));
      manager.addEntry(makeEntry('rpt-1', 'discovery', '发现1', '内容3', { tags: ['a'] }));
      manager.addEntry(makeEntry('rpt-2', 'idea', '想法2', '内容4'));
    });

    it('应按报告获取所有记录（时间正序）', () => {
      const entries = manager.getEntriesByReport('rpt-1');
      expect(entries).toHaveLength(3);
      // 验证时间正序
      for (let i = 1; i < entries.length; i++) {
        expect(new Date(entries[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(entries[i - 1].createdAt).getTime()
        );
      }
    });

    it('应按类型查询', () => {
      const ideas = manager.getEntriesByType('idea');
      expect(ideas).toHaveLength(2);

      const ideasInReport = manager.getEntriesByType('idea', 'rpt-1');
      expect(ideasInReport).toHaveLength(1);
      expect(ideasInReport[0].title).toBe('想法1');
    });

    it('应按时间范围查询', () => {
      const all = manager.getEntriesByReport('rpt-1');
      const from = new Date(all[0].createdAt);
      from.setSeconds(from.getSeconds() - 1);
      const to = new Date(all[all.length - 1].createdAt);
      to.setSeconds(to.getSeconds() + 1);

      const inRange = manager.getEntriesByTimeRange('rpt-1', from, to);
      expect(inRange).toHaveLength(3);
    });

    it('应按关键词搜索（标题/内容/反思/标签）', () => {
      // 标题匹配
      const r1 = manager.searchEntries('rpt-1', '想法1');
      expect(r1).toHaveLength(1);

      // 内容匹配
      const r2 = manager.searchEntries('rpt-1', '内容2');
      expect(r2).toHaveLength(1);
      expect(r2[0].type).toBe('attempt');

      // 标签匹配
      const r3 = manager.searchEntries('rpt-1', 'a');
      expect(r3.length).toBeGreaterThanOrEqual(2); // 想法1 和 发现1 都有标签 a

      // 空关键词返回全部
      const r4 = manager.searchEntries('rpt-1', '');
      expect(r4).toHaveLength(3);
    });

    it('应支持通用过滤', () => {
      const filtered = manager.filterEntries({
        types: ['idea', 'attempt'],
      });
      expect(filtered).toHaveLength(3); // 想法1 + 尝试1 + 想法2

      const byTag = manager.filterEntries({ tag: 'a' });
      expect(byTag).toHaveLength(2);
    });

    it('应获取所有记录（时间正序）', () => {
      const all = manager.getAllEntries();
      expect(all).toHaveLength(4);
      for (let i = 1; i < all.length; i++) {
        expect(new Date(all[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(all[i - 1].createdAt).getTime()
        );
      }
    });
  });

  describe('关联关系', () => {
    it('应支持 relatedEntries 多关联', () => {
      const e1 = manager.addEntry(makeEntry('rpt-1', 'idea', '想法A', '内容A'));
      const e2 = manager.addEntry(makeEntry('rpt-1', 'idea', '想法B', '内容B'));
      const e3 = manager.addEntry({
        reportId: 'rpt-1',
        type: 'reflection',
        title: '综合反思',
        content: '综合 A 和 B',
        relatedEntries: [e1.id, e2.id],
      });

      expect(e3.relatedEntries).toEqual([e1.id, e2.id]);
    });

    it('应同步 relatedEntryId 到 relatedEntries', () => {
      const e1 = manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      const e2 = manager.addEntry({
        reportId: 'rpt-1',
        type: 'reflection',
        title: '反思',
        content: '基于前述想法',
        relatedEntryId: e1.id,
      });

      expect(e2.relatedEntryId).toBe(e1.id);
      expect(e2.relatedEntries).toContain(e1.id);
    });

    it('应去重关联关系', () => {
      const e1 = manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      const e2 = manager.addEntry({
        reportId: 'rpt-1',
        type: 'reflection',
        title: '反思',
        content: '内容',
        relatedEntryId: e1.id,
        relatedEntries: [e1.id], // 重复
      });

      expect(e2.relatedEntries).toEqual([e1.id]);
    });
  });

  describe('探索摘要', () => {
    it('应生成叙事性摘要', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试', '内容', { durationMinutes: 30 }));
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破', '内容', { durationMinutes: 20 }));
      manager.addEntry(makeEntry('rpt-1', 'setback', '挫折', '内容'));

      const summary = manager.generateSummary('rpt-1');

      expect(summary.reportId).toBe('rpt-1');
      expect(summary.totalEntries).toBe(4);
      expect(summary.totalDurationMinutes).toBe(50);
      expect(summary.turningPoints).toHaveLength(1); // 突破
      expect(summary.keyDiscoveries).toHaveLength(0);
      expect(summary.majorSetbacks).toHaveLength(1);
      expect(summary.narrative).toContain('4 条记录');
      expect(summary.narrative.length).toBeGreaterThan(0);
    });

    it('空报告应返回"尚未开始"摘要', () => {
      const summary = manager.generateSummary('empty-rpt');
      expect(summary.totalEntries).toBe(0);
      expect(summary.narrative).toContain('尚未开始');
    });

    it('叙事应包含定性判断（突破+无反证 → 顺利）', () => {
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'evidence_support', '支持', '内容'));
      const summary = manager.generateSummary('rpt-1');
      expect(summary.narrative).toContain('顺利');
    });

    it('叙事应包含定性判断（反证+无突破 → 需修正）', () => {
      manager.addEntry(makeEntry('rpt-1', 'evidence_against', '反证', '内容'));
      const summary = manager.generateSummary('rpt-1');
      expect(summary.narrative).toContain('修正');
    });
  });

  describe('关键转折点提取', () => {
    it('应提取 pivot 和 breakthrough', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'pivot', '转向', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试', '内容'));

      const turningPoints = manager.extractTurningPoints('rpt-1');
      expect(turningPoints).toHaveLength(2);
      expect(turningPoints.map((e) => e.type)).toEqual(['pivot', 'breakthrough']);
    });
  });

  describe('模式分析', () => {
    it('应计算类型分布', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法2', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.typeDistribution.idea).toBe(2);
      expect(analysis.typeDistribution.attempt).toBe(1);
      expect(analysis.typeDistribution.breakthrough).toBe(0);
    });

    it('应检测高峰与低谷', () => {
      // 制造一个高峰：3条突破
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破2', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'breakthrough', '突破3', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.peaksAndValleys.length).toBeGreaterThan(0);
      expect(analysis.peaksAndValleys.some((p) => p.kind === 'peak')).toBe(true);
    });

    it('应分析探索效率', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法2', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'discovery', '发现1', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.efficiency.ideaCount).toBe(2);
      expect(analysis.efficiency.attemptCount).toBe(1);
      expect(analysis.efficiency.discoveryCount).toBe(1);
      expect(analysis.efficiency.ideaToAttemptRatio).toBe(0.5);
      expect(analysis.efficiency.attemptToDiscoveryRatio).toBe(1);
      expect(analysis.efficiency.overallScore).toBeGreaterThan(0);
      expect(analysis.efficiency.overallScore).toBeLessThanOrEqual(1);
      expect(analysis.efficiency.suggestions.length).toBeGreaterThan(0);
    });

    it('效率诊断：有想法无尝试应给出建议', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.efficiency.suggestions.some((s) => s.includes('未尝试'))).toBe(true);
    });

    it('效率诊断：有尝试无发现应给出建议', () => {
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试', '内容'));
      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.efficiency.suggestions.some((s) => s.includes('无发现'))).toBe(true);
    });

    it('应识别尝试-挫折循环模式', () => {
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'setback', '挫折1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'attempt', '尝试2', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'setback', '挫折2', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      const cyclePattern = analysis.trialErrorPatterns.find(
        (p) => p.name === '尝试-挫折循环'
      );
      expect(cyclePattern).toBeDefined();
      expect(cyclePattern?.occurrences).toBe(2);
    });

    it('应识别挫折驱动转向模式', () => {
      manager.addEntry(makeEntry('rpt-1', 'setback', '挫折1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'pivot', '转向1', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'setback', '挫折2', '内容'));
      manager.addEntry(makeEntry('rpt-1', 'pivot', '转向2', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      const pivotPattern = analysis.trialErrorPatterns.find(
        (p) => p.name === '挫折驱动转向'
      );
      expect(pivotPattern).toBeDefined();
      expect(pivotPattern?.occurrences).toBe(2);
    });

    it('应计算平均置信度', () => {
      manager.addEntry({
        reportId: 'rpt-1',
        type: 'idea',
        title: '想法1',
        content: '内容',
        metadata: { confidenceLevel: 0.6 },
      });
      manager.addEntry({
        reportId: 'rpt-1',
        type: 'idea',
        title: '想法2',
        content: '内容',
        metadata: { confidenceLevel: 0.8 },
      });
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法3', '内容')); // 无置信度

      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.averageConfidence).toBeCloseTo(0.7, 5);
    });

    it('无置信度记录时平均置信度应为 0', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容'));
      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.averageConfidence).toBe(0);
    });

    it('应构建情绪轨迹', () => {
      manager.addEntry({
        reportId: 'rpt-1',
        type: 'idea',
        title: '想法',
        content: '内容',
        metadata: { emotionalState: '兴奋' },
      });
      manager.addEntry({
        reportId: 'rpt-1',
        type: 'setback',
        title: '挫折',
        content: '内容',
        metadata: { emotionalState: '沮丧' },
      });
      manager.addEntry(makeEntry('rpt-1', 'idea', '无情绪', '内容'));

      const analysis = manager.analyzePatterns('rpt-1');
      expect(analysis.emotionalTrajectory).toHaveLength(2);
      expect(analysis.emotionalTrajectory[0].emotion).toBe('兴奋');
      expect(analysis.emotionalTrajectory[1].emotion).toBe('沮丧');
    });

    it('trackEmotion=false 时不应构建情绪轨迹', () => {
      const m = new ExplorationLogManager({ trackEmotion: false });
      m.addEntry({
        reportId: 'rpt-1',
        type: 'idea',
        title: '想法',
        content: '内容',
        metadata: { emotionalState: '兴奋' },
      });
      const analysis = m.analyzePatterns('rpt-1');
      expect(analysis.emotionalTrajectory).toHaveLength(0);
    });
  });

  describe('统计', () => {
    it('应计算条目统计', () => {
      manager.addEntry(makeEntry('rpt-1', 'idea', '想法', '内容', { durationMinutes: 10 }));
      manager.addEntry(makeEntry('rpt-1', 'evidence_support', '支持', '内容', { durationMinutes: 20 }));
      manager.addEntry(makeEntry('rpt-1', 'evidence_against', '反对', '内容'));

      const stats = manager.computeStats('rpt-1');
      expect(stats.total).toBe(3);
      expect(stats.byType.idea).toBe(1);
      expect(stats.byType.evidence_support).toBe(1);
      expect(stats.byType.evidence_against).toBe(1);
      expect(stats.totalDurationMinutes).toBe(30);
      expect(stats.supportEvidenceCount).toBe(1);
      expect(stats.againstEvidenceCount).toBe(1);
    });
  });
});

// ============ 记录模板测试 ============

describe('ExplorationTemplates', () => {
  it('应为所有 11 种类型提供模板', () => {
    const allTypes: ExplorationEntryType[] = [
      'idea',
      'attempt',
      'discovery',
      'setback',
      'breakthrough',
      'reflection',
      'pivot',
      'evidence_support',
      'evidence_against',
      'question',
      'note',
    ];

    for (const type of allTypes) {
      const template = EXPLORATION_TEMPLATES[type];
      expect(template).toBeDefined();
      expect(template.type).toBe(type);
      expect(template.name).toBe(ExplorationEntryTypeNames[type]);
      expect(template.titlePlaceholder.length).toBeGreaterThan(0);
      expect(template.contentTemplate.length).toBeGreaterThan(0);
    }
  });

  it('模板内容应包含引导提示（不是空骨架）', () => {
    const ideaTemplate = EXPLORATION_TEMPLATES.idea;
    expect(ideaTemplate.contentTemplate).toContain('我突然想到');
    expect(ideaTemplate.reflectionTemplate).toBeDefined();

    const attemptTemplate = EXPLORATION_TEMPLATES.attempt;
    expect(attemptTemplate.contentTemplate).toContain('我尝试了');

    const setbackTemplate = EXPLORATION_TEMPLATES.setback;
    expect(setbackTemplate.contentTemplate).toContain('行不通');

    const breakthroughTemplate = EXPLORATION_TEMPLATES.breakthrough;
    expect(breakthroughTemplate.contentTemplate).toContain('关键突破');
  });

  it('getAllTemplates 应返回所有模板', () => {
    const all = getAllTemplates();
    expect(all).toHaveLength(11);
  });

  it('getTemplate 应返回指定类型模板', () => {
    const ideaTemplate = getTemplate('idea');
    expect(ideaTemplate.type).toBe('idea');

    const reflectionTemplate = getTemplate('reflection');
    expect(reflectionTemplate.type).toBe('reflection');
    expect(reflectionTemplate.contentTemplate).toContain('回顾这一步');
  });
});

// ============ 类型样式完整性测试 ============

describe('ExplorationEntryTypeStyles 完整性', () => {
  it('所有 11 种类型都应有对应的视觉样式', () => {
    const allTypes: ExplorationEntryType[] = [
      'idea',
      'attempt',
      'discovery',
      'setback',
      'breakthrough',
      'reflection',
      'pivot',
      'evidence_support',
      'evidence_against',
      'question',
      'note',
    ];

    for (const type of allTypes) {
      const style = ExplorationEntryTypeStyles[type];
      expect(style).toBeDefined();
      expect(style.icon.length).toBeGreaterThan(0);
      expect(style.color).toMatch(/^#/);
      expect(style.bg).toMatch(/^#/);
    }
  });

  it('不同类型的颜色应有区分度', () => {
    const colors = new Set<string>();
    const types: ExplorationEntryType[] = [
      'idea',
      'attempt',
      'discovery',
      'setback',
      'breakthrough',
      'reflection',
      'pivot',
      'evidence_support',
      'evidence_against',
      'question',
      'note',
    ];
    for (const t of types) {
      colors.add(ExplorationEntryTypeStyles[t].color);
    }
    // 至少有 8 种不同颜色（允许少量复用）
    expect(colors.size).toBeGreaterThanOrEqual(8);
  });
});