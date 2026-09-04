/**
 * 实验报告面板组件
 *
 * @description 显示完整实验报告，支持编辑各部分、添加探索记录、
 *   时间线展示。这是 Research 区探索详情的主视图。
 *
 * 八条结构（对应物理实验报告改造）：
 * 1. 基本信息（封面）
 * 2. 动机与目标（实验目的）
 * 3. 理论基础与假设（实验原理）
 * 4. 工具与资源（实验仪器）
 * 5. 探索过程记录（实验内容+数据记录）⭐核心
 * 6. 发现与数据（数据处理）
 * 7. 结论与反思（结果陈述+总结）
 * 8. 思考题与延伸
 *
 * @module src/components/research/experiment-report-panel
 */

import React, { useState, useCallback, useMemo } from 'react';
import type {

  ExplorationStatus,
  ExplorationEntry,
  CreateExplorationEntryInput,
  UpdateExperimentReportInput,
} from '../../types/experiment-report';
import {
  ExplorationStatusNames,
  ExplorationStatusColors,
} from '../../types/experiment-report';
import { useExperimentReportStore } from '../../stores/experiment-report-store';
import {
  ExplorationTimeline,
  AddExplorationEntryForm,
} from './exploration-timeline';

// ============ 工具函数 ============

/** 格式化时间 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 格式化日期（仅日期） */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ============ 可编辑区块组件 ============

/** 可编辑文本块属性 */
interface EditableTextBlockProps {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (value: string) => void;
}

/** 可编辑文本块：点击进入编辑，失焦/回车保存 */
const EditableTextBlock: React.FC<EditableTextBlockProps> = ({
  label,
  value,
  placeholder = '点击编辑...',
  multiline = false,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleStartEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const handleSave = useCallback(() => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        setEditing(false);
      }
    },
    [multiline, handleSave]
  );

  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          color: '#595959',
          marginBottom: '4px',
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {editing ? (
        multiline ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #1890ff',
              borderRadius: '4px',
            }}
          />
        ) : (
          <input
            type="text"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #1890ff',
              borderRadius: '4px',
            }}
          />
        )
      ) : (
        <div
          onClick={handleStartEdit}
          style={{
            padding: '6px 10px',
            border: '1px dashed #d9d9d9',
            borderRadius: '4px',
            minHeight: '32px',
            cursor: 'pointer',
            color: value ? '#262626' : '#bfbfbf',
            whiteSpace: 'pre-wrap',
          }}
        >
          {value || placeholder}
        </div>
      )}
    </div>
  );
};

/** 可编辑字符串列表 */
interface EditableListBlockProps {
  label: string;
  items: string[];
  placeholder?: string;
  onSave: (items: string[]) => void;
}

const EditableListBlock: React.FC<EditableListBlockProps> = ({
  label,
  items,
  placeholder = '每行一条...',
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items.join('\n'));

  const handleStartEdit = useCallback(() => {
    setDraft(items.join('\n'));
    setEditing(true);
  }, [items]);

  const handleSave = useCallback(() => {
    const next = draft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (JSON.stringify(next) !== JSON.stringify(items)) onSave(next);
    setEditing(false);
  }, [draft, items, onSave]);

  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '13px',
          color: '#595959',
          marginBottom: '4px',
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          rows={Math.max(3, items.length)}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #1890ff',
            borderRadius: '4px',
          }}
        />
      ) : (
        <div
          onClick={handleStartEdit}
          style={{
            padding: '6px 10px',
            border: '1px dashed #d9d9d9',
            borderRadius: '4px',
            minHeight: '32px',
            cursor: 'pointer',
            color: items.length > 0 ? '#262626' : '#bfbfbf',
          }}
        >
          {items.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            placeholder
          )}
        </div>
      )}
    </div>
  );
};

// ============ 区块容器 ============

/** 区块容器属性 */
interface SectionProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

/** 可折叠区块 */
const Section: React.FC<SectionProps> = ({
  title,
  icon,
  children,
  defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        marginBottom: '16px',
        border: '1px solid #f0f0f0',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <header
        onClick={() => setOpen(!open)}
        style={{
          padding: '12px 16px',
          backgroundColor: '#fafafa',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 600,
        }}
      >
        {icon && <span>{icon}</span>}
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ color: '#8c8c8c' }}>{open ? '▼' : '▶'}</span>
      </header>
      {open && <div style={{ padding: '16px' }}>{children}</div>}
    </section>
  );
};

// ============ 状态选择器 ============

/** 状态选择器 */
interface StatusSelectorProps {
  current: ExplorationStatus;
  canSet: (status: ExplorationStatus) => boolean;
  onChange: (status: ExplorationStatus) => void;
}

const StatusSelector: React.FC<StatusSelectorProps> = ({
  current,
  canSet,
  onChange,
}) => {
  const allStatuses: ExplorationStatus[] = [
    'in_progress',
    'completed',
    'shelved',
    'falsified',
    'inconclusive',
  ];
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {allStatuses.map((s) => {
        const active = s === current;
        const enabled = active || canSet(s);
        return (
          <button
            key={s}
            type="button"
            disabled={!enabled}
            onClick={() => onChange(s)}
            style={{
              padding: '4px 12px',
              borderRadius: '12px',
              border: `1px solid ${ExplorationStatusColors[s]}`,
              background: active ? ExplorationStatusColors[s] : '#fff',
              color: active ? '#fff' : ExplorationStatusColors[s],
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.4,
              fontSize: '12px',
            }}
          >
            {ExplorationStatusNames[s]}
          </button>
        );
      })}
    </div>
  );
};

// ============ 主面板 ============

/** 实验报告面板属性 */
export interface ExperimentReportPanelProps {
  /** 报告ID */
  reportId: string;
  /** 是否默认展开所有区块 */
  defaultAllOpen?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 关闭回调 */
  onClose?: () => void;
}

/**
 * 实验报告面板组件
 */
export const ExperimentReportPanel: React.FC<ExperimentReportPanelProps> = ({
  reportId,
  defaultAllOpen = true,
  className = '',
  onClose,
}) => {
  const store = useExperimentReportStore();
  const report = store.getReport(reportId);

  const [showAddEntry, setShowAddEntry] = useState(false);

  // 添加探索记录
  const handleAddEntry = useCallback(
    (input: CreateExplorationEntryInput) => {
      const id = store.addEntry(reportId, input);
      if (id) setShowAddEntry(false);
    },
    [reportId, store]
  );

  // 编辑条目：跳转到时间线内编辑（这里简化为删除后重添加提示）
  const handleEditEntry = useCallback(
    (entry: ExplorationEntry) => {
      // 简化实现：用 prompt 让用户编辑内容
      // 真实场景下应弹出模态框
      const newContent = typeof window !== 'undefined'
        ? window.prompt('编辑内容', entry.content)
        : null;
      if (newContent && newContent !== entry.content) {
        store.updateEntry(reportId, entry.id, { content: newContent });
      }
    },
    [reportId, store]
  );

  const handleDeleteEntry = useCallback(
    (entryId: string) => {
      if (
        typeof window !== 'undefined' &&
        window.confirm('确定删除这条探索记录？')
      ) {
        store.deleteEntry(reportId, entryId);
      }
    },
    [reportId, store]
  );

  // 更新报告各部分
  const updateReport = useCallback(
    (updates: UpdateExperimentReportInput) => {
      store.updateReport(reportId, updates);
    },
    [reportId, store]
  );

  // 状态变更
  const handleStatusChange = useCallback(
    (status: ExplorationStatus) => {
      if (status === 'completed' || status === 'falsified' || status === 'inconclusive') {
        if (
          typeof window !== 'undefined' &&
          window.confirm(`确定将探索状态改为"${ExplorationStatusNames[status]}"并自动生成总结草稿？`)
        ) {
          store.finalizeReport(reportId, status);
        }
      } else {
        store.setStatus(reportId, status);
      }
    },
    [reportId, store]
  );

  // 排序后的条目
  const sortedEntries = useMemo(() => {
    if (!report) return [];
    return [...report.entries].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [report]);

  if (!report) {
    return (
      <div
        className={`experiment-report-panel not-found ${className}`}
        style={{ padding: '32px', textAlign: 'center', color: '#8c8c8c' }}
      >
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
        <div>报告不存在或已被删除</div>
      </div>
    );
  }

  const { basicInfo, motivation, theory, tools, findings, conclusion, reflection } =
    report;
  const statusColor = ExplorationStatusColors[basicInfo.status];

  return (
    <div
      className={`experiment-report-panel ${className}`}
      style={{ maxWidth: '900px', margin: '0 auto', padding: '16px' }}
    >
      {/* ============ 头部：封面信息 ============ */}
      <header
        style={{
          padding: '20px',
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: `2px solid ${statusColor}`,
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '12px',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '4px' }}>
              🔬 探索实验报告
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: '22px',
                color: '#262626',
                lineHeight: 1.3,
              }}
            >
              {basicInfo.topic}
            </h1>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#8c8c8c',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* 元信息行 */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            fontSize: '12px',
            color: '#8c8c8c',
            marginBottom: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span>👤 {basicInfo.explorer}</span>
          <span>📅 开始：{formatDate(basicInfo.startedAt)}</span>
          <span>🔄 更新：{formatTime(basicInfo.lastUpdatedAt)}</span>
          {basicInfo.completedAt && (
            <span>✅ 完成：{formatDate(basicInfo.completedAt)}</span>
          )}
          {basicInfo.ideaId && <span>💡 想法ID：{basicInfo.ideaId}</span>}
          {basicInfo.researchQuestionId && (
            <span>❓ 问题ID：{basicInfo.researchQuestionId}</span>
          )}
        </div>

        {/* 状态选择器 */}
        <div style={{ marginBottom: '8px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              color: '#595959',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            探索状态
          </label>
          <StatusSelector
            current={basicInfo.status}
            canSet={(s) => store.canSetStatus(reportId, s)}
            onChange={handleStatusChange}
          />
        </div>

        {/* 标签 */}
        {basicInfo.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {basicInfo.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '2px 8px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#595959',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* ============ 1. 探索动机与目标 ============ */}
      <Section title="一、探索动机与目标" icon="🎯" defaultOpen={defaultAllOpen}>
        <EditableTextBlock
          label="为什么想要探索这个想法？"
          value={motivation.why}
          multiline
          onSave={(v) => updateReport({ motivation: { why: v } })}
        />
        <EditableTextBlock
          label="希望验证什么假设？"
          value={motivation.hypothesis}
          multiline
          onSave={(v) => updateReport({ motivation: { hypothesis: v } })}
        />
        <EditableTextBlock
          label="期望达到什么目标？"
          value={motivation.expectedGoal}
          multiline
          onSave={(v) => updateReport({ motivation: { expectedGoal: v } })}
        />
        <EditableTextBlock
          label="想法的来源（可选）"
          value={motivation.origin ?? ''}
          onSave={(v) => updateReport({ motivation: { origin: v } })}
        />
      </Section>

      {/* ============ 2. 理论基础与假设 ============ */}
      <Section title="二、理论基础与假设" icon="📚" defaultOpen={defaultAllOpen}>
        <EditableTextBlock
          label="初始假设"
          value={theory.initialAssumption}
          multiline
          onSave={(v) => updateReport({ theory: { initialAssumption: v } })}
        />
        <EditableTextBlock
          label="基于什么知识/理论？"
          value={theory.basedOn}
          multiline
          onSave={(v) => updateReport({ theory: { basedOn: v } })}
        />
        <EditableListBlock
          label="预期的可能结果"
          items={theory.expectedOutcomes}
          onSave={(items) =>
            updateReport({ theory: { expectedOutcomes: items } })
          }
        />
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              color: '#595959',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            研究方法论
          </label>
          <select
            value={theory.methodology}
            onChange={(e) =>
              updateReport({
                theory: {
                  methodology: e.target.value as typeof theory.methodology,
                },
              })
            }
            style={{ padding: '6px 10px', borderRadius: '4px' }}
          >
            <option value="socratic">苏格拉底提问法</option>
            <option value="five-whys">丰田五问法</option>
            <option value="first-principles">第一性原理</option>
          </select>
        </div>
        <EditableTextBlock
          label="方法论选择理由（可选）"
          value={theory.methodologyReason ?? ''}
          multiline
          onSave={(v) => updateReport({ theory: { methodologyReason: v } })}
        />
      </Section>

      {/* ============ 3. 探索工具与资源 ============ */}
      <Section title="三、探索工具与资源" icon="🛠" defaultOpen={defaultAllOpen}>
        <EditableListBlock
          label="使用的工具"
          items={tools.tools}
          onSave={(items) => updateReport({ tools: { tools: items } })}
        />
        <EditableListBlock
          label="用到的已有知识"
          items={tools.priorKnowledge}
          onSave={(items) => updateReport({ tools: { priorKnowledge: items } })}
        />
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              color: '#595959',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            参考文献
          </label>
          <div
            style={{
              padding: '8px',
              border: '1px dashed #d9d9d9',
              borderRadius: '4px',
              minHeight: '40px',
            }}
          >
            {tools.references.length === 0 ? (
              <span style={{ color: '#bfbfbf' }}>暂无参考文献</span>
            ) : (
              tools.references.map((ref, i) => (
                <div key={i} style={{ marginBottom: '4px', fontSize: '13px' }}>
                  {ref.url ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1890ff' }}
                    >
                      {ref.title}
                    </a>
                  ) : (
                    <span>{ref.title}</span>
                  )}
                  {ref.note && (
                    <span style={{ color: '#8c8c8c' }}> — {ref.note}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Section>

      {/* ============ 4. 探索过程记录 ⭐核心 ============ */}
      <Section title="四、探索过程记录" icon="🔬" defaultOpen={defaultAllOpen}>
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#e6f7ff',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
            color: '#1890ff',
          }}
        >
          💡 这不是日记——请记录你的想法演变、试错教训、意外发现与思路转变。
          每条记录都可以附上反思，体现思考深度。
        </div>

        {showAddEntry ? (
          <AddExplorationEntryForm
            reportId={reportId}
            onSubmit={handleAddEntry}
            onCancel={() => setShowAddEntry(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddEntry(true)}
            style={{
              padding: '8px 16px',
              border: '1px dashed #1890ff',
              borderRadius: '4px',
              background: '#fff',
              color: '#1890ff',
              cursor: 'pointer',
              width: '100%',
              marginBottom: '16px',
            }}
          >
            + 添加探索记录
          </button>
        )}

        <ExplorationTimeline
          reportId={reportId}
          entries={sortedEntries}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
        />
      </Section>

      {/* ============ 5. 发现与数据 ============ */}
      <Section title="五、发现与数据" icon="📊" defaultOpen={defaultAllOpen}>
        {/* 证据列表 */}
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              color: '#595959',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            证据（{findings.evidences.length}条）
          </label>
          {findings.evidences.length === 0 ? (
            <div style={{ color: '#bfbfbf', fontSize: '13px' }}>
              暂无证据。在探索记录中标记"支持证据"/"反对证据"时会自动汇总。
            </div>
          ) : (
            findings.evidences.map((ev) => (
              <div
                key={ev.id}
                style={{
                  padding: '8px 12px',
                  marginBottom: '6px',
                  borderRadius: '4px',
                  backgroundColor:
                    ev.stance === 'support' ? '#f6ffed' : '#fff1f0',
                  border: `1px solid ${
                    ev.stance === 'support' ? '#b7eb8f' : '#ffa39e'
                  }`,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px' }}>
                  {ev.stance === 'support' ? '✅' : '❌'} {ev.description}
                  <span style={{ color: '#8c8c8c', fontWeight: 400 }}>
                    {' '}
                    (置信度: {(ev.confidence * 100).toFixed(0)}%)
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#595959' }}>
                  {ev.content}
                </div>
              </div>
            ))
          )}
        </div>

        <EditableTextBlock
          label="数据分析结果"
          value={findings.analysis}
          multiline
          onSave={(v) => updateReport({ findings: { analysis: v } })}
        />
        <EditableTextBlock
          label="支持假设的证据摘要"
          value={findings.supportingSummary}
          multiline
          onSave={(v) => updateReport({ findings: { supportingSummary: v } })}
        />
        <EditableTextBlock
          label="反对假设的证据摘要（证伪证据）"
          value={findings.againstSummary}
          multiline
          onSave={(v) => updateReport({ findings: { againstSummary: v } })}
        />
        <EditableListBlock
          label="矛盾点和冲突"
          items={findings.contradictions}
          onSave={(items) =>
            updateReport({ findings: { contradictions: items } })
          }
        />
      </Section>

      {/* ============ 6. 结论与反思 ============ */}
      <Section title="六、结论与反思" icon="🎓" defaultOpen={defaultAllOpen}>
        <div style={{ marginBottom: '12px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '13px',
              color: '#595959',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            探索结论
          </label>
          <select
            value={conclusion.result}
            onChange={(e) =>
              updateReport({
                conclusion: {
                  result: e.target.value as typeof conclusion.result,
                },
              })
            }
            style={{ padding: '6px 10px', borderRadius: '4px' }}
          >
            <option value="confirmed">假设成立</option>
            <option value="falsified">假设不成立（已证伪）</option>
            <option value="partial">部分成立</option>
            <option value="inconclusive">无法确定</option>
          </select>
        </div>
        <EditableTextBlock
          label="结论详述"
          value={conclusion.conclusion}
          multiline
          onSave={(v) => updateReport({ conclusion: { conclusion: v } })}
        />
        <EditableListBlock
          label="关键洞察"
          items={conclusion.keyInsights}
          onSave={(items) =>
            updateReport({ conclusion: { keyInsights: items } })
          }
        />
        <EditableListBlock
          label="经验教训"
          items={conclusion.lessonsLearned}
          onSave={(items) =>
            updateReport({ conclusion: { lessonsLearned: items } })
          }
        />
        <EditableListBlock
          label="未解决的问题"
          items={conclusion.unresolvedQuestions}
          onSave={(items) =>
            updateReport({ conclusion: { unresolvedQuestions: items } })
          }
        />
        <EditableListBlock
          label="新产生的想法/问题"
          items={conclusion.newIdeas}
          onSave={(items) => updateReport({ conclusion: { newIdeas: items } })}
        />
        <EditableListBlock
          label="后续探索方向"
          items={conclusion.futureDirections}
          onSave={(items) =>
            updateReport({ conclusion: { futureDirections: items } })
          }
        />
      </Section>

      {/* ============ 7. 思考题与延伸 ============ */}
      <Section title="七、思考题与延伸" icon="💭" defaultOpen={defaultAllOpen}>
        <EditableListBlock
          label="这个探索引发的新问题"
          items={reflection.newQuestions}
          onSave={(items) =>
            updateReport({ reflection: { newQuestions: items } })
          }
        />
        <EditableListBlock
          label="可以推广到其他领域吗？"
          items={reflection.generalizations}
          onSave={(items) =>
            updateReport({ reflection: { generalizations: items } })
          }
        />
        <EditableListBlock
          label="与已有知识的连接"
          items={reflection.connections}
          onSave={(items) =>
            updateReport({ reflection: { connections: items } })
          }
        />
      </Section>

      {/* ============ 操作栏 ============ */}
      <footer
        style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#fafafa',
          borderRadius: '6px',
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (
              typeof window !== 'undefined' &&
              window.confirm('确定删除整份报告？此操作不可撤销。')
            ) {
              store.deleteReport(reportId);
              onClose?.();
            }
          }}
          style={{
            padding: '6px 16px',
            border: '1px solid #ffa39e',
            borderRadius: '4px',
            background: '#fff',
            color: '#f5222d',
            cursor: 'pointer',
          }}
        >
          删除报告
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              border: '1px solid #d9d9d9',
              borderRadius: '4px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        )}
      </footer>
    </div>
  );
};

// ============ 报告列表组件 ============

/** 报告列表属性 */
export interface ExperimentReportListProps {
  /** 选择报告回调 */
  onSelect: (reportId: string) => void;
  /** 是否显示新建按钮 */
  showCreateButton?: boolean;
  /** 新建回调 */
  onCreate?: () => void;
  /** 自定义类名 */
  className?: string;
}

/** 报告列表：展示所有实验报告 */
export const ExperimentReportList: React.FC<ExperimentReportListProps> = ({
  onSelect,
  showCreateButton = true,
  onCreate,
  className = '',
}) => {
  const reports = useExperimentReportStore((s) => s.reports);

  const sorted = useMemo(() => {
    return [...reports].sort(
      (a, b) =>
        new Date(b.basicInfo.lastUpdatedAt).getTime() -
        new Date(a.basicInfo.lastUpdatedAt).getTime()
    );
  }, [reports]);

  return (
    <div className={`experiment-report-list ${className}`}>
      {showCreateButton && (
        <button
          type="button"
          onClick={onCreate}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px dashed #1890ff',
            borderRadius: '6px',
            background: '#fff',
            color: '#1890ff',
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          + 新建探索报告
        </button>
      )}

      {sorted.length === 0 ? (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: '#8c8c8c',
            backgroundColor: '#fafafa',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <div>暂无探索报告</div>
          <div style={{ fontSize: '12px', marginTop: '4px' }}>
            当你开始探索一个想法或问题时，会自动创建报告。
          </div>
        </div>
      ) : (
        sorted.map((r) => {
          const color = ExplorationStatusColors[r.basicInfo.status];
          return (
            <div
              key={r.id}
              onClick={() => onSelect(r.id)}
              style={{
                padding: '12px 16px',
                border: `1px solid #f0f0f0`,
                borderLeft: `4px solid ${color}`,
                borderRadius: '4px',
                marginBottom: '8px',
                cursor: 'pointer',
                backgroundColor: '#fff',
                transition: 'box-shadow 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontWeight: 600, color: '#262626' }}>
                  {r.basicInfo.topic}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: `${color}11`,
                  }}
                >
                  {ExplorationStatusNames[r.basicInfo.status]}
                </span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#8c8c8c',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <span>📝 {r.entries.length} 条记录</span>
                <span>📊 {r.findings.evidences.length} 条证据</span>
                <span>🔄 {formatTime(r.basicInfo.lastUpdatedAt)}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

// ============ 默认导出 ============

export default ExperimentReportPanel;