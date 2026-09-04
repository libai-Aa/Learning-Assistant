/**
 * 实验报告与 Research 区集成辅助
 *
 * @description 提供与 research-store / idea-store 协同工作的便捷函数。
 *   上层调用方在用户开始探索新想法/问题时调用本模块的集成函数，
 *   即可自动创建实验报告；探索过程中随时追加记录；探索完成时
 *   自动生成总结草稿。
 *
 * 设计目标：
 * - 不修改 research-store / idea-store 的现有逻辑，避免破坏既有功能
 * - 提供纯函数式的"协同 API"，由调用方按需调用
 * - 自动从想法/问题中提取主题、方法论推荐等智能默认值
 *
 * @module src/lib/research/experiment-report-integration
 */

import { useExperimentReportStore } from '../../stores/experiment-report-store';
import { useResearchStore } from '../../stores/research-store';
import { useIdeaStore } from '../../stores/idea-store';
import {
  recommendMethodology,
  inferTags,
} from './experiment-report';
import type { CreateExplorationEntryInput } from '../../types/experiment-report';

// ============ 集成 API ============

/**
 * 为研究问题自动创建/获取实验报告
 *
 * 调用时机：当用户在 Research 区选中一个研究问题开始探索时调用。
 * 若该问题已有报告则返回现有ID，否则创建新报告并预填默认值。
 *
 * @param questionId 研究问题ID
 * @returns 实验报告ID
 */
export function ensureReportForQuestion(questionId: string): string {
  const researchStore = useResearchStore.getState();
  const reportStore = useExperimentReportStore.getState();
  const question = researchStore.getQuestion(questionId);

  if (!question) {
    throw new Error(`研究问题 ${questionId} 不存在`);
  }

  return reportStore.ensureReportForTarget(
    { researchQuestionId: questionId },
    {
      topic: question.question,
      tags: inferTags(question.question),
    }
  );
}

/**
 * 为想法自动创建/获取实验报告
 *
 * 调用时机：当用户在 Idea 区选中一个想法开始探索时调用。
 *
 * @param ideaId 想法ID
 * @returns 实验报告ID
 */
export function ensureReportForIdea(ideaId: string): string {
  const ideaStore = useIdeaStore.getState();
  const reportStore = useExperimentReportStore.getState();
  const idea = ideaStore.getIdea(ideaId);

  if (!idea) {
    throw new Error(`想法 ${ideaId} 不存在`);
  }

  return reportStore.ensureReportForTarget(
    { ideaId },
    {
      topic: idea.content,
      tags: inferTags(idea.content, idea.tags),
    }
  );
}

/**
 * 在探索过程中追加一条记录
 *
 * @param reportId 实验报告ID
 * @param input 记录输入
 * @returns 记录ID（失败返回 null）
 */
export function appendExplorationEntry(
  reportId: string,
  input: CreateExplorationEntryInput
): string | null {
  return useExperimentReportStore.getState().addEntry(reportId, input);
}

/**
 * 完成探索并自动生成总结
 *
 * 调用时机：当用户认为探索已结束（无论结论是成立/证伪/无法定论）时调用。
 * 会自动：
 * 1. 转换报告状态
 * 2. 根据 entries + findings 生成结论草稿
 * 3. 同步更新对应研究问题/想法的状态
 *
 * @param reportId 实验报告ID
 * @param status 探索结论状态
 * @returns 是否成功
 */
export function finalizeExploration(
  reportId: string,
  status: 'completed' | 'falsified' | 'inconclusive' = 'completed'
): boolean {
  const reportStore = useExperimentReportStore.getState();
  const report = reportStore.getReport(reportId);
  if (!report) return false;

  // 1. 完成报告（含自动总结）
  const ok = reportStore.finalizeReport(reportId, status);
  if (!ok) return false;

  // 2. 同步研究问题状态
  if (report.basicInfo.researchQuestionId) {
    const researchStore = useResearchStore.getState();
    const qid = report.basicInfo.researchQuestionId;
    const researchStatus =
      status === 'completed'
        ? 'verified'
        : status === 'falsified'
          ? 'falsified'
          : 'synthesized';
    researchStore.setQuestionStatus(qid, researchStatus);
  }

  // 3. 同步想法实践状态
  if (report.basicInfo.ideaId) {
    const ideaStore = useIdeaStore.getState();
    const iid = report.basicInfo.ideaId;
    const practiceStatus =
      status === 'completed'
        ? 'done'
        : status === 'falsified'
          ? 'falsified'
          : 'active';
    ideaStore.updatePracticeStatus(iid, practiceStatus);
  }

  return true;
}

/**
 * 当研究问题被删除时，同步删除其关联的实验报告
 *
 * @param questionId 研究问题ID
 * @returns 是否删除了报告
 */
export function cleanupReportForQuestion(questionId: string): boolean {
  const reportStore = useExperimentReportStore.getState();
  const report = reportStore.getReportByQuestion(questionId);
  if (!report) return false;
  return reportStore.deleteReport(report.id);
}

/**
 * 当想法被删除时，同步删除其关联的实验报告
 *
 * @param ideaId 想法ID
 * @returns 是否删除了报告
 */
export function cleanupReportForIdea(ideaId: string): boolean {
  const reportStore = useExperimentReportStore.getState();
  const report = reportStore.getReportByIdea(ideaId);
  if (!report) return false;
  return reportStore.deleteReport(report.id);
}

/**
 * 为新创建的研究问题预生成实验报告（可选）
 *
 * 调用时机：在 research-store.addQuestion 之后调用，
 * 即可立即为新问题创建一份实验报告，让用户从一开始就能看到报告框架。
 *
 * @param questionId 研究问题ID
 * @param methodologyHint 方法论提示（可选，未提供则根据问题文本推荐）
 */
export function preCreateReportForQuestion(
  questionId: string,
  methodologyHint?: 'socratic' | 'five-whys' | 'first-principles'
): string {
  const researchStore = useResearchStore.getState();
  const reportStore = useExperimentReportStore.getState();
  const question = researchStore.getQuestion(questionId);
  if (!question) {
    throw new Error(`研究问题 ${questionId} 不存在`);
  }

  const reportId = reportStore.ensureReportForTarget(
    { researchQuestionId: questionId },
    {
      topic: question.question,
      tags: inferTags(question.question),
    }
  );

  // 预填方法论
  const methodology =
    methodologyHint ??
    question.methodology ??
    recommendMethodology(question.question);
  reportStore.updateReport(reportId, {
    theory: { methodology },
    motivation: {
      hypothesis: question.question,
    },
  });

  return reportId;
}

/**
 * 获取一个研究问题/想法的实验报告（如果存在）
 *
 * @param target 目标标识
 * @returns 实验报告或 undefined
 */
export function getReportForTarget(target: {
  ideaId?: string;
  researchQuestionId?: string;
}) {
  const reportStore = useExperimentReportStore.getState();
  if (target.ideaId) {
    return reportStore.getReportByIdea(target.ideaId);
  }
  if (target.researchQuestionId) {
    return reportStore.getReportByQuestion(target.researchQuestionId);
  }
  return undefined;
}

// ============ 导出 ============

export { useExperimentReportStore } from '../../stores/experiment-report-store';
export { useResearchStore } from '../../stores/research-store';
export { useIdeaStore } from '../../stores/idea-store';