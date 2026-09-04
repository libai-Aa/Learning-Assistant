/**
 * ExperimentReportStore 单元测试
 *
 * @description 测试 src/stores/experiment-report-store.ts 的 Zustand store：
 *   报告 CRUD、条目管理、证据管理、状态转换、自动总结、统计、
 *   以及 ensureReportForTarget 的幂等性。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExperimentReportStore } from '../experiment-report-store';
import { createEvidence } from '../../lib/research/experiment-report';

// Mock Zustand persist（与 idea-store.test.ts 一致）
vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
}));

describe('ExperimentReportStore', () => {
  beforeEach(() => {
    // 重置 store
    useExperimentReportStore.setState({
      reports: [],
      selectedReportId: null,
      isLoading: false,
      error: null,
    });
  });

  // ============ 报告 CRUD ============

  describe('createReport', () => {
    it('应创建报告并返回ID', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: '探索X' });

      expect(id).toMatch(/^rpt_/);
      const report = store.getReport(id);
      expect(report).toBeDefined();
      expect(report?.basicInfo.topic).toBe('探索X');
      expect(report?.basicInfo.status).toBe('in_progress');
    });

    it('空主题应返回空字符串并设置错误', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: '' });

      expect(id).toBe('');
      expect(useExperimentReportStore.getState().error).toBeTruthy();
    });
  });

  describe('ensureReportForTarget', () => {
    it('应创建新报告并返回ID', () => {
      const store = useExperimentReportStore.getState();
      const id = store.ensureReportForTarget(
        { ideaId: 'idea_1' },
        { topic: '来自想法' }
      );

      expect(id).toMatch(/^rpt_/);
      const report = store.getReport(id);
      expect(report?.basicInfo.ideaId).toBe('idea_1');
    });

    it('对同一 ideaId 应幂等返回相同ID', () => {
      const store = useExperimentReportStore.getState();
      const id1 = store.ensureReportForTarget(
        { ideaId: 'idea_1' },
        { topic: 'T' }
      );
      const id2 = store.ensureReportForTarget(
        { ideaId: 'idea_1' },
        { topic: 'T' }
      );

      expect(id1).toBe(id2);
      expect(store.getAllReports()).toHaveLength(1);
    });

    it('对同一 researchQuestionId 应幂等', () => {
      const store = useExperimentReportStore.getState();
      const id1 = store.ensureReportForTarget(
        { researchQuestionId: 'q_1' },
        { topic: 'T' }
      );
      const id2 = store.ensureReportForTarget(
        { researchQuestionId: 'q_1' },
        { topic: 'T' }
      );

      expect(id1).toBe(id2);
    });

    it('不同 ideaId 应创建不同报告', () => {
      const store = useExperimentReportStore.getState();
      const id1 = store.ensureReportForTarget(
        { ideaId: 'idea_1' },
        { topic: 'T1' }
      );
      const id2 = store.ensureReportForTarget(
        { ideaId: 'idea_2' },
        { topic: 'T2' }
      );

      expect(id1).not.toBe(id2);
      expect(store.getAllReports()).toHaveLength(2);
    });
  });

  describe('getReport / getAllReports', () => {
    it('getReport 不存在应返回 undefined', () => {
      const store = useExperimentReportStore.getState();
      expect(store.getReport('nonexistent')).toBeUndefined();
    });

    it('getAllReports 应返回全部', () => {
      const store = useExperimentReportStore.getState();
      store.createReport({ topic: 'A' });
      store.createReport({ topic: 'B' });
      expect(store.getAllReports()).toHaveLength(2);
    });
  });

  describe('getReportByIdea / getReportByQuestion', () => {
    it('应按 ideaId 查找', () => {
      const store = useExperimentReportStore.getState();
      store.createReport({ topic: 'T', ideaId: 'idea_123' });
      const report = store.getReportByIdea('idea_123');
      expect(report).toBeDefined();
      expect(report?.basicInfo.ideaId).toBe('idea_123');
    });

    it('应按 questionId 查找', () => {
      const store = useExperimentReportStore.getState();
      store.createReport({ topic: 'T', researchQuestionId: 'q_456' });
      const report = store.getReportByQuestion('q_456');
      expect(report).toBeDefined();
    });
  });

  describe('updateReport', () => {
    it('应更新指定部分', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      const ok = store.updateReport(id, {
        motivation: { why: '新理由', hypothesis: '新假设' },
      });
      expect(ok).toBe(true);

      const report = store.getReport(id);
      expect(report?.motivation.why).toBe('新理由');
      expect(report?.motivation.hypothesis).toBe('新假设');
    });

    it('不存在的报告应返回 false', () => {
      const store = useExperimentReportStore.getState();
      expect(store.updateReport('nonexistent', {})).toBe(false);
    });
  });

  describe('deleteReport', () => {
    it('应删除报告', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      expect(store.deleteReport(id)).toBe(true);
      expect(store.getReport(id)).toBeUndefined();
    });

    it('删除选中报告应清空 selectedReportId', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.selectReport(id);

      store.deleteReport(id);
      expect(useExperimentReportStore.getState().selectedReportId).toBeNull();
    });
  });

  // ============ 状态转换 ============

  describe('setStatus / canSetStatus', () => {
    it('合法转换应成功', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      expect(store.canSetStatus(id, 'completed')).toBe(true);
      expect(store.setStatus(id, 'completed')).toBe(true);
      expect(store.getReport(id)?.basicInfo.status).toBe('completed');
    });

    it('非法转换应失败', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.setStatus(id, 'falsified');

      expect(store.canSetStatus(id, 'completed')).toBe(false);
      expect(store.setStatus(id, 'completed')).toBe(false);
    });
  });

  describe('finalizeReport', () => {
    it('应转换状态并生成总结草稿', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      // 添加一些条目
      store.addEntry(id, {
        type: 'breakthrough',
        title: '关键突破',
        content: '发现X成立',
      });
      store.addEntry(id, {
        type: 'setback',
        title: '方法失败',
        content: '方法M行不通',
        reflection: '教训',
      });

      const ok = store.finalizeReport(id, 'completed');
      expect(ok).toBe(true);

      const report = store.getReport(id);
      expect(report?.basicInfo.status).toBe('completed');
      expect(report?.basicInfo.completedAt).toBeDefined();
      // 应自动提取关键洞察
      expect(report?.conclusion.keyInsights).toContain('关键突破');
      expect(report?.conclusion.lessonsLearned.some((l) => l.includes('方法失败'))).toBe(true);
    });

    it('不存在的报告应返回 false', () => {
      const store = useExperimentReportStore.getState();
      expect(store.finalizeReport('nonexistent')).toBe(false);
    });
  });

  // ============ 选择管理 ============

  describe('selectReport / getSelectedReport', () => {
    it('应选中并获取报告', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      store.selectReport(id);
      const selected = store.getSelectedReport();
      expect(selected?.id).toBe(id);
    });

    it('selectReport(null) 应清空选择', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.selectReport(id);

      store.selectReport(null);
      expect(store.getSelectedReport()).toBeUndefined();
    });
  });

  // ============ 探索记录条目 ============

  describe('addEntry', () => {
    it('应添加条目并返回ID', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      const entryId = store.addEntry(id, {
        type: 'idea',
        title: '新想法',
        content: '内容',
      });

      expect(entryId).toMatch(/^entry_/);
      const entries = store.getEntries(id);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('新想法');
    });

    it('应更新报告的 lastUpdatedAt', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      const original = store.getReport(id)!.basicInfo.lastUpdatedAt;

      // 确保时间戳不同
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          store.addEntry(id, {
            type: 'idea',
            title: 't',
            content: 'c',
          });
          const updated = store.getReport(id)!.basicInfo.lastUpdatedAt;
          expect(updated).not.toBe(original);
          resolve();
        }, 10);
      });
    });

    it('不存在的报告应返回 null', () => {
      const store = useExperimentReportStore.getState();
      const entryId = store.addEntry('nonexistent', {
        type: 'idea',
        title: 't',
        content: 'c',
      });
      expect(entryId).toBeNull();
    });

    it('空标题应返回 null 并设置错误', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      const entryId = store.addEntry(id, {
        type: 'idea',
        title: '',
        content: 'c',
      });
      expect(entryId).toBeNull();
      expect(useExperimentReportStore.getState().error).toBeTruthy();
    });
  });

  describe('updateEntry', () => {
    it('应更新条目', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      const entryId = store.addEntry(id, {
        type: 'idea',
        title: '原标题',
        content: '原内容',
      });

      const ok = store.updateEntry(id, entryId!, { title: '新标题' });
      expect(ok).toBe(true);
      expect(store.getEntry(id, entryId!)?.title).toBe('新标题');
    });

    it('不存在的条目应返回 false', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      expect(store.updateEntry(id, 'nonexistent', {})).toBe(false);
    });
  });

  describe('deleteEntry', () => {
    it('应删除条目', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      const entryId = store.addEntry(id, {
        type: 'idea',
        title: 't',
        content: 'c',
      });

      expect(store.deleteEntry(id, entryId!)).toBe(true);
      expect(store.getEntries(id)).toHaveLength(0);
    });
  });

  describe('getEntries / getEntriesByFilter', () => {
    it('getEntries 应按时间升序返回', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      // 添加多个条目
      const e1 = store.addEntry(id, { type: 'idea', title: '第一', content: 'c' });
      const e2 = store.addEntry(id, { type: 'attempt', title: '第二', content: 'c' });
      const e3 = store.addEntry(id, { type: 'discovery', title: '第三', content: 'c' });

      const asc = store.getEntries(id, 'asc');
      expect(asc.map((e) => e.id)).toEqual([e1, e2, e3]);

      const desc = store.getEntries(id, 'desc');
      expect(desc.map((e) => e.id)).toEqual([e3, e2, e1]);
    });

    it('getEntriesByFilter 应按类型过滤', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.addEntry(id, { type: 'idea', title: 't', content: 'c' });
      store.addEntry(id, { type: 'attempt', title: 't', content: 'c' });
      store.addEntry(id, { type: 'idea', title: 't', content: 'c' });

      const filtered = store.getEntriesByFilter(id, { type: 'idea' });
      expect(filtered).toHaveLength(2);
    });

    it('getEntriesByFilter 应按关键词过滤', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.addEntry(id, { type: 'idea', title: '关键想法', content: 'c' });
      store.addEntry(id, { type: 'attempt', title: '普通尝试', content: 'c' });

      const filtered = store.getEntriesByFilter(id, { keyword: '关键' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('关键想法');
    });
  });

  // ============ 证据 ============

  describe('addEvidence / removeEvidence', () => {
    it('应添加和删除证据', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });

      const ev = createEvidence(id, {
        type: 'data',
        stance: 'support',
        description: '支持证据',
        content: '数据',
        confidence: 0.8,
      });

      expect(store.addEvidence(id, ev)).toBe(true);
      expect(store.getReport(id)?.findings.evidences).toHaveLength(1);

      expect(store.removeEvidence(id, ev.id)).toBe(true);
      expect(store.getReport(id)?.findings.evidences).toHaveLength(0);
    });

    it('不存在的报告应返回 false', () => {
      const store = useExperimentReportStore.getState();
      expect(store.addEvidence('nonexistent', {} as any)).toBe(false);
    });
  });

  // ============ 统计 ============

  describe('getStats', () => {
    it('应返回正确统计', () => {
      const store = useExperimentReportStore.getState();
      const id1 = store.createReport({ topic: 'A' });
      const id2 = store.createReport({ topic: 'B' });
      store.setStatus(id2, 'completed');

      store.addEntry(id1, { type: 'idea', title: 't', content: 'c' });
      store.addEntry(id1, { type: 'attempt', title: 't', content: 'c' });

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byStatus.in_progress).toBe(1);
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.totalEntries).toBe(2);
      expect(stats.averageEntriesPerReport).toBe(1);
    });
  });

  describe('getEntryStats', () => {
    it('应返回条目统计', () => {
      const store = useExperimentReportStore.getState();
      const id = store.createReport({ topic: 'T' });
      store.addEntry(id, { type: 'idea', title: 't', content: 'c' });
      store.addEntry(id, { type: 'idea', title: 't', content: 'c' });
      store.addEntry(id, { type: 'breakthrough', title: 't', content: 'c' });

      const stats = store.getEntryStats(id);
      expect(stats.total).toBe(3);
      expect(stats.byType.idea).toBe(2);
      expect(stats.byType.breakthrough).toBe(1);
    });

    it('不存在的报告应返回空统计', () => {
      const store = useExperimentReportStore.getState();
      const stats = store.getEntryStats('nonexistent');
      expect(stats.total).toBe(0);
    });
  });

  // ============ 状态管理 ============

  describe('setLoading / setError / clearAll', () => {
    it('应设置加载状态', () => {
      const store = useExperimentReportStore.getState();
      store.setLoading(true);
      expect(useExperimentReportStore.getState().isLoading).toBe(true);
    });

    it('应设置错误', () => {
      const store = useExperimentReportStore.getState();
      store.setError('出错了');
      expect(useExperimentReportStore.getState().error).toBe('出错了');
    });

    it('clearAll 应清空所有', () => {
      const store = useExperimentReportStore.getState();
      store.createReport({ topic: 'A' });
      store.createReport({ topic: 'B' });

      store.clearAll();
      expect(useExperimentReportStore.getState().reports).toHaveLength(0);
      expect(useExperimentReportStore.getState().selectedReportId).toBeNull();
    });
  });

  // ============ 过滤 ============

  describe('getReportsByFilter', () => {
    it('应按状态过滤', () => {
      const store = useExperimentReportStore.getState();
      const id1 = store.createReport({ topic: 'A' });
      const id2 = store.createReport({ topic: 'B' });
      store.setStatus(id2, 'completed');

      const result = store.getReportsByFilter({ status: 'completed' });
      expect(result).toHaveLength(1);
      expect(result[0].basicInfo.topic).toBe('B');
    });

    it('按 ideaId 过滤', () => {
      const store = useExperimentReportStore.getState();
      store.createReport({ topic: 'A', ideaId: 'idea_1' });
      store.createReport({ topic: 'B', ideaId: 'idea_2' });

      const result = store.getReportsByFilter({ ideaId: 'idea_1' });
      expect(result).toHaveLength(1);
    });
  });
});

// ============ 选择器 Hooks 测试 ============

describe('ExperimentReportStore selectors', () => {
  beforeEach(() => {
    useExperimentReportStore.setState({
      reports: [],
      selectedReportId: null,
      isLoading: false,
      error: null,
    });
  });

  it('useAllReports 应返回所有报告', () => {
    // 直接通过 getState 测试，避免 React hook 环境
    const store = useExperimentReportStore.getState();
    store.createReport({ topic: 'A' });
    store.createReport({ topic: 'B' });

    expect(useExperimentReportStore.getState().reports).toHaveLength(2);
  });
});