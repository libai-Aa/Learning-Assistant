/**
 * 探索时间线组件
 *
 * @description 查询"已探索过的想法/问题"对应的研究报告。
 *
 * 设计原则：
 * - 单一职责：本组件只负责"查询 + 展示研究报告"
 * - 数据驱动：从 experiment-report-store 读取真实数据，不显示示例数据
 * - 简洁查询：搜索框 + 报告列表（标题/状态/时间），点击展开查看报告详情
 * - 星空暗色主题：透明背景、半透明卡片、浅色文字、THEME 色板
 *
 * React 19 + zustand 5 注意：
 * - useAllReports() selector 返回 state.reports（稳定引用），安全
 * - 派生数据（过滤、排序）一律用 useMemo 计算，避免在 selector 中返回新数组
 *
 * @module src/components/research/exploration-timeline
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useAllReports } from '../../stores/experiment-report-store';
import type {
  ExperimentReport,
  ExplorationStatus,
  ExplorationEntryType,
  CreateExplorationEntryInput,
} from '../../types/experiment-report';
import {
  ExplorationStatusNames,
  ExplorationStatusColors,
  ExplorationEntryTypeNames,
  ExplorationEntryTypeStyles,
} from '../../types/experiment-report';

// ============ 星空暗色主题色板（与 App.tsx ResearchView 保持一致） ============

const THEME = {
  textPrimary: '#e5e7ff', // 主文字
  textSecondary: '#a5b4fc', // 次文字 / 标签
  textMuted: '#94a3b8', // 辅助文字
  textFaint: '#6b7280', // 时间戳等弱化文字
  panelBg: 'rgba(10,10,30,0.6)', // 面板背景
  panelBorder: 'rgba(165,180,252,0.2)', // 面板边框
  inputBg: 'rgba(0,0,0,0.4)', // 输入框背景
  inputBorder: 'rgba(165,180,252,0.3)', // 输入框边框
  buttonBg: 'rgba(255,255,255,0.08)', // 按钮默认背景
  buttonBgHover: 'rgba(255,255,255,0.14)', // 按钮悬停背景
  tagBg: 'rgba(165,180,252,0.2)', // 标签背景
  timelineAxis: 'rgba(165,180,252,0.3)', // 时间轴线
  accentGrad: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', // 选中渐变
};

// ============ 工具函数 ============

/** 格式化时间为简短显示（含"刚刚/N分钟前"等相对时间） */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}天前`;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** 截断文本 */
function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

// ============ 状态标签样式映射 ============

/** 状态标签：使用 ExplorationStatusColors 作为边框/文字色，背景半透明 */
function StatusBadge({ status }: { status: ExplorationStatus }) {
  const color = ExplorationStatusColors[status];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        fontSize: '11px',
        borderRadius: '10px',
        border: `1px solid ${color}66`,
        color,
        background: `${color}1a`, // 10% 透明度背景
        whiteSpace: 'nowrap',
      }}
    >
      {ExplorationStatusNames[status]}
    </span>
  );
}

// ============ 报告详情子组件 ============

/**
 * 报告详情：展示实验目的、实验过程、实验结论等关键字段
 *
 * 从 ExperimentReport 类型读取：
 * - motivation（实验目的：why / hypothesis / expectedGoal）
 * - entries（实验过程：按时间正序的探索记录条目）
 * - conclusion（实验结论：result / conclusion / keyInsights / lessonsLearned）
 * - findings（发现与数据：evidences / analysis）
 */
const ReportDetail: React.FC<{ report: ExperimentReport }> = ({ report }) => {
  // 探索过程条目按时间正序排序（派生数据，useMemo 保证引用稳定）
  const sortedEntries = useMemo(() => {
    return [...report.entries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [report.entries]);

  const hasMotivation =
    report.motivation.why ||
    report.motivation.hypothesis ||
    report.motivation.expectedGoal;
  const hasConclusion =
    report.conclusion.conclusion ||
    report.conclusion.keyInsights.length > 0 ||
    report.conclusion.lessonsLearned.length > 0;
  const hasFindings =
    report.findings.evidences.length > 0 || report.findings.analysis;

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '12px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '6px',
        border: `1px solid ${THEME.panelBorder}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* 实验目的 */}
      <section>
        <div style={{ fontSize: '12px', color: THEME.textSecondary, fontWeight: 600, marginBottom: '6px' }}>
          🎯 实验目的
        </div>
        {hasMotivation ? (
          <div style={{ fontSize: '12px', color: THEME.textPrimary, lineHeight: 1.7 }}>
            {report.motivation.why && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: THEME.textMuted }}>动机：</span>
                {report.motivation.why}
              </div>
            )}
            {report.motivation.hypothesis && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: THEME.textMuted }}>假设：</span>
                {report.motivation.hypothesis}
              </div>
            )}
            {report.motivation.expectedGoal && (
              <div>
                <span style={{ color: THEME.textMuted }}>目标：</span>
                {report.motivation.expectedGoal}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: THEME.textFaint, fontStyle: 'italic' }}>
            暂未填写实验目的
          </div>
        )}
      </section>

      {/* 实验过程 */}
      <section>
        <div style={{ fontSize: '12px', color: THEME.textSecondary, fontWeight: 600, marginBottom: '6px' }}>
          🔬 实验过程（{sortedEntries.length} 条记录）
        </div>
        {sortedEntries.length > 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '240px',
              overflowY: 'auto',
              padding: '4px 8px 4px 4px',
            }}
          >
            {sortedEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  fontSize: '12px',
                  color: THEME.textPrimary,
                  padding: '6px 8px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '4px',
                  borderLeft: `2px solid ${THEME.timelineAxis}`,
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: '2px' }}>
                  {entry.title}
                </div>
                <div style={{ color: THEME.textMuted, fontSize: '11px' }}>
                  {formatTimestamp(entry.createdAt)} · {truncateText(entry.content, 80)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: THEME.textFaint, fontStyle: 'italic' }}>
            暂无探索记录
          </div>
        )}
      </section>

      {/* 发现与数据 */}
      {hasFindings && (
        <section>
          <div style={{ fontSize: '12px', color: THEME.textSecondary, fontWeight: 600, marginBottom: '6px' }}>
            📊 发现与数据
          </div>
          <div style={{ fontSize: '12px', color: THEME.textPrimary, lineHeight: 1.7 }}>
            {report.findings.analysis && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: THEME.textMuted }}>分析：</span>
                {report.findings.analysis}
              </div>
            )}
            {report.findings.evidences.length > 0 && (
              <div>
                <span style={{ color: THEME.textMuted }}>证据：</span>
                {report.findings.evidences.length} 条（
                {report.findings.evidences.filter((e) => e.stance === 'support').length} 支持 /
                {report.findings.evidences.filter((e) => e.stance === 'against').length} 反对）
              </div>
            )}
          </div>
        </section>
      )}

      {/* 实验结论 */}
      <section>
        <div style={{ fontSize: '12px', color: THEME.textSecondary, fontWeight: 600, marginBottom: '6px' }}>
          📝 实验结论
        </div>
        {hasConclusion ? (
          <div style={{ fontSize: '12px', color: THEME.textPrimary, lineHeight: 1.7 }}>
            {report.conclusion.conclusion && (
              <div style={{ marginBottom: '6px' }}>{report.conclusion.conclusion}</div>
            )}
            {report.conclusion.keyInsights.length > 0 && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: THEME.textMuted }}>关键洞察：</span>
                {report.conclusion.keyInsights.join('；')}
              </div>
            )}
            {report.conclusion.lessonsLearned.length > 0 && (
              <div>
                <span style={{ color: THEME.textMuted }}>经验教训：</span>
                {report.conclusion.lessonsLearned.join('；')}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: THEME.textFaint, fontStyle: 'italic' }}>
            暂未填写实验结论
          </div>
        )}
      </section>
    </div>
  );
};

// ============ 空状态 ============

const EmptyState: React.FC = () => (
  <div
    style={{
      padding: '24px 12px',
      textAlign: 'center',
      color: THEME.textMuted,
      fontSize: '13px',
      fontStyle: 'italic',
    }}
  >
    暂无探索记录，在上方输入想法开始探索
  </div>
);

// ============ 主组件 ============

/**
 * 探索时间线组件：查询探索过的想法的研究报告
 *
 * 无 props：直接从 experiment-report-store 读取所有报告。
 * selector 订阅 state.reports（稳定引用），派生数据用 useMemo 计算，
 * 避免 React 19 + zustand 5 的 error #185 无限重渲染陷阱。
 */
export function ExplorationTimeline() {
  // ========== 从 store 读取所有报告（稳定引用，安全） ==========
  const reports = useAllReports();

  // ========== 查询状态 ==========
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ========== 派生数据（useMemo 保证引用稳定） ==========

  /** 按关键词过滤报告（匹配主题/假设/动机） */
  const filteredReports = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return reports;
    return reports.filter((r) => {
      const haystack = [
        r.basicInfo.topic,
        r.motivation.why,
        r.motivation.hypothesis,
        r.motivation.expectedGoal,
        ...(r.basicInfo.tags ?? []),
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(kw);
    });
  }, [reports, keyword]);

  /** 按开始时间倒序排序（最新探索的在前面） */
  const sortedReports = useMemo(() => {
    return [...filteredReports].sort(
      (a, b) =>
        new Date(b.basicInfo.startedAt).getTime() -
        new Date(a.basicInfo.startedAt).getTime()
    );
  }, [filteredReports]);

  // ========== 事件处理 ==========

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ========== 渲染 ==========

  return (
    <div
      className="exploration-timeline"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: 'transparent',
        color: THEME.textPrimary,
      }}
    >
      {/* 搜索框 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索想法/问题标题、假设、动机..."
          style={{
            flex: 1,
            padding: '6px 10px',
            fontSize: '12px',
            color: THEME.textPrimary,
            background: THEME.inputBg,
            border: `1px solid ${THEME.inputBorder}`,
            borderRadius: '6px',
            outline: 'none',
          }}
        />
        {keyword && (
          <button
            type="button"
            onClick={() => setKeyword('')}
            title="清除搜索"
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              color: THEME.textMuted,
              background: THEME.buttonBg,
              border: `1px solid ${THEME.panelBorder}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
        <span style={{ fontSize: '11px', color: THEME.textFaint, whiteSpace: 'nowrap' }}>
          {sortedReports.length}/{reports.length}
        </span>
      </div>

      {/* 报告列表 */}
      {sortedReports.length === 0 ? (
        reports.length === 0 ? (
          <EmptyState />
        ) : (
          <div
            style={{
              padding: '16px 12px',
              textAlign: 'center',
              color: THEME.textMuted,
              fontSize: '12px',
              fontStyle: 'italic',
            }}
          >
            没有匹配「{keyword}」的探索记录
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sortedReports.map((report) => {
            const isExpanded = expandedId === report.id;
            return (
              <div
                key={report.id}
                style={{
                  background: THEME.panelBg,
                  border: `1px solid ${THEME.panelBorder}`,
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}
              >
                {/* 报告头部（可点击展开） */}
                <button
                  type="button"
                  onClick={() => toggleExpand(report.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: THEME.textPrimary,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ color: THEME.textSecondary, fontSize: '11px' }}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: '13px',
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {report.basicInfo.topic}
                  </span>
                  <StatusBadge status={report.basicInfo.status} />
                  <span
                    style={{
                      fontSize: '11px',
                      color: THEME.textFaint,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTimestamp(report.basicInfo.startedAt)}
                  </span>
                </button>
                {/* 报告详情（展开时显示） */}
                {isExpanded && <ReportDetail report={report} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ 兼容性导出 ============
//
// 保留 ExplorationTimelineProps 与 ExplorationTimeline 命名导出形式，
// 便于渐进迁移期间 App.tsx 的 lazy import 不需要立即改动类型签名。
// 新组件已无 props，旧 props 在调用处会被忽略。

/** @deprecated 新版 ExplorationTimeline 无需 props，保留类型仅为渐进迁移 */
export interface ExplorationTimelineProps {
  /** @deprecated 已从 store 读取，忽略 */
  entries?: unknown[];
  /** @deprecated 已从 store 读取，忽略 */
  reportId?: string;
  [key: string]: unknown;
}

/** 默认导出（兼容 lazy import 的 default 形式） */
export default ExplorationTimeline;

// ============ 添加探索记录表单 ============
//
// 注意：本组件与"查询时间线"职责不同，但历史上与 ExplorationTimeline 同文件。
// experiment-report-panel.tsx 仍从此处导入，为最小化修改保留于此。
// 后续可独立拆分为 add-exploration-entry-form.tsx。

/** 所有记录类型（固定顺序） */
const EXPLORATION_ENTRY_TYPES: ExplorationEntryType[] = [
  'idea',
  'attempt',
  'discovery',
  'breakthrough',
  'setback',
  'reflection',
  'pivot',
  'evidence_support',
  'evidence_against',
  'question',
  'note',
];

interface AddExplorationEntryFormProps {
  reportId: string;
  onSubmit: (input: CreateExplorationEntryInput) => void;
  onCancel: () => void;
}

/**
 * 添加探索记录条目表单
 *
 * 让用户输入 type / title / content / reflection，提交后调用 onSubmit。
 * 样式与星空暗色主题保持一致。
 */
export const AddExplorationEntryForm: React.FC<AddExplorationEntryFormProps> = ({
  reportId,
  onSubmit,
  onCancel,
}) => {
  const [type, setType] = useState<ExplorationEntryType>('idea');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [reflection, setReflection] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const t = title.trim();
      const c = content.trim();
      if (!t || !c) return;
      onSubmit({
        type,
        title: t,
        content: c,
        reflection: reflection.trim() || undefined,
      });
    },
    [type, title, content, reflection, onSubmit]
  );

  // 复用 THEME 色板（已在文件上方定义）
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    color: THEME.textPrimary,
    background: THEME.inputBg,
    border: `1px solid ${THEME.inputBorder}`,
    borderRadius: '4px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: '12px',
        background: THEME.panelBg,
        border: `1px solid ${THEME.panelBorder}`,
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
      data-report-id={reportId}
    >
      {/* 类型选择 */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: THEME.textSecondary,
            marginBottom: '4px',
          }}
        >
          类型
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ExplorationEntryType)}
          style={inputStyle}
        >
          {EXPLORATION_ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ExplorationEntryTypeStyles[t].icon} {ExplorationEntryTypeNames[t]}
            </option>
          ))}
        </select>
      </div>

      {/* 标题 */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: THEME.textSecondary,
            marginBottom: '4px',
          }}
        >
          标题
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="简短概括这一步探索"
          style={inputStyle}
          required
        />
      </div>

      {/* 内容 */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: THEME.textSecondary,
            marginBottom: '4px',
          }}
        >
          内容
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="详细记录这一步的想法、做法、结果"
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          required
        />
      </div>

      {/* 反思（可选） */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            color: THEME.textSecondary,
            marginBottom: '4px',
          }}
        >
          反思（可选）
        </label>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="对这一步的元认知思考"
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
        />
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            color: THEME.textMuted,
            background: THEME.buttonBg,
            border: `1px solid ${THEME.panelBorder}`,
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          取消
        </button>
        <button
          type="submit"
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            color: '#fff',
            background: THEME.accentGrad,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          添加记录
        </button>
      </div>
    </form>
  );
};
