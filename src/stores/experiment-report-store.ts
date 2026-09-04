/**
 * 实验报告状态管理
 *
 * @description 使用 Zustand + persist 管理实验报告与探索记录条目。
 *   与 idea-store / research-store 协同工作：当用户开始探索新想法/问题时
 *   自动创建报告，探索过程中随时追加记录，探索完成后生成总结。
 *
 * @module src/stores/experiment-report-store
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CreateExperimentReportInput,
  CreateExplorationEntryInput,
  EvidenceItem,
  ExperimentReport,
  ExperimentReportFilter,
  ExperimentReportStats,
  ExplorationEntry,
  ExplorationEntryFilter,
  ExplorationEntryStats,
  ExplorationStatus,
  UpdateExplorationEntryInput,
  UpdateExperimentReportInput,
} from '../types/experiment-report';
import {
  canTransitionStatus,
  computeEntryStats,
  computeReportStats,
  createExperimentReport,
  createExplorationEntry,
  filterEntries,
  filterReports,
  findEntry,

  generateSummaryDraft,
  sortEntries,
  transitionStatus,
  updateExperimentReport,
  updateExplorationEntry,
} from '../lib/research/experiment-report';

// ============ Store 状态接口 ============

interface ExperimentReportStoreState {
  /** 所有实验报告 */
  reports: ExperimentReport[];
  /** 当前选中的报告ID */
  selectedReportId: string | null;
  /** 加载状态 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;

  // ========== 报告 CRUD ==========

  /** 创建实验报告（开始探索时调用） */
  createReport: (input: CreateExperimentReportInput) => string;
  /** 自动为想法/问题创建报告（已存在则返回现有ID） */
  ensureReportForTarget: (
    target: { ideaId?: string; researchQuestionId?: string },
    defaults: { topic: string; explorer?: string; tags?: string[] }
  ) => string;
  /** 获取报告 */
  getReport: (id: string) => ExperimentReport | undefined;
  /** 获取所有报告 */
  getAllReports: () => ExperimentReport[];
  /** 按过滤条件获取报告 */
  getReportsByFilter: (filter: ExperimentReportFilter) => ExperimentReport[];
  /** 按想法ID获取报告 */
  getReportByIdea: (ideaId: string) => ExperimentReport | undefined;
  /** 按研究问题ID获取报告 */
  getReportByQuestion: (questionId: string) => ExperimentReport | undefined;
  /** 更新报告各部分 */
  updateReport: (id: string, updates: UpdateExperimentReportInput) => boolean;
  /** 删除报告 */
  deleteReport: (id: string) => boolean;
  /** 设置探索状态（带合法性校验） */
  setStatus: (id: string, status: ExplorationStatus) => boolean;
  /** 检查状态转换是否合法 */
  canSetStatus: (id: string, status: ExplorationStatus) => boolean;
  /** 完成探索并自动生成总结草稿 */
  finalizeReport: (
    id: string,
    status?: 'completed' | 'falsified' | 'inconclusive'
  ) => boolean;

  // ========== 选择管理 ==========

  /** 选中报告 */
  selectReport: (id: string | null) => void;
  /** 获取选中的报告 */
  getSelectedReport: () => ExperimentReport | undefined;

  // ========== 探索记录条目 ==========

  /** 添加探索记录条目 */
  addEntry: (reportId: string, input: CreateExplorationEntryInput) => string | null;
  /** 更新探索记录条目 */
  updateEntry: (
    reportId: string,
    entryId: string,
    updates: UpdateExplorationEntryInput
  ) => boolean;
  /** 删除探索记录条目 */
  deleteEntry: (reportId: string, entryId: string) => boolean;
  /** 获取报告的所有条目（按时间排序） */
  getEntries: (reportId: string, order?: 'asc' | 'desc') => ExplorationEntry[];
  /** 按过滤条件获取条目 */
  getEntriesByFilter: (
    reportId: string,
    filter: ExplorationEntryFilter,
    order?: 'asc' | 'desc'
  ) => ExplorationEntry[];
  /** 获取单条条目 */
  getEntry: (reportId: string, entryId: string) => ExplorationEntry | undefined;

  // ========== 证据 ==========

  /** 添加证据 */
  addEvidence: (reportId: string, evidence: EvidenceItem) => boolean;
  /** 删除证据 */
  removeEvidence: (reportId: string, evidenceId: string) => boolean;

  // ========== 统计 ==========

  /** 获取所有报告的统计 */
  getStats: () => ExperimentReportStats;
  /** 获取指定报告的条目统计 */
  getEntryStats: (reportId: string) => ExplorationEntryStats;

  // ========== 状态管理 ==========

  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
  /** 设置错误 */
  setError: (error: string | null) => void;
  /** 清空所有 */
  clearAll: () => void;
}

// ============ 辅助：内部更新报告并保留选中 ==========

function replaceReport(
  reports: ExperimentReport[],
  id: string,
  updater: (r: ExperimentReport) => ExperimentReport
): ExperimentReport[] {
  return reports.map((r) => (r.id === id ? updater(r) : r));
}

// ============ Store 实现 ============

export const useExperimentReportStore = create<ExperimentReportStoreState>()(
  persist(
    (set, get) => ({
      reports: [],
      selectedReportId: null,
      isLoading: false,
      error: null,

      // ========== 报告 CRUD ==========

      createReport: (input) => {
        try {
          const report = createExperimentReport(input);
          set((state) => ({ reports: [...state.reports, report] }));
          return report.id;
        } catch (e) {
          set({ error: (e as Error).message });
          return '';
        }
      },

      ensureReportForTarget: (target, defaults) => {
        const { reports } = get();
        // 先按 ideaId 找
        if (target.ideaId) {
          const existing = reports.find(
            (r) => r.basicInfo.ideaId === target.ideaId
          );
          if (existing) return existing.id;
        }
        // 再按 researchQuestionId 找
        if (target.researchQuestionId) {
          const existing = reports.find(
            (r) => r.basicInfo.researchQuestionId === target.researchQuestionId
          );
          if (existing) return existing.id;
        }
        // 不存在则创建
        return get().createReport({
          topic: defaults.topic,
          explorer: defaults.explorer,
          ideaId: target.ideaId,
          researchQuestionId: target.researchQuestionId,
          tags: defaults.tags,
        });
      },

      getReport: (id) => get().reports.find((r) => r.id === id),

      getAllReports: () => get().reports,

      getReportsByFilter: (filter) => filterReports(get().reports, filter),

      getReportByIdea: (ideaId) =>
        get().reports.find((r) => r.basicInfo.ideaId === ideaId),

      getReportByQuestion: (questionId) =>
        get().reports.find((r) => r.basicInfo.researchQuestionId === questionId),

      updateReport: (id, updates) => {
        const state = get();
        const report = state.reports.find((r) => r.id === id);
        if (!report) return false;
        try {
          const next = updateExperimentReport(report, updates);
          set({ reports: replaceReport(state.reports, id, () => next) });
          return true;
        } catch (e) {
          set({ error: (e as Error).message });
          return false;
        }
      },

      deleteReport: (id) => {
        const state = get();
        const exists = state.reports.some((r) => r.id === id);
        if (!exists) return false;
        set({
          reports: state.reports.filter((r) => r.id !== id),
          selectedReportId:
            state.selectedReportId === id ? null : state.selectedReportId,
        });
        return true;
      },

      canSetStatus: (id, status) => {
        const report = get().reports.find((r) => r.id === id);
        if (!report) return false;
        return canTransitionStatus(report.basicInfo.status, status);
      },

      setStatus: (id, status) => {
        const state = get();
        const report = state.reports.find((r) => r.id === id);
        if (!report) return false;
        try {
          const next = transitionStatus(report, status);
          set({ reports: replaceReport(state.reports, id, () => next) });
          return true;
        } catch (e) {
          set({ error: (e as Error).message });
          return false;
        }
      },

      finalizeReport: (id, status = 'completed') => {
        const state = get();
        const report = state.reports.find((r) => r.id === id);
        if (!report) return false;
        try {
          // 1. 状态转换
          let next = transitionStatus(report, status);
          // 2. 生成总结草稿
          const draft = generateSummaryDraft(next);
          // 3. 合并到 conclusion / reflection
          next = updateExperimentReport(next, {
            conclusion: draft.conclusion,
            reflection: draft.reflection,
          });
          set({ reports: replaceReport(state.reports, id, () => next) });
          return true;
        } catch (e) {
          set({ error: (e as Error).message });
          return false;
        }
      },

      // ========== 选择管理 ==========

      selectReport: (id) => set({ selectedReportId: id }),

      getSelectedReport: () => {
        const { reports, selectedReportId } = get();
        return reports.find((r) => r.id === selectedReportId);
      },

      // ========== 探索记录条目 ==========

      addEntry: (reportId, input) => {
        const state = get();
        const report = state.reports.find((r) => r.id === reportId);
        if (!report) {
          set({ error: `报告 ${reportId} 不存在` });
          return null;
        }
        try {
          const entry = createExplorationEntry(reportId, input);
          const now = new Date().toISOString();
          set({
            reports: replaceReport(state.reports, reportId, (r) => ({
              ...r,
              entries: [...r.entries, entry],
              basicInfo: { ...r.basicInfo, lastUpdatedAt: now },
              updatedAt: now,
            })),
          });
          return entry.id;
        } catch (e) {
          set({ error: (e as Error).message });
          return null;
        }
      },

      updateEntry: (reportId, entryId, updates) => {
        const state = get();
        const report = state.reports.find((r) => r.id === reportId);
        if (!report) return false;
        const entry = findEntry(report, entryId);
        if (!entry) return false;
        try {
          const nextEntry = updateExplorationEntry(entry, updates);
          const now = new Date().toISOString();
          set({
            reports: replaceReport(state.reports, reportId, (r) => ({
              ...r,
              entries: r.entries.map((e) =>
                e.id === entryId ? nextEntry : e
              ),
              basicInfo: { ...r.basicInfo, lastUpdatedAt: now },
              updatedAt: now,
            })),
          });
          return true;
        } catch (e) {
          set({ error: (e as Error).message });
          return false;
        }
      },

      deleteEntry: (reportId, entryId) => {
        const state = get();
        const report = state.reports.find((r) => r.id === reportId);
        if (!report) return false;
        const exists = report.entries.some((e) => e.id === entryId);
        if (!exists) return false;
        const now = new Date().toISOString();
        set({
          reports: replaceReport(state.reports, reportId, (r) => ({
            ...r,
            entries: r.entries.filter((e) => e.id !== entryId),
            basicInfo: { ...r.basicInfo, lastUpdatedAt: now },
            updatedAt: now,
          })),
        });
        return true;
      },

      getEntries: (reportId, order = 'asc') => {
        const report = get().reports.find((r) => r.id === reportId);
        if (!report) return [];
        return sortEntries(report.entries, order);
      },

      getEntriesByFilter: (reportId, filter, order = 'asc') => {
        const report = get().reports.find((r) => r.id === reportId);
        if (!report) return [];
        return sortEntries(filterEntries(report.entries, filter), order);
      },

      getEntry: (reportId, entryId) => {
        const report = get().reports.find((r) => r.id === reportId);
        if (!report) return undefined;
        return findEntry(report, entryId);
      },

      // ========== 证据 ==========

      addEvidence: (reportId, evidence) => {
        const state = get();
        const report = state.reports.find((r) => r.id === reportId);
        if (!report) return false;
        const now = new Date().toISOString();
        set({
          reports: replaceReport(state.reports, reportId, (r) => ({
            ...r,
            findings: {
              ...r.findings,
              evidences: [...r.findings.evidences, evidence],
            },
            basicInfo: { ...r.basicInfo, lastUpdatedAt: now },
            updatedAt: now,
          })),
        });
        return true;
      },

      removeEvidence: (reportId, evidenceId) => {
        const state = get();
        const report = state.reports.find((r) => r.id === reportId);
        if (!report) return false;
        const exists = report.findings.evidences.some((e) => e.id === evidenceId);
        if (!exists) return false;
        const now = new Date().toISOString();
        set({
          reports: replaceReport(state.reports, reportId, (r) => ({
            ...r,
            findings: {
              ...r.findings,
              evidences: r.findings.evidences.filter((e) => e.id !== evidenceId),
            },
            basicInfo: { ...r.basicInfo, lastUpdatedAt: now },
            updatedAt: now,
          })),
        });
        return true;
      },

      // ========== 统计 ==========

      getStats: () => computeReportStats(get().reports),

      getEntryStats: (reportId) => {
        const report = get().reports.find((r) => r.id === reportId);
        if (!report) return computeEntryStats([]);
        return computeEntryStats(report.entries);
      },

      // ========== 状态管理 ==========

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearAll: () =>
        set({ reports: [], selectedReportId: null, isLoading: false, error: null }),
    }),
    {
      name: 'experiment-report-storage',
      version: 1,
    }
  )
);

// ============ 选择器 Hooks ============

/** 获取所有报告 */
export const useAllReports = () =>
  useExperimentReportStore((state) => state.reports);

/** 获取选中的报告 */
export const useSelectedReport = () =>
  useExperimentReportStore((state) => {
    if (!state.selectedReportId) return undefined;
    return state.reports.find((r) => r.id === state.selectedReportId);
  });

/** 获取报告统计 */
export const useReportStats = () =>
  useExperimentReportStore((state) => state.getStats());

/** 获取进行中的报告 */
export const useInProgressReports = () =>
  useExperimentReportStore((state) =>
    state.reports.filter((r) => r.basicInfo.status === 'in_progress')
  );

/** 获取已完成（含证伪/无法定论）的报告 */
export const useFinishedReports = () =>
  useExperimentReportStore((state) =>
    state.reports.filter((r) =>
      ['completed', 'falsified', 'inconclusive'].includes(r.basicInfo.status)
    )
  );

// ============ 默认导出 ============

export default useExperimentReportStore;

// 重新导出工具函数，便于组件直接使用
export {
  generateId,
  createExperimentReport,
  createExplorationEntry,
  generateSummaryDraft,
} from '../lib/research/experiment-report';