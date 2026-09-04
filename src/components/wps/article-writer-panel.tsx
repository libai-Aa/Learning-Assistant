/**
 * 文章写作面板 UI 组件
 *
 * @description "更懂你的WPS"之文章写作辅助主界面。提供：
 *   - 需求输入区（主题、类型、目的、读者、字数、额外要求）
 *   - 模板选择/推荐区
 *   - 大纲编辑区（可调整章节结构）
 *   - 风格预览区（显示应用的风格画像特点）
 *   - 生成进度显示
 *   - 内容预览/编辑区
 *   - 导出/保存到 WPS
 *   - 反馈/重新生成
 *
 * 设计原则：
 *   - 用户掌控：大纲可编辑、风格可调整、反馈驱动迭代
 *   - 进度可见：每个阶段都有进度条与说明
 *   - 模板优先：UI 强调"基于我满意的模板"
 *   - 风格可视化：把抽象的风格画像用人类可读的方式呈现
 *
 * @module src/components/wps/article-writer-panel
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ArticleType,
  ArticleTypeNames,
  ArticleGenerationStageNames,
  type ArticleTypeValue,
  type ArticleWritingRequest,
  type ArticleWritingResult,
  type ArticleOutline,
  type ArticleSection,
  type ArticleGenerationProgress,
  type ArticleFeedback,
  type ArticleOutlineEdit,
} from '../../types/article-writing';
import { articleWriter } from '../../lib/wps/article-writer';
import { useTemplateStore } from '../../stores/template-store';
import type { DocumentTemplate } from '../../types/template';
import { TemplateCategoryNames } from '../../types/template';

// ============ 常量 ============

/** 文章类型选项 */
const TYPE_OPTIONS: ArticleTypeValue[] = [
  ArticleType.ACADEMIC,
  ArticleType.TECHNICAL,
  ArticleType.BUSINESS,
  ArticleType.ESSAY,
  ArticleType.NEWS,
  ArticleType.TUTORIAL,
  ArticleType.REVIEW,
  ArticleType.CUSTOM,
];

/** 反馈类型标签 */
const FEEDBACK_OPTIONS: Array<{ value: ArticleFeedback['type']; label: string }> = [
  { value: 'satisfied', label: '满意，确认完成' },
  { value: 'adjust_style', label: '调整风格' },
  { value: 'adjust_content', label: '调整内容' },
  { value: 'adjust_structure', label: '调整结构' },
  { value: 'change_template', label: '更换模板' },
  { value: 'regenerate', label: '完全重新生成' },
];

// ============ 工具函数 ============

/** 格式化日期 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** 把风格画像转为人类可读的特点列表 */
function describeStyleProfile(profile: ArticleWritingResult['appliedStyle']): string[] {
  const features: string[] = [];
  const { textual, visual } = profile.preferredStyles;
  const toneMap: Record<string, string> = {
    formal: '正式',
    casual: '随意',
    academic: '学术',
    persuasive: '说服性',
    neutral: '中性',
  };
  features.push(`语气：${toneMap[textual.toneStyle] || textual.toneStyle}`);
  const lenMap: Record<string, string> = {
    short: '短句为主',
    medium: '中等句长',
    long: '长句为主',
    mixed: '长短交错',
  };
  features.push(`句式：${lenMap[textual.sentenceLength] || textual.sentenceLength}`);
  features.push(`正式程度：${(textual.formalityLevel * 100).toFixed(0)}%`);
  features.push(`简洁程度：${(textual.conciseness * 100).toFixed(0)}%`);
  features.push(`主字体：${visual.fontFamily.primaryFont}`);
  features.push(`视觉密度：${visual.visualDensity}`);
  return features;
}

// ============ 子组件：需求输入区 ============

interface RequestFormProps {
  request: ArticleWritingRequest;
  onChange: (request: ArticleWritingRequest) => void;
  onGenerate: () => void;
  onPreviewOutline: () => void;
  isGenerating: boolean;
}

const RequestForm: React.FC<RequestFormProps> = ({
  request,
  onChange,
  onGenerate,
  onPreviewOutline,
  isGenerating,
}) => {
  const update = useCallback(
    (patch: Partial<ArticleWritingRequest>) => {
      onChange({ ...request, ...patch });
    },
    [request, onChange]
  );

  return (
    <div className="space-y-3 p-3 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        写作需求
      </h3>

      {/* 主题 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">主题 *</label>
        <input
          type="text"
          value={request.topic}
          onChange={(e) => update({ topic: e.target.value })}
          placeholder="例如：大模型在科研中的应用"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>

      {/* 类型 + 字数 */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">类型</label>
          <select
            value={request.type}
            onChange={(e) => update({ type: e.target.value as ArticleTypeValue })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {ArticleTypeNames[t]}
              </option>
            ))}
          </select>
          {request.type === ArticleType.CUSTOM && (
            <input
              type="text"
              value={request.additionalRequirements || ''}
              onChange={(e) => update({ additionalRequirements: e.target.value })}
              placeholder="请描述自定义类型内容..."
              className="w-full mt-1 px-2 py-1.5 text-sm border border-orange-300 dark:border-orange-600 rounded-md bg-orange-50 dark:bg-orange-900/20"
            />
          )}
        </div>
        <div className="w-32">
          <label className="block text-xs text-gray-500 mb-1">期望字数</label>
          <input
            type="number"
            value={request.wordCount ?? ''}
            onChange={(e) =>
              update({ wordCount: e.target.value ? Number(e.target.value) : undefined })
            }
            placeholder="自动"
            min={100}
            step={100}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      {/* 目的 + 读者 */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">写作目的</label>
          <input
            type="text"
            value={request.purpose ?? ''}
            onChange={(e) => update({ purpose: e.target.value || undefined })}
            placeholder="例如：申请项目资助"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">目标读者</label>
          <input
            type="text"
            value={request.audience ?? ''}
            onChange={(e) => update({ audience: e.target.value || undefined })}
            placeholder="例如：学术评审"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          />
        </div>
      </div>

      {/* 额外要求 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">额外要求</label>
        <textarea
          value={request.additionalRequirements ?? ''}
          onChange={(e) => update({ additionalRequirements: e.target.value || undefined })}
          placeholder="例如：多用案例、避免术语堆砌"
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 resize-y"
        />
      </div>

      {/* 知识库查询 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">知识库查询关键词</label>
        <input
          type="text"
          value={request.knowledgeBaseQuery ?? ''}
          onChange={(e) => update({ knowledgeBaseQuery: e.target.value || undefined })}
          placeholder="留空则用主题作为查询"
          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onGenerate}
          disabled={!request.topic.trim() || isGenerating}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? '生成中…' : '✍️ 生成文章'}
        </button>
        <button
          onClick={onPreviewOutline}
          disabled={!request.topic.trim() || isGenerating}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          预览大纲
        </button>
      </div>
    </div>
  );
};

// ============ 子组件：模板选择区 ============

interface TemplateSelectorProps {
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  recommendations: DocumentTemplate[];
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selectedId,
  onSelect,
  recommendations,
}) => {
  return (
    <div className="space-y-2 p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          模板选择
        </h3>
        {selectedId && (
          <button
            onClick={() => onSelect(undefined)}
            className="text-xs text-blue-500 hover:underline"
          >
            清除（自动推荐）
          </button>
        )}
      </div>

      {recommendations.length === 0 ? (
        <p className="text-xs text-gray-400">
          暂无匹配模板，将使用文章类型默认骨架
        </p>
      ) : (
        <div className="space-y-1">
          {recommendations.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
                selectedId === tpl.id
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{tpl.name}</span>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                  {TemplateCategoryNames[tpl.category]}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                使用 {tpl.usageCount} 次 · 评分 {tpl.userRating ?? '—'}/5
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============ 子组件：大纲编辑区 ============

interface OutlineEditorProps {
  outline: ArticleOutline;
  onChange: (outline: ArticleOutline) => void;
  onConfirm: () => void;
  isGenerating: boolean;
}

const OutlineEditor: React.FC<OutlineEditorProps> = ({
  outline,
  onChange,
  onConfirm,
  isGenerating,
}) => {
  const updateSection = useCallback(
    (idx: number, patch: Partial<ArticleSection>) => {
      const sections = outline.sections.map((s, i) =>
        i === idx ? { ...s, ...patch } : s
      );
      onChange({ ...outline, sections });
    },
    [outline, onChange]
  );

  const addSection = useCallback(() => {
    const newIndex = outline.sections.length + 1;
    const sections = [
      ...outline.sections,
      {
        index: newIndex,
        heading: '新章节',
        level: 1,
        keyPoints: [],
        estimatedWords: 300,
      },
    ];
    onChange({ ...outline, sections });
  }, [outline, onChange]);

  const removeSection = useCallback(
    (idx: number) => {
      const sections = outline.sections
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, index: i + 1 }));
      onChange({ ...outline, sections });
    },
    [outline, onChange]
  );

  const moveSection = useCallback(
    (idx: number, direction: -1 | 1) => {
      const target = idx + direction;
      if (target < 0 || target >= outline.sections.length) return;
      const sections = [...outline.sections];
      [sections[idx], sections[target]] = [sections[target], sections[idx]];
      const reindexed = sections.map((s, i) => ({ ...s, index: i + 1 }));
      onChange({ ...outline, sections: reindexed });
    },
    [outline, onChange]
  );

  return (
    <div className="space-y-2 p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          大纲编辑
        </h3>
        <div className="flex gap-1">
          <button
            onClick={addSection}
            disabled={isGenerating}
            className="text-xs px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            + 章节
          </button>
          <button
            onClick={onConfirm}
            disabled={isGenerating}
            className="text-xs px-2 py-0.5 bg-green-500 text-white rounded hover:bg-green-600"
          >
            确认生成
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">主标题</label>
        <input
          type="text"
          value={outline.title}
          onChange={(e) => onChange({ ...outline, title: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>

      <div className="space-y-2">
        {outline.sections.map((sec, idx) => (
          <div
            key={idx}
            className="border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-1.5"
          >
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-400 w-6">{sec.index}.</span>
              <input
                type="text"
                value={sec.heading}
                onChange={(e) => updateSection(idx, { heading: e.target.value })}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
              <select
                value={sec.level}
                onChange={(e) => updateSection(idx, { level: Number(e.target.value) })}
                className="px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                title="标题级别"
              >
                {[1, 2, 3, 4].map((l) => (
                  <option key={l} value={l}>
                    H{l}
                  </option>
                ))}
              </select>
              <button
                onClick={() => moveSection(idx, -1)}
                disabled={idx === 0}
                className="text-xs px-1 py-0.5 border border-gray-300 rounded disabled:opacity-30"
                aria-label="上移"
              >
                ↑
              </button>
              <button
                onClick={() => moveSection(idx, 1)}
                disabled={idx === outline.sections.length - 1}
                className="text-xs px-1 py-0.5 border border-gray-300 rounded disabled:opacity-30"
                aria-label="下移"
              >
                ↓
              </button>
              <button
                onClick={() => removeSection(idx)}
                className="text-xs px-1 py-0.5 border border-red-300 text-red-600 rounded hover:bg-red-50"
                aria-label="删除章节"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">估计字数</span>
              <input
                type="number"
                value={sec.estimatedWords}
                onChange={(e) =>
                  updateSection(idx, { estimatedWords: Number(e.target.value) || 0 })
                }
                min={50}
                step={50}
                className="w-24 px-2 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
              <span className="text-xs text-gray-400">
                要点 {sec.keyPoints.length} 个
              </span>
            </div>
            {sec.keyPoints.length > 0 && (
              <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                {sec.keyPoints.map((kp, i) => (
                  <li key={i} className="truncate">
                    {kp}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============ 子组件：风格预览区 ============

interface StylePreviewProps {
  result: ArticleWritingResult | null;
  styleFeatures: string[] | null;
}

const StylePreview: React.FC<StylePreviewProps> = ({ result, styleFeatures }) => {
  const features = result ? describeStyleProfile(result.appliedStyle) : styleFeatures;
  if (!features || features.length === 0) return null;
  return (
    <div className="space-y-1 p-3 border-b border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        应用风格
      </h3>
      <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-1">
            <span className="text-blue-500 flex-shrink-0">•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// ============ 子组件：生成进度区 ============

interface ProgressViewProps {
  progress: ArticleGenerationProgress | null;
}

const ProgressView: React.FC<ProgressViewProps> = ({ progress }) => {
  if (!progress) return null;
  const stageName = ArticleGenerationStageNames[progress.stage];
  const isError = progress.stage === 'failed';
  const isDone = progress.stage === 'completed';
  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-sm font-medium ${
            isError
              ? 'text-red-600'
              : isDone
              ? 'text-green-600'
              : 'text-gray-700 dark:text-gray-300'
          }`}
        >
          {isError ? '✗ ' : isDone ? '✓ ' : '⏳ '}
          {stageName}
        </span>
        <span className="text-xs text-gray-500">{progress.percent}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isError
              ? 'bg-red-500'
              : isDone
              ? 'bg-green-500'
              : 'bg-blue-500'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{progress.message}</p>
      {progress.error && (
        <p className="text-xs text-red-500 mt-1">错误：{progress.error}</p>
      )}
    </div>
  );
};

// ============ 子组件：内容预览区 ============

interface ContentPreviewProps {
  result: ArticleWritingResult | null;
  onExport: () => void;
  isExporting: boolean;
}

const ContentPreview: React.FC<ContentPreviewProps> = ({
  result,
  onExport,
  isExporting,
}) => {
  if (!result) return null;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          文章预览
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {result.wordCount} 字 · 耗时 {formatTime(result.durationMs)}
          </span>
          {result.wpsDocumentId && (
            <span className="text-xs text-green-600">✓ 已发送到 WPS</span>
          )}
          <button
            onClick={onExport}
            disabled={isExporting || !result.wpsDocumentId}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isExporting ? '保存中…' : '保存到 WPS'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans leading-relaxed">
          {result.fullText}
        </pre>
      </div>
    </div>
  );
};

// ============ 子组件：反馈区 ============

interface FeedbackPanelProps {
  onFeedback: (feedback: ArticleFeedback) => void;
  isGenerating: boolean;
  hasResult: boolean;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  onFeedback,
  isGenerating,
  hasResult,
}) => {
  const [type, setType] = useState<ArticleFeedback['type']>('satisfied');
  const [comment, setComment] = useState('');
  const [styleHint, setStyleHint] = useState('');
  const [rating, setRating] = useState(4);

  const handleSubmit = useCallback(() => {
    const feedback: ArticleFeedback = { type };
    if (comment) feedback.comment = comment;
    if (type === 'adjust_style' && styleHint) feedback.styleHint = styleHint;
    if (type === 'satisfied') feedback.rating = rating;
    onFeedback(feedback);
    setComment('');
    setStyleHint('');
  }, [type, comment, styleHint, rating, onFeedback]);

  if (!hasResult) return null;

  return (
    <div className="space-y-2 p-3 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        反馈与迭代
      </h3>
      <div className="flex flex-wrap gap-1">
        {FEEDBACK_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setType(opt.value)}
            className={`text-xs px-2 py-1 rounded ${
              type === opt.value
                ? 'bg-blue-500 text-white'
                : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {type === 'satisfied' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">评分：</span>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r} 星
              </option>
            ))}
          </select>
        </div>
      )}

      {type === 'adjust_style' && (
        <input
          type="text"
          value={styleHint}
          onChange={(e) => setStyleHint(e.target.value)}
          placeholder="例如：更正式一些 / 配色更暖 / 多用短句"
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
        />
      )}

      {(type === 'adjust_content' || type === 'adjust_structure' || type === 'regenerate') && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="说明要调整的内容（可选）"
          rows={2}
          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 resize-y"
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={isGenerating}
        className="w-full px-3 py-1.5 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
      >
        {isGenerating ? '处理中…' : '提交反馈'}
      </button>
    </div>
  );
};

// ============ 主组件 ============

/**
 * 文章写作面板
 */
export const ArticleWriterPanel: React.FC = () => {
  // 写作请求
  const [request, setRequest] = useState<ArticleWritingRequest>({
    topic: '',
    type: ArticleType.TECHNICAL,
    openInWPS: true,
  });

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ArticleGenerationProgress | null>(null);
  const [result, setResult] = useState<ArticleWritingResult | null>(null);
  const [outline, setOutline] = useState<ArticleOutline | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 模板推荐
  const { recommendByScenario, getTemplate } = useTemplateStore();

  // 推荐模板列表（按当前请求动态计算）
  const recommendations = useMemo(() => {
    if (!request.topic.trim()) return [];
    // 简单按类型映射分类后取 top3
    const typeToCategory: Record<ArticleTypeValue, DocumentTemplate['category']> = {
      academic: 'academic',
      technical: 'technical',
      business: 'business',
      essay: 'creative',
      news: 'document',
      tutorial: 'document',
      review: 'document',
      custom: 'custom',
    };
    const recs = recommendByScenario(
      {
        category: typeToCategory[request.type],
        type: 'word',
      },
      3
    );
    return recs.map((r) => r.template);
  }, [request.topic, request.type, recommendByScenario]);

  // 进度回调
  const onProgress = useCallback((p: ArticleGenerationProgress) => {
    setProgress(p);
  }, []);

  // 生成文章
  const handleGenerate = useCallback(async () => {
    if (!request.topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    setProgress(null);
    setResult(null);
    try {
      const res = await articleWriter.write(request, onProgress);
      setResult(res);
      setOutline(res.outline);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [request, onProgress]);

  // 预览大纲
  const handlePreviewOutline = useCallback(() => {
    if (!request.topic.trim()) return;
    try {
      const preview = articleWriter.previewOutline(request);
      setOutline(preview);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [request]);

  // 用编辑后的大纲生成
  const handleConfirmOutline = useCallback(async () => {
    if (!outline) return;
    setIsGenerating(true);
    setError(null);
    setProgress(null);
    try {
      const edit: ArticleOutlineEdit = {
        sections: outline.sections,
        title: outline.title,
        subtitle: outline.subtitle,
      };
      const res = await articleWriter.writeWithOutline(request, edit, onProgress);
      setResult(res);
      setOutline(res.outline);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  }, [outline, request, onProgress]);

  // 保存到 WPS（重新调用 WPS 创建）
  const handleExport = useCallback(async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      // 重新调用 WPS 创建一份新文档
      const newRequest: ArticleWritingRequest = {
        ...request,
        openInWPS: true,
      };
      const res = await articleWriter.writeWithOutline(
        newRequest,
        {
          sections: result.outline.sections,
          title: result.outline.title,
          subtitle: result.outline.subtitle,
        },
        undefined
      );
      setResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsExporting(false);
    }
  }, [result, request]);

  // 反馈处理
  const handleFeedback = useCallback(
    async (feedback: ArticleFeedback) => {
      if (!result) return;
      setIsGenerating(true);
      setError(null);
      setProgress(null);
      try {
        const edit: ArticleOutlineEdit | undefined = outline
          ? {
              sections: outline.sections,
              title: outline.title,
              subtitle: outline.subtitle,
            }
          : undefined;
        const res = await articleWriter.rewrite(
          request,
          result,
          feedback,
          edit,
          onProgress
        );
        setResult(res);
        setOutline(res.outline);

        // 满意时记录模板评分
        if (feedback.type === 'satisfied' && feedback.rating && result.appliedTemplate) {
          useTemplateStore.getState().setRating(result.appliedTemplate.id, feedback.rating);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [result, request, outline, onProgress]
  );

  // 选中模板
  const handleSelectTemplate = useCallback(
    (id: string | undefined) => {
      setRequest((r) => ({ ...r, templateId: id }));
    },
    []
  );

  // 当前选中的模板对象（用于显示）
  const selectedTemplate = request.templateId ? getTemplate(request.templateId) : null;

  // 风格预览特征（无结果时显示选中模板的风格）
  const styleFeatures = useMemo(() => {
    if (selectedTemplate) {
      const feats: string[] = [];
      if (selectedTemplate.styleFeatures.toneStyle) {
        feats.push(`语气：${selectedTemplate.styleFeatures.toneStyle}`);
      }
      if (selectedTemplate.styleFeatures.structurePattern) {
        feats.push(`结构：${selectedTemplate.styleFeatures.structurePattern}`);
      }
      if (selectedTemplate.styleFeatures.visualDensity) {
        feats.push(`密度：${selectedTemplate.styleFeatures.visualDensity}`);
      }
      if (selectedTemplate.styleFeatures.fontFamily?.length) {
        feats.push(`字体：${selectedTemplate.styleFeatures.fontFamily.join('、')}`);
      }
      return feats.length > 0 ? feats : null;
    }
    return null;
  }, [selectedTemplate]);

  return (
    <div className="flex h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* 左侧：需求 + 模板 + 大纲 + 风格 */}
      <div className="w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
        <RequestForm
          request={request}
          onChange={setRequest}
          onGenerate={handleGenerate}
          onPreviewOutline={handlePreviewOutline}
          isGenerating={isGenerating}
        />

        <TemplateSelector
          selectedId={request.templateId}
          onSelect={handleSelectTemplate}
          recommendations={recommendations}
        />

        {outline && (
          <OutlineEditor
            outline={outline}
            onChange={setOutline}
            onConfirm={handleConfirmOutline}
            isGenerating={isGenerating}
          />
        )}

        <StylePreview result={result} styleFeatures={styleFeatures} />

        <ProgressView progress={progress} />

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* 右侧：内容预览 + 反馈 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ContentPreview
          result={result}
          onExport={handleExport}
          isExporting={isExporting}
        />
        <FeedbackPanel
          onFeedback={handleFeedback}
          isGenerating={isGenerating}
          hasResult={!!result}
        />
      </div>
    </div>
  );
};

export default ArticleWriterPanel;