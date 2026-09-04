/**
 * PPT 设计进修面板 (PPTStudyPanel)
 *
 * @description "更懂你的WPS"系统的 PPT 设计学习进修 UI 层：
 *   1. 显示学习笔记内容（research/ppt-study-notes.md，纯文本保持格式）
 *   2. 显示评估历史记录（research/pptagent-study-notes.md），按时间倒序展示
 *      Content/Design/Coherence 三维度 + 总分，分数用彩色数字呈现
 *   3. "立即进修"按钮：调用 pptDesignLearner.runStudySession() 触发一次进修，
 *      显示进修结果摘要，并自动刷新笔记
 *   4. "刷新笔记"按钮：重新读取笔记文件与评估历史
 *   5. 弱项分析：计算最近 5 次评估中三维度平均分，定位最低维度并提示
 *
 *   设计思路（说人话）：
 *     这一面板是"PPT审美进修班"的控制台——既能看历史成绩单（评估分数趋势），
 *     又能看进修笔记（学到了啥），还能一键请 LLM 进修最新趋势。
 *     样式上保持透明背景让壁纸透出，分数用红橙绿三色一眼定位弱项。
 *
 * @module src/components/wps/ppt-study-panel
 */

import { useState, useEffect } from 'react';
import { pptDesignLearner, type EvaluationRecord } from '../../lib/wps/ppt-design-learner';

// ============ 样式常量 ============
// 整体透明背景让壁纸透出；容器用很轻的半透明背景+圆角+边框，与项目现有风格一致
const STYLES: Record<string, React.CSSProperties> = {
  // 外层容器：透明，不遮挡壁纸
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 16,
    color: '#e2e8f0',
    fontSize: 13,
  },
  // 标题行
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap' as const,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#f1f5f9',
    margin: 0,
  },
  // 按钮组
  btnRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  // 主按钮：圆角 + 渐变背景，年轻人审美
  btnPrimary: {
    padding: '8px 18px',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    color: 'white',
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
    transition: 'all 0.2s',
  },
  // 次按钮：描边风格
  btnSecondary: {
    padding: '8px 18px',
    background: 'rgba(255,255,255,0.08)',
    color: '#cbd5e1',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 999,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  // 区块容器：半透明背景 + 圆角 + 边框
  section: {
    background: 'rgba(15,18,40,0.55)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#a5b4fc',
    margin: '0 0 10px 0',
    paddingBottom: 6,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  // 错误提示
  error: {
    padding: '8px 12px',
    background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: 8,
    color: '#fca5a5',
    fontSize: 12,
  },
  // 加载中
  loading: {
    padding: 20,
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  // 进修结果摘要
  studyResult: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const,
    background: 'rgba(99,102,241,0.08)',
    padding: 12,
    borderRadius: 8,
    border: '1px solid rgba(99,102,241,0.2)',
  },
  // 评估记录单条
  evalItem: {
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    marginBottom: 6,
    fontSize: 12,
  },
  evalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap' as const,
  },
  evalSeq: {
    color: '#94a3b8',
    fontSize: 11,
  },
  evalDate: {
    color: '#64748b',
    fontSize: 11,
  },
  evalTopic: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 500,
  },
  // 分数行
  scoreRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    fontSize: 12,
  },
  scoreItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  scoreLabel: {
    color: '#94a3b8',
  },
  // 建议行
  suggestRow: {
    marginTop: 4,
    paddingLeft: 8,
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 1.6,
  },
  // 弱项分析
  weakAnalysis: {
    marginTop: 10,
    padding: '8px 10px',
    background: 'rgba(251,191,36,0.1)',
    border: '1px solid rgba(251,191,36,0.3)',
    borderRadius: 8,
    color: '#fcd34d',
    fontSize: 12,
  },
  // 空状态
  empty: {
    color: '#64748b',
    fontSize: 12,
    padding: '12px 0',
    textAlign: 'center' as const,
  },
  // 笔记内容 pre
  notesPre: {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: '#e2e8f0',
    fontSize: 12,
    lineHeight: 1.7,
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
};

// ============ 工具函数 ============

/**
 * 按分数返回对应颜色：≥80 绿色 / ≥60 橙色 / <60 红色
 * 一眼定位弱项维度
 */
function scoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // 绿
  if (score >= 60) return '#f59e0b'; // 橙
  return '#ef4444'; // 红
}

/**
 * 从 ISO 时间字符串中提取日期部分（YYYY-MM-DD）
 * 解析失败时原样返回
 */
function dateOnly(ts: string): string {
  if (!ts) return '';
  // 兼容 "2026-08-25T12:34:56..." 与 "2026-08-25 12:34:56" 两种格式
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : ts;
}

/**
 * 计算最近 N 次评估中三维度平均分，返回最低维度名 + 平均分
 * 用于弱项分析提示
 */
function analyzeWeakness(
  records: EvaluationRecord[],
  n = 5,
): { dim: string; avg: number } | null {
  if (records.length === 0) return null;
  const recent = records.slice(-n);
  const dims: Array<{ name: string; avg: number }> = [
    { name: '内容(Content)', avg: avg(recent.map((r) => r.content)) },
    { name: '设计(Design)', avg: avg(recent.map((r) => r.design)) },
    { name: '连贯(Coherence)', avg: avg(recent.map((r) => r.coherence)) },
  ];
  // 找平均分最低的维度
  dims.sort((a, b) => a.avg - b.avg);
  return { dim: dims[0].name, avg: dims[0].avg };
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

// ============ 主组件 ============

/**
 * PPT 设计进修面板
 *
 * 函数式组件 + Hooks，inline style 与项目现有风格一致。
 * 错误处理完善，加载失败不会导致白屏（错误信息内联展示）。
 */
export function PPTStudyPanel() {
  const [loading, setLoading] = useState(false);
  const [studying, setStudying] = useState(false);
  const [studyResult, setStudyResult] = useState(''); // 进修结果摘要
  const [notes, setNotes] = useState(''); // 学习笔记内容
  const [evalHistory, setEvalHistory] = useState<EvaluationRecord[]>([]); // 评估历史
  const [error, setError] = useState('');

  /**
   * 加载学习笔记 + 评估历史
   * 并发请求，任一失败抛错由外层捕获
   */
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [notesContent, history] = await Promise.all([
        pptDesignLearner.getStudyNotes(),
        pptDesignLearner.getEvaluationHistory(),
      ]);
      setNotes(notesContent || '（暂无学习笔记）');
      setEvalHistory(history);
    } catch (e) {
      setError('加载数据失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "立即进修"按钮：调用 runStudySession 触发一次进修
   * 进修成功后显示摘要并自动刷新笔记
   */
  const handleStudy = async () => {
    setStudying(true);
    setError('');
    try {
      const result = await pptDesignLearner.runStudySession();
      setStudyResult(result);
      // 进修后刷新笔记
      await loadData();
    } catch (e) {
      setError('进修失败: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setStudying(false);
    }
  };

  // 最近 10 条评估记录（按时间倒序展示，最新的在最上）
  const recentEvals = evalHistory.slice(-10).reverse();
  const weakness = analyzeWeakness(evalHistory, 5);

  return (
    <div style={STYLES.wrap}>
      {/* 标题 + 操作按钮 */}
      <div style={STYLES.header}>
        <h3 style={STYLES.title}>📚 PPT设计进修</h3>
        <div style={STYLES.btnRow}>
          <button
            style={{ ...STYLES.btnPrimary, opacity: studying ? 0.6 : 1 }}
            onClick={handleStudy}
            disabled={studying}
          >
            {studying ? '⏳ 进修中...' : '🚀 立即进修'}
          </button>
          <button
            style={{ ...STYLES.btnSecondary, opacity: loading ? 0.6 : 1 }}
            onClick={loadData}
            disabled={loading}
          >
            🔄 刷新笔记
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && <div style={STYLES.error}>⚠️ {error}</div>}

      {/* 加载中提示 */}
      {loading && <div style={STYLES.loading}>加载中...</div>}

      {/* 进修结果摘要 */}
      {studyResult && (
        <div style={STYLES.section}>
          <div style={STYLES.sectionTitle}>─ 进修结果 ─</div>
          <div style={STYLES.studyResult}>{studyResult}</div>
        </div>
      )}

      {/* 评估分数趋势 */}
      <div style={STYLES.section}>
        <div style={STYLES.sectionTitle}>─ 评估分数趋势 ─</div>
        {recentEvals.length === 0 ? (
          <div style={STYLES.empty}>暂无评估记录，生成 PPT 后会自动写入</div>
        ) : (
          <>
            <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>
              最近 {recentEvals.length} 次评估（按时间倒序）：
            </div>
            {recentEvals.map((rec, idx) => (
              <div key={idx} style={STYLES.evalItem}>
                <div style={STYLES.evalHeader}>
                  <span style={STYLES.evalSeq}>#{idx + 1}</span>
                  <span style={STYLES.evalTopic}>{rec.topic || '未命名主题'}</span>
                  <span style={STYLES.evalDate}>{dateOnly(rec.timestamp)}</span>
                </div>
                <div style={STYLES.scoreRow}>
                  <span style={STYLES.scoreItem}>
                    <span style={STYLES.scoreLabel}>Content:</span>
                    <strong style={{ color: scoreColor(rec.content) }}>{rec.content}</strong>
                  </span>
                  <span style={STYLES.scoreItem}>
                    <span style={STYLES.scoreLabel}>Design:</span>
                    <strong style={{ color: scoreColor(rec.design) }}>{rec.design}</strong>
                  </span>
                  <span style={STYLES.scoreItem}>
                    <span style={STYLES.scoreLabel}>Coherence:</span>
                    <strong style={{ color: scoreColor(rec.coherence) }}>{rec.coherence}</strong>
                  </span>
                  <span style={STYLES.scoreItem}>
                    <span style={STYLES.scoreLabel}>总分:</span>
                    <strong style={{ color: scoreColor(rec.total) }}>{rec.total}</strong>
                  </span>
                </div>
                {rec.suggestions && rec.suggestions.length > 0 && (
                  <div style={STYLES.suggestRow}>
                    {rec.suggestions.slice(0, 2).map((s, i) => (
                      <div key={i}>• {s}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* 弱项分析 */}
            {weakness && (
              <div style={STYLES.weakAnalysis}>
                📉 弱项分析：最近 5 次评估中，<strong>{weakness.dim}</strong> 维度平均分最低（
                {weakness.avg.toFixed(1)} 分），建议下次进修重点提升该维度。
              </div>
            )}
          </>
        )}
      </div>

      {/* 学习笔记 */}
      <div style={STYLES.section}>
        <div style={STYLES.sectionTitle}>─ 学习笔记 ─</div>
        <pre style={STYLES.notesPre}>{notes}</pre>
      </div>
    </div>
  );
}

export default PPTStudyPanel;