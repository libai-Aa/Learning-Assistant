/**
 * 实验报告核心逻辑单元测试
 *
 * @description 测试 src/lib/research/experiment-report.ts 中的纯函数：
 *   工厂函数、更新、状态转换、过滤、统计、自动总结等。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createExperimentReport,
  updateExperimentReport,
  createExplorationEntry,
  updateExplorationEntry,
  transitionStatus,
  canTransitionStatus,
  filterReports,
  filterEntries,
  sortEntries,
  computeReportStats,
  computeEntryStats,
  inferConclusionResult,
  generateSummaryDraft,
  createEvidence,
  findEntry,
  findEvidence,
  getEntryChain,
  computeReportDurationMinutes,
  computeReportSpanMinutes,
  recommendMethodology,
  inferTags,
  generateId,
  ALL_ENTRY_TYPES,
  createDefaultFindings,
  createDefaultConclusion,
} from '../research/experiment-report';
import type {
  ExperimentReport,
  ExplorationEntry,
} from '../../types/experiment-report';

// ============ 工厂函数 ============

describe('createExperimentReport', () => {
  it('应创建包含所有八条结构的完整报告', () => {
    const report = createExperimentReport({
      topic: '验证某假设',
      explorer: 'alice',
      tags: ['test'],
    });

    expect(report.id).toMatch(/^rpt_/);
    expect(report.basicInfo.topic).toBe('验证某假设');
    expect(report.basicInfo.explorer).toBe('alice');
    expect(report.basicInfo.status).toBe('in_progress');
    expect(report.basicInfo.tags).toEqual(['test']);
    expect(report.entries).toEqual([]);
    expect(report.findings.evidences).toEqual([]);
    expect(report.conclusion.result).toBe('inconclusive');
    expect(report.theory.methodology).toBe('first-principles');
    // 八条结构都应存在
    expect(report.basicInfo).toBeDefined();
    expect(report.motivation).toBeDefined();
    expect(report.theory).toBeDefined();
    expect(report.tools).toBeDefined();
    expect(report.entries).toBeDefined();
    expect(report.findings).toBeDefined();
    expect(report.conclusion).toBeDefined();
    expect(report.reflection).toBeDefined();
  });

  it('应接受 motivation 和 theory 的部分填充', () => {
    const report = createExperimentReport({
      topic: '探索X',
      motivation: {
        why: '因为好奇',
        hypothesis: '假设X成立',
      },
      theory: {
        methodology: 'socratic',
        initialAssumption: 'X是Y',
      },
    });

    expect(report.motivation.why).toBe('因为好奇');
    expect(report.motivation.hypothesis).toBe('假设X成立');
    expect(report.theory.methodology).toBe('socratic');
    expect(report.theory.initialAssumption).toBe('X是Y');
    // 未提供的字段保持默认
    expect(report.motivation.expectedGoal).toBe('');
    expect(report.theory.basedOn).toBe('');
  });

  it('空主题应抛出错误', () => {
    expect(() => createExperimentReport({ topic: '   ' })).toThrow(
      '探索主题不能为空'
    );
    expect(() => createExperimentReport({ topic: '' })).toThrow();
  });

  it('应关联 ideaId 和 researchQuestionId', () => {
    const report = createExperimentReport({
      topic: '来自想法的探索',
      ideaId: 'idea_123',
      researchQuestionId: 'q_456',
    });

    expect(report.basicInfo.ideaId).toBe('idea_123');
    expect(report.basicInfo.researchQuestionId).toBe('q_456');
  });
});

// ============ 报告更新 ============

describe('updateExperimentReport', () => {
  let report: ExperimentReport;

  beforeEach(() => {
    report = createExperimentReport({ topic: '测试' });
  });

  it('应浅合并 motivation 字段', () => {
    const updated = updateExperimentReport(report, {
      motivation: { why: '新理由' },
    });
    expect(updated.motivation.why).toBe('新理由');
    // 其他字段保留
    expect(updated.motivation.hypothesis).toBe(report.motivation.hypothesis);
  });

  it('应替换数组字段而非合并', () => {
    const updated = updateExperimentReport(report, {
      theory: { expectedOutcomes: ['结果A', '结果B'] },
    });
    expect(updated.theory.expectedOutcomes).toEqual(['结果A', '结果B']);
  });

  it('应更新 basicInfo 并刷新 lastUpdatedAt', () => {
    const original = report.basicInfo.lastUpdatedAt;
    const updated = updateExperimentReport(report, {
      basicInfo: { topic: '新主题' },
    });
    expect(updated.basicInfo.topic).toBe('新主题');
    // lastUpdatedAt 应被刷新为新的 ISO 时间戳（>= 原值，避免毫秒精度问题）
    expect(updated.basicInfo.lastUpdatedAt >= original).toBe(true);
    expect(typeof updated.basicInfo.lastUpdatedAt).toBe('string');
  });

  it('应更新 updatedAt 时间戳', () => {
    const original = report.updatedAt;
    const updated = updateExperimentReport(report, {
      conclusion: { conclusion: '新结论' },
    });
    expect(updated.updatedAt >= original).toBe(true);
    expect(typeof updated.updatedAt).toBe('string');
  });
});

// ============ 探索记录条目 ============

describe('createExplorationEntry', () => {
  it('应创建完整条目', () => {
    const entry = createExplorationEntry('rpt_1', {
      type: 'idea',
      title: '新想法',
      content: '详细内容',
      reflection: '反思内容',
      tools: ['AMiner'],
      durationMinutes: 30,
      tags: ['关键'],
    });

    expect(entry.id).toMatch(/^entry_/);
    expect(entry.reportId).toBe('rpt_1');
    expect(entry.type).toBe('idea');
    expect(entry.title).toBe('新想法');
    expect(entry.content).toBe('详细内容');
    expect(entry.reflection).toBe('反思内容');
    expect(entry.tools).toEqual(['AMiner']);
    expect(entry.durationMinutes).toBe(30);
    expect(entry.tags).toEqual(['关键']);
  });

  it('空标题应抛出', () => {
    expect(() =>
      createExplorationEntry('rpt_1', { type: 'idea', title: '', content: 'x' })
    ).toThrow('探索记录标题不能为空');
  });

  it('空内容应抛出', () => {
    expect(() =>
      createExplorationEntry('rpt_1', { type: 'idea', title: 'x', content: '  ' })
    ).toThrow('探索记录内容不能为空');
  });

  it('空白反思应被规范化为 undefined', () => {
    const entry = createExplorationEntry('rpt_1', {
      type: 'idea',
      title: 'x',
      content: 'x',
      reflection: '   ',
    });
    expect(entry.reflection).toBeUndefined();
  });
});

describe('updateExplorationEntry', () => {
  it('应更新指定字段', () => {
    const entry = createExplorationEntry('rpt_1', {
      type: 'idea',
      title: '原标题',
      content: '原内容',
    });
    const updated = updateExplorationEntry(entry, { title: '新标题' });
    expect(updated.title).toBe('新标题');
    expect(updated.content).toBe('原内容'); // 保留
    expect(updated.updatedAt >= entry.updatedAt).toBe(true);
  });

  it('空标题更新应抛出', () => {
    const entry = createExplorationEntry('rpt_1', {
      type: 'idea',
      title: '原标题',
      content: 'x',
    });
    expect(() => updateExplorationEntry(entry, { title: '' })).toThrow();
  });
});

// ============ 状态转换 ============

describe('canTransitionStatus', () => {
  it('相同状态应允许', () => {
    expect(canTransitionStatus('in_progress', 'in_progress')).toBe(true);
    expect(canTransitionStatus('completed', 'completed')).toBe(true);
  });

  it('in_progress 可转到所有终态', () => {
    expect(canTransitionStatus('in_progress', 'completed')).toBe(true);
    expect(canTransitionStatus('in_progress', 'shelved')).toBe(true);
    expect(canTransitionStatus('in_progress', 'falsified')).toBe(true);
    expect(canTransitionStatus('in_progress', 'inconclusive')).toBe(true);
  });

  it('falsified 只能转到 shelved', () => {
    expect(canTransitionStatus('falsified', 'shelved')).toBe(true);
    expect(canTransitionStatus('falsified', 'in_progress')).toBe(false);
    expect(canTransitionStatus('falsified', 'completed')).toBe(false);
  });

  it('completed 可回到 shelved 或 in_progress', () => {
    expect(canTransitionStatus('completed', 'shelved')).toBe(true);
    expect(canTransitionStatus('completed', 'in_progress')).toBe(true);
    expect(canTransitionStatus('completed', 'falsified')).toBe(false);
  });

  it('shelved 可恢复到 in_progress', () => {
    expect(canTransitionStatus('shelved', 'in_progress')).toBe(true);
    expect(canTransitionStatus('shelved', 'completed')).toBe(true);
  });
});

describe('transitionStatus', () => {
  it('合法转换应成功并设置 completedAt', () => {
    const report = createExperimentReport({ topic: 'x' });
    const completed = transitionStatus(report, 'completed');
    expect(completed.basicInfo.status).toBe('completed');
    expect(completed.basicInfo.completedAt).toBeDefined();
  });

  it('非法转换应抛出', () => {
    const report = createExperimentReport({ topic: 'x' });
    // 先转到 falsified
    const falsified = transitionStatus(report, 'falsified');
    // falsified -> completed 非法
    expect(() => transitionStatus(falsified, 'completed')).toThrow(
      '非法状态转换'
    );
  });

  it('转到 shelved 不应设置 completedAt', () => {
    const report = createExperimentReport({ topic: 'x' });
    const shelved = transitionStatus(report, 'shelved');
    expect(shelved.basicInfo.status).toBe('shelved');
    expect(shelved.basicInfo.completedAt).toBeUndefined();
  });
});

// ============ 过滤 ============

describe('filterReports', () => {
  let reports: ExperimentReport[];

  beforeEach(() => {
    reports = [
      createExperimentReport({ topic: 'A', tags: ['math'] }),
      createExperimentReport({ topic: 'B', tags: ['physics'] }),
      createExperimentReport({ topic: 'C', tags: ['math'] }),
    ];
    reports[1] = transitionStatus(reports[1], 'completed');
  });

  it('按状态过滤', () => {
    const result = filterReports(reports, { status: 'in_progress' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.basicInfo.topic)).toEqual(['A', 'C']);
  });

  it('按标签过滤', () => {
    const result = filterReports(reports, { tag: 'math' });
    expect(result).toHaveLength(2);
  });

  it('按 explorer 过滤', () => {
    const r1 = createExperimentReport({ topic: 'X', explorer: 'alice' });
    const r2 = createExperimentReport({ topic: 'Y', explorer: 'bob' });
    const result = filterReports([r1, r2], { explorer: 'alice' });
    expect(result).toHaveLength(1);
    expect(result[0].basicInfo.topic).toBe('X');
  });
});

describe('filterEntries', () => {
  let entries: ExplorationEntry[];

  beforeEach(() => {
    entries = [
      createExplorationEntry('r1', {
        type: 'idea',
        title: '初始想法',
        content: '关于X的想法',
        tags: ['关键'],
      }),
      createExplorationEntry('r1', {
        type: 'attempt',
        title: '尝试验证',
        content: '用方法M验证',
      }),
      createExplorationEntry('r1', {
        type: 'breakthrough',
        title: '关键突破',
        content: '发现X成立',
      }),
    ];
  });

  it('按类型过滤', () => {
    const result = filterEntries(entries, { type: 'idea' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('初始想法');
  });

  it('按多类型过滤', () => {
    const result = filterEntries(entries, {
      types: ['idea', 'breakthrough'],
    });
    expect(result).toHaveLength(2);
  });

  it('按关键词过滤（匹配标题）', () => {
    const result = filterEntries(entries, { keyword: '突破' });
    expect(result).toHaveLength(1);
  });

  it('按关键词过滤（匹配内容）', () => {
    const result = filterEntries(entries, { keyword: '方法M' });
    expect(result).toHaveLength(1);
  });

  it('按标签过滤', () => {
    const result = filterEntries(entries, { tag: '关键' });
    expect(result).toHaveLength(1);
  });
});

describe('sortEntries', () => {
  it('应按时间升序排序', () => {
    const entries = [
      createExplorationEntry('r1', {
        type: 'idea',
        title: '第三',
        content: 'x',
      }),
      createExplorationEntry('r1', {
        type: 'idea',
        title: '第一',
        content: 'x',
      }),
      createExplorationEntry('r1', {
        type: 'idea',
        title: '第二',
        content: 'x',
      }),
    ];
    // 手动调整时间戳确保顺序
    entries[0].createdAt = '2024-03-01T00:00:00.000Z';
    entries[1].createdAt = '2024-01-01T00:00:00.000Z';
    entries[2].createdAt = '2024-02-01T00:00:00.000Z';

    const asc = sortEntries(entries, 'asc');
    expect(asc.map((e) => e.title)).toEqual(['第一', '第二', '第三']);

    const desc = sortEntries(entries, 'desc');
    expect(desc.map((e) => e.title)).toEqual(['第三', '第二', '第一']);
  });
});

// ============ 统计 ============

describe('computeReportStats', () => {
  it('应正确统计空列表', () => {
    const stats = computeReportStats([]);
    expect(stats.total).toBe(0);
    expect(stats.totalEntries).toBe(0);
    expect(stats.averageEntriesPerReport).toBe(0);
  });

  it('应正确统计多个报告', () => {
    const r1 = createExperimentReport({ topic: 'A' });
    const r2 = createExperimentReport({ topic: 'B' });
    // 给 r1 加条目
    r1.entries.push(
      createExplorationEntry(r1.id, { type: 'idea', title: 't', content: 'c' })
    );
    r1.entries.push(
      createExplorationEntry(r1.id, { type: 'attempt', title: 't', content: 'c' })
    );
    // 给 r1 加证据
    r1.findings.evidences.push(
      createEvidence(r1.id, {
        type: 'observation',
        stance: 'support',
        description: 'd',
        content: 'c',
      })
    );

    const stats = computeReportStats([r1, r2]);
    expect(stats.total).toBe(2);
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalEvidences).toBe(1);
    expect(stats.averageEntriesPerReport).toBe(1);
    expect(stats.byStatus.in_progress).toBe(2);
  });
});

describe('computeEntryStats', () => {
  it('应按类型统计条目', () => {
    const entries: ExplorationEntry[] = [
      createExplorationEntry('r1', {
        type: 'idea',
        title: 't',
        content: 'c',
        durationMinutes: 30,
      }),
      createExplorationEntry('r1', {
        type: 'idea',
        title: 't',
        content: 'c',
        durationMinutes: 20,
      }),
      createExplorationEntry('r1', {
        type: 'evidence_support',
        title: 't',
        content: 'c',
      }),
      createExplorationEntry('r1', {
        type: 'evidence_against',
        title: 't',
        content: 'c',
      }),
    ];

    const stats = computeEntryStats(entries);
    expect(stats.total).toBe(4);
    expect(stats.byType.idea).toBe(2);
    expect(stats.byType.evidence_support).toBe(1);
    expect(stats.byType.evidence_against).toBe(1);
    expect(stats.totalDurationMinutes).toBe(50);
    expect(stats.supportEvidenceCount).toBe(1);
    expect(stats.againstEvidenceCount).toBe(1);
  });
});

// ============ 自动总结 ============

describe('inferConclusionResult', () => {
  it('无证据应返回 inconclusive', () => {
    expect(inferConclusionResult(0, 0)).toBe('inconclusive');
  });

  it('支持证据占多数应返回 confirmed', () => {
    expect(inferConclusionResult(7, 1)).toBe('confirmed');
    expect(inferConclusionResult(3, 1)).toBe('confirmed');
  });

  it('反对证据占多数应返回 falsified', () => {
    expect(inferConclusionResult(1, 7)).toBe('falsified');
    expect(inferConclusionResult(1, 3)).toBe('falsified');
  });

  it('势均力敌应返回 partial', () => {
    expect(inferConclusionResult(1, 1)).toBe('partial');
    expect(inferConclusionResult(2, 3)).toBe('partial');
  });
});

describe('generateSummaryDraft', () => {
  it('应从条目中提取关键洞察', () => {
    const report = createExperimentReport({ topic: 'X' });
    report.entries.push(
      createExplorationEntry(report.id, {
        type: 'breakthrough',
        title: '关键突破1',
        content: '内容',
      }),
      createExplorationEntry(report.id, {
        type: 'discovery',
        title: '意外发现',
        content: '内容',
      }),
      createExplorationEntry(report.id, {
        type: 'setback',
        title: '方法失败',
        content: '内容',
        reflection: '教训：要小心',
      }),
      createExplorationEntry(report.id, {
        type: 'question',
        title: '新问题',
        content: '内容',
      }),
      createExplorationEntry(report.id, {
        type: 'pivot',
        title: '思路转变',
        content: '内容',
      })
    );

    const draft = generateSummaryDraft(report);
    expect(draft.conclusion.keyInsights).toContain('关键突破1');
    expect(draft.conclusion.keyInsights).toContain('意外发现');
    expect(draft.conclusion.lessonsLearned.some((l) => l.includes('方法失败'))).toBe(true);
    expect(draft.conclusion.unresolvedQuestions).toContain('新问题');
    expect(draft.conclusion.futureDirections).toContain('思路转变');
    expect(draft.reflection.newQuestions).toContain('新问题');
  });

  it('应根据证据推断结论', () => {
    const report = createExperimentReport({ topic: 'X' });
    report.findings.evidences.push(
      createEvidence(report.id, {
        type: 'experiment',
        stance: 'support',
        description: 's1',
        content: 'c',
      }),
      createEvidence(report.id, {
        type: 'experiment',
        stance: 'support',
        description: 's2',
        content: 'c',
      }),
      createEvidence(report.id, {
        type: 'counter_example',
        stance: 'against',
        description: 'a1',
        content: 'c',
      })
    );

    const draft = generateSummaryDraft(report);
    // 2支持 vs 1反对 → partial (ratio 0.67, < 0.7)
    expect(draft.conclusion.result).toBe('partial');
  });

  it('应去重提取的洞察', () => {
    const report = createExperimentReport({ topic: 'X' });
    report.entries.push(
      createExplorationEntry(report.id, {
        type: 'breakthrough',
        title: '相同突破',
        content: 'x',
      }),
      createExplorationEntry(report.id, {
        type: 'breakthrough',
        title: '相同突破',
        content: 'x',
      })
    );
    const draft = generateSummaryDraft(report);
    expect(draft.conclusion.keyInsights).toEqual(['相同突破']);
  });
});

// ============ 证据 ============

describe('createEvidence', () => {
  it('应创建证据条目', () => {
    const ev = createEvidence('rpt_1', {
      type: 'data',
      stance: 'support',
      description: '数据支持',
      content: '详细数据',
      source: '实验1',
      confidence: 0.9,
    });
    expect(ev.id).toMatch(/^ev_/);
    expect(ev.reportId).toBe('rpt_1');
    expect(ev.stance).toBe('support');
    expect(ev.confidence).toBe(0.9);
  });

  it('默认置信度应为 0.5', () => {
    const ev = createEvidence('rpt_1', {
      type: 'observation',
      stance: 'neutral',
      description: 'd',
      content: 'c',
    });
    expect(ev.confidence).toBe(0.5);
  });

  it('非法置信度应抛出', () => {
    expect(() =>
      createEvidence('rpt_1', {
        type: 'data',
        stance: 'support',
        description: 'd',
        content: 'c',
        confidence: 1.5,
      })
    ).toThrow('置信度必须在 0-1 之间');
    expect(() =>
      createEvidence('rpt_1', {
        type: 'data',
        stance: 'support',
        description: 'd',
        content: 'c',
        confidence: -0.1,
      })
    ).toThrow();
  });

  it('空描述/内容应抛出', () => {
    expect(() =>
      createEvidence('rpt_1', {
        type: 'data',
        stance: 'support',
        description: '',
        content: 'c',
      })
    ).toThrow();
  });
});

// ============ 查询辅助 ============

describe('findEntry / findEvidence / getEntryChain', () => {
  it('findEntry 应返回对应条目', () => {
    const report = createExperimentReport({ topic: 'x' });
    const entry = createExplorationEntry(report.id, {
      type: 'idea',
      title: 't',
      content: 'c',
    });
    report.entries.push(entry);
    expect(findEntry(report, entry.id)).toBe(entry);
    expect(findEntry(report, 'nonexistent')).toBeUndefined();
  });

  it('findEvidence 应返回对应证据', () => {
    const report = createExperimentReport({ topic: 'x' });
    const ev = createEvidence(report.id, {
      type: 'data',
      stance: 'support',
      description: 'd',
      content: 'c',
    });
    report.findings.evidences.push(ev);
    expect(findEvidence(report, ev.id)).toBe(ev);
    expect(findEvidence(report, 'nonexistent')).toBeUndefined();
  });

  it('getEntryChain 应沿 relatedEntryId 回溯', () => {
    const report = createExperimentReport({ topic: 'x' });
    const e1 = createExplorationEntry(report.id, {
      type: 'idea',
      title: '最初想法',
      content: 'c',
    });
    const e2 = createExplorationEntry(report.id, {
      type: 'pivot',
      title: '思路转变',
      content: 'c',
      relatedEntryId: e1.id,
    });
    const e3 = createExplorationEntry(report.id, {
      type: 'breakthrough',
      title: '突破',
      content: 'c',
      relatedEntryId: e2.id,
    });
    report.entries.push(e1, e2, e3);

    const chain = getEntryChain(report, e3.id);
    expect(chain.map((e) => e.title)).toEqual([
      '最初想法',
      '思路转变',
      '突破',
    ]);
  });

  it('getEntryChain 应处理循环引用', () => {
    const report = createExperimentReport({ topic: 'x' });
    const e1 = createExplorationEntry(report.id, {
      type: 'idea',
      title: 'A',
      content: 'c',
    });
    const e2 = createExplorationEntry(report.id, {
      type: 'idea',
      title: 'B',
      content: 'c',
      relatedEntryId: e1.id,
    });
    e1.relatedEntryId = e2.id; // 制造循环
    report.entries.push(e1, e2);

    const chain = getEntryChain(report, e1.id);
    // 不应无限循环
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});

// ============ 时长计算 ============

describe('computeReportDurationMinutes / computeReportSpanMinutes', () => {
  it('应累计条目耗时', () => {
    const report = createExperimentReport({ topic: 'x' });
    report.entries.push(
      createExplorationEntry(report.id, {
        type: 'attempt',
        title: 't',
        content: 'c',
        durationMinutes: 30,
      }),
      createExplorationEntry(report.id, {
        type: 'attempt',
        title: 't',
        content: 'c',
        durationMinutes: 45,
      })
    );
    expect(computeReportDurationMinutes(report)).toBe(75);
  });

  it('应计算探索跨度', () => {
    const report = createExperimentReport({ topic: 'x' });
    // 模拟最后更新时间在开始后 2 小时
    report.basicInfo.lastUpdatedAt = new Date(
      new Date(report.basicInfo.startedAt).getTime() + 2 * 60 * 60 * 1000
    ).toISOString();
    expect(computeReportSpanMinutes(report)).toBe(120);
  });
});

// ============ 方法论推荐 ============

describe('recommendMethodology', () => {
  it('包含"为什么"应推荐 five-whys', () => {
    expect(recommendMethodology('为什么会这样？')).toBe('five-whys');
    expect(recommendMethodology('寻找根因')).toBe('five-whys');
  });

  it('包含"什么是"应推荐 socratic', () => {
    expect(recommendMethodology('什么是量子纠缠？')).toBe('socratic');
    expect(recommendMethodology('X的原理是什么')).toBe('socratic');
  });

  it('其他应默认 first-principles', () => {
    expect(recommendMethodology('如何设计一个分布式系统')).toBe(
      'first-principles'
    );
  });
});

describe('inferTags', () => {
  it('应识别证伪关键词', () => {
    expect(inferTags('尝试证伪某假设')).toContain('证伪');
  });

  it('应保留已有标签', () => {
    const tags = inferTags('某主题', ['existing']);
    expect(tags).toContain('existing');
  });

  it('应识别假设检验', () => {
    const tags = inferTags('检验这个 hypothesis');
    expect(tags).toContain('假设检验');
  });
});

// ============ 工具函数 ============

describe('generateId', () => {
  it('应生成带前缀的唯一ID', () => {
    const id1 = generateId('test');
    const id2 = generateId('test');
    expect(id1).toMatch(/^test_/);
    expect(id2).toMatch(/^test_/);
    expect(id1).not.toBe(id2);
  });
});

describe('ALL_ENTRY_TYPES', () => {
  it('应包含全部11种类型', () => {
    expect(ALL_ENTRY_TYPES).toHaveLength(11);
    expect(ALL_ENTRY_TYPES).toContain('idea');
    expect(ALL_ENTRY_TYPES).toContain('attempt');
    expect(ALL_ENTRY_TYPES).toContain('discovery');
    expect(ALL_ENTRY_TYPES).toContain('setback');
    expect(ALL_ENTRY_TYPES).toContain('breakthrough');
    expect(ALL_ENTRY_TYPES).toContain('reflection');
    expect(ALL_ENTRY_TYPES).toContain('pivot');
    expect(ALL_ENTRY_TYPES).toContain('evidence_support');
    expect(ALL_ENTRY_TYPES).toContain('evidence_against');
    expect(ALL_ENTRY_TYPES).toContain('question');
    expect(ALL_ENTRY_TYPES).toContain('note');
  });
});

describe('createDefaultFindings / createDefaultConclusion', () => {
  it('createDefaultFindings 应返回空结构', () => {
    const f = createDefaultFindings();
    expect(f.evidences).toEqual([]);
    expect(f.analysis).toBe('');
    expect(f.contradictions).toEqual([]);
  });

  it('createDefaultConclusion 应返回 inconclusive', () => {
    const c = createDefaultConclusion();
    expect(c.result).toBe('inconclusive');
    expect(c.keyInsights).toEqual([]);
  });
});