/**
 * PPT 制作面板 UI
 *
 * @description "更懂你的WPS"之 PPT 制作辅助主界面。提供：
 *   - 需求输入区（主题、用途、受众、页数、额外要求、知识库查询）
 *   - 模板选择/推荐区（自动推荐 + 手动指定）
 *   - 风格预览区（配色、字体、布局可视化）
 *   - 生成进度显示（阶段化进度条 + 阶段说明）
 *   - 大纲预览/编辑区（每页标题、要点、备注可编辑）
 *   - 结果预览/导出（WPS 文档句柄、文件路径、导出 PDF）
 *   - 反馈/重新生成（满意、调整风格、调整内容、更换模板）
 *
 *   工作流（与生成器流水线对应）：
 *     输入需求 → 生成中 → 大纲预览 → 满意?完成:反馈调整
 *
 *   设计原则：
 *   1. 用户满意导向 —— UI 强调"AI 帮我做"，而非"配置参数"
 *   2. 可视化进度   —— 每个阶段都有清晰反馈，避免黑盒等待
 *   3. 可迭代       —— 反馈通道始终可见，鼓励用户调优
 *   4. WPS 原生     —— 完成后明确提示"已在 WPS 中打开，可继续编辑"
 *
 * @module src/components/wps/ppt-maker-panel
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTemplateStore } from '../../stores/template-store';
import { useWikiStore } from '../../stores/wiki-store';
import {
  PPTGenerationStage,
  PPTGenerationStageNames,
  PPTPurpose,
  PPTPurposeNames,
  type PPTGenerationRequest,
  type PPTGenerationResult,
  type PPTGenerationProgress,
  type PPTOutline,
  type PPTSlideOutline,
  type PPTFeedback,
  type PPTPurposeValue,
  type PPTSlideType,
} from '../../types/ppt-generation';
import {
  getPPTGenerator,
  createWikiKnowledgeRetriever,
  describeWPSError,
} from '../../lib/wps/ppt-generator';
import { TemplateCategoryNames } from '../../types/template';

// ============ 常量 ============

/** 用途下拉选项 */
const PURPOSE_OPTIONS: PPTPurposeValue[] = [
  PPTPurpose.REPORT,
  PPTPurpose.TEACHING,
  PPTPurpose.SPEECH,
  PPTPurpose.BUSINESS,
  PPTPurpose.ACADEMIC,
  PPTPurpose.TRAINING,
  PPTPurpose.PRODUCT,
  PPTPurpose.CUSTOM,
];

/** 幻灯片类型图标 */
const SLIDE_TYPE_ICONS: Record<PPTSlideType, string> = {
  cover: '🎯',
  section: '📑',
  content: '📝',
  image: '🖼️',
  chart: '📊',
  conclusion: '✅',
};

/** 幻灯片类型中文标签 */
const SLIDE_TYPE_LABELS: Record<PPTSlideType, string> = {
  cover: '封面',
  section: '章节',
  content: '内容',
  image: '图示',
  chart: '图表',
  conclusion: '结论',
};

/** 面板工作阶段 */
type PanelStage = 'input' | 'generating' | 'preview' | 'done';

// ============ 工具函数 ============

/** 格式化时间 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 渲染星级评分 */
function renderStars(rating: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

// ============ 子组件：需求输入表单 ============

interface RequestFormProps {
  request: PPTGenerationRequest;
  onChange: (request: PPTGenerationRequest) => void;
  onGenerate: () => void;
  disabled: boolean;
}

const RequestForm: React.FC<RequestFormProps> = ({
  request,
  onChange,
  onGenerate,
  disabled,
}) => {
  const update = useCallback(
    (patch: Partial<PPTGenerationRequest>) => {
      onChange({ ...request, ...patch });
    },
    [request, onChange]
  );

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          📌 PPT 主题 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={request.topic}
          onChange={(e) => update({ topic: e.target.value })}
          disabled={disabled}
          placeholder="例如：2024 Q3 产品研发季度汇报"
          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            用途
          </label>
          <select
            value={request.purpose}
            onChange={(e) => update({ purpose: e.target.value as PPTPurposeValue })}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
          >
            {PURPOSE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PPTPurposeNames[p]}
              </option>
            ))}
          </select>
          {request.purpose === PPTPurpose.CUSTOM && (
            <input
              type="text"
              value={request.additionalRequirements || ''}
              onChange={(e) => update({ additionalRequirements: e.target.value })}
              placeholder="请描述自定义用途内容..."
              className="w-full mt-1 px-3 py-2 rounded-md border border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20 text-gray-900 dark:text-gray-100 outline-none"
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            期望页数
          </label>
          <input
            type="number"
            min={3}
            max={50}
            value={request.slideCount ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              update({ slideCount: v ? parseInt(v, 10) : undefined });
            }}
            disabled={disabled}
            placeholder="留空按用途默认"
            className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          受众
        </label>
        <input
          type="text"
          value={request.audience ?? ''}
          onChange={(e) => update({ audience: e.target.value || undefined })}
          disabled={disabled}
          placeholder="例如：团队内部 / 客户决策层 / 学术评审"
          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          知识库查询关键词
        </label>
        <input
          type="text"
          value={request.knowledgeBaseQuery ?? ''}
          onChange={(e) => update({ knowledgeBaseQuery: e.target.value || undefined })}
          disabled={disabled}
          placeholder="留空则用主题作为查询"
          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          额外要求
        </label>
        <textarea
          value={request.additionalRequirements ?? ''}
          onChange={(e) => update({ additionalRequirements: e.target.value || undefined })}
          disabled={disabled}
          rows={2}
          placeholder="例如：突出数据增长、配色偏暖、需要包含竞品对比"
          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none resize-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="open-in-wps"
          checked={request.openInWPS ?? true}
          onChange={(e) => update({ openInWPS: e.target.checked })}
          disabled={disabled}
          className="w-4 h-4"
        />
        <label htmlFor="open-in-wps" className="text-sm text-gray-700 dark:text-gray-300">
          生成完成后在 WPS 中打开
        </label>
      </div>

      <button
        onClick={onGenerate}
        disabled={disabled || !request.topic.trim()}
        className="w-full py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium transition-colors"
      >
        🚀 开始生成 PPT
      </button>
    </div>
  );
};

// ============ 子组件：模板推荐区 ============

interface TemplateRecommendProps {
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  disabled: boolean;
}

const TemplateRecommend: React.FC<TemplateRecommendProps> = ({
  selectedId,
  onSelect,
  disabled,
}) => {
  const templates = useTemplateStore((s) => s.templates);
  const pptTemplates = useMemo(
    () => templates.filter((t) => t.type === 'ppt'),
    [templates]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          📚 指定模板（可选）
        </h4>
        {selectedId && (
          <button
            onClick={() => onSelect(undefined)}
            disabled={disabled}
            className="text-xs text-blue-600 hover:underline"
          >
            清除选择
          </button>
        )}
      </div>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value || undefined)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
      >
        <option value="">自动推荐（不指定）</option>
        {pptTemplates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {TemplateCategoryNames[t.category]} · ★{t.userRating ?? '-'} · 用{t.usageCount}
          </option>
        ))}
      </select>
      {pptTemplates.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          暂无 PPT 模板，将使用默认主题生成。可先在模板库添加满意模板以培养 AI 品位。
        </p>
      )}
    </div>
  );
};

// ============ 子组件：导出 PPTX ============

interface ExportPptxButtonProps {
  outline: PPTOutline;
}

/**
 * 导出 PPTX 按钮：把大纲导出为真正的 .pptx 文件
 * 点击后调用 PPTGenerator.exportToPPTX，导出成功后显示路径并提供"打开PPTX"按钮
 */
const ExportPptxButton: React.FC<ExportPptxButtonProps> = ({ outline }) => {
  const [exporting, setExporting] = useState(false);
  const [pptxPath, setPptxPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    setPptxPath(null);
    try {
      const gen = getPPTGenerator();
      const path = await gen.exportToPPTX(outline);
      setPptxPath(path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      console.error('导出PPTX失败', e);
    } finally {
      setExporting(false);
    }
  }, [outline]);

  const handleOpen = useCallback(async () => {
    if (!pptxPath) return;
    try {
      await invoke('open_file', { filePath: pptxPath });
    } catch (e) {
      alert(`打开PPTX失败: ${e}`);
    }
  }, [pptxPath]);

  return (
    <div className="space-y-1">
      <button
        onClick={handleExport}
        disabled={exporting}
        className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
      >
        {exporting ? '⏳ 导出中…' : '📥 导出PPTX'}
      </button>
      {pptxPath && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-green-600 dark:text-green-400">✅ 已导出</span>
          <button
            onClick={handleOpen}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
            title={pptxPath}
          >
            📂 打开PPTX
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 break-all">{pptxPath}</span>
        </div>
      )}
      {error && (
        <div className="text-xs text-red-600 break-all">❌ 导出失败：{error}</div>
      )}
    </div>
  );
};

// ============ 子组件：风格预览 ============

interface StylePreviewProps {
  result: PPTGenerationResult | null;
}

const StylePreview: React.FC<StylePreviewProps> = ({ result }) => {
  if (!result) return null;
  const { outline, appliedStyle, appliedTemplate } = result;
  const { theme } = outline;

  return (
    <div className="space-y-3 p-3 rounded-md bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        🎨 应用风格
      </h4>

      {/* 配色 */}
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">配色</div>
        <div className="flex gap-1.5">
          {theme.colorScheme.primary.map((c, i) => (
            <div
              key={`p-${i}`}
              className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: c }}
              title={`主色 ${i + 1}: ${c}`}
            />
          ))}
          {theme.colorScheme.accent.map((c, i) => (
            <div
              key={`a-${i}`}
              className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: c }}
              title={`强调色 ${i + 1}: ${c}`}
            />
          ))}
          {theme.colorScheme.background.map((c, i) => (
            <div
              key={`b-${i}`}
              className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: c }}
              title={`背景 ${i + 1}: ${c}`}
            />
          ))}
        </div>
      </div>

      {/* 字体 */}
      <div className="text-xs text-gray-600 dark:text-gray-400">
        <span className="text-gray-500 dark:text-gray-500">字体：</span>
        {theme.fontFamily.primaryFont}
        {theme.fontFamily.secondaryFont ? ` / ${theme.fontFamily.secondaryFont}` : ''}
      </div>

      {/* 布局 */}
      <div className="text-xs text-gray-600 dark:text-gray-400">
        <span className="text-gray-500 dark:text-gray-500">布局：</span>
        {theme.layoutStyle} · {theme.visualDensity ?? 'medium'}
      </div>

      {/* 来源说明 */}
      <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
        {appliedTemplate ? (
          <span>📌 基于模板「{appliedTemplate.name}」</span>
        ) : (
          <span>📌 使用默认主题</span>
        )}
        {appliedStyle && <span className="ml-2">· ✨ 已应用学习到的风格画像</span>}
      </div>
    </div>
  );
};

// ============ 子组件：生成进度 ============

interface ProgressViewProps {
  progress: PPTGenerationProgress | null;
}

const ProgressView: React.FC<ProgressViewProps> = ({ progress }) => {
  if (!progress) return null;
  const isError = progress.stage === PPTGenerationStage.FAILED;
  const isDone = progress.stage === PPTGenerationStage.COMPLETED;

  return (
    <div className="space-y-3 p-4 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${isError ? 'text-red-600' : 'text-blue-700 dark:text-blue-300'}`}>
          {isError ? '❌ ' : isDone ? '✅ ' : '⏳ '}
          {PPTGenerationStageNames[progress.stage]}
        </span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {progress.percent}%
        </span>
      </div>
      <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400">{progress.message}</p>
      {progress.error && (
        <p className="text-xs text-red-600 font-mono break-all">{progress.error}</p>
      )}
    </div>
  );
};

// ============ 子组件：大纲预览/编辑 ============

interface OutlineEditorProps {
  outline: PPTOutline;
  onChange: (outline: PPTOutline) => void;
  disabled: boolean;
}

const OutlineEditor: React.FC<OutlineEditorProps> = ({
  outline,
  onChange,
  disabled,
}) => {
  const updateSlide = useCallback(
    (index: number, patch: Partial<PPTSlideOutline>) => {
      const slides = outline.slides.map((s) =>
        s.index === index ? { ...s, ...patch } : s
      );
      onChange({ ...outline, slides });
    },
    [outline, onChange]
  );

  const updateTitle = useCallback(
    (title: string) => onChange({ ...outline, title }),
    [outline, onChange]
  );

  const updateSubtitle = useCallback(
    (subtitle: string) => onChange({ ...outline, subtitle }),
    [outline, onChange]
  );

  return (
    <div className="space-y-3">
      {/* 主标题编辑 */}
      <div className="p-3 rounded-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
        <input
          type="text"
          value={outline.title}
          onChange={(e) => updateTitle(e.target.value)}
          disabled={disabled}
          className="w-full text-lg font-semibold bg-transparent border-none outline-none text-gray-900 dark:text-gray-100"
        />
        <input
          type="text"
          value={outline.subtitle ?? ''}
          onChange={(e) => updateSubtitle(e.target.value)}
          disabled={disabled}
          placeholder="副标题"
          className="w-full text-sm bg-transparent border-none outline-none text-gray-600 dark:text-gray-400 mt-1"
        />
      </div>

      {/* 幻灯片列表 */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {outline.slides.map((slide) => (
          <SlideCard
            key={slide.index}
            slide={slide}
            disabled={disabled}
            onChange={(patch) => updateSlide(slide.index, patch)}
          />
        ))}
      </div>
    </div>
  );
};

// ============ 子组件：单页幻灯片编辑卡片 ============

interface SlideCardProps {
  slide: PPTSlideOutline;
  disabled: boolean;
  onChange: (patch: Partial<PPTSlideOutline>) => void;
}

const SlideCard: React.FC<SlideCardProps> = ({ slide, disabled, onChange }) => {
  const [expanded, setExpanded] = useState(false);

  const updateKeyPoint = useCallback(
    (i: number, value: string) => {
      const keyPoints = [...slide.keyPoints];
      keyPoints[i] = value;
      onChange({ keyPoints });
    },
    [slide.keyPoints, onChange]
  );

  const addKeyPoint = useCallback(() => {
    onChange({ keyPoints: [...slide.keyPoints, '新要点'] });
  }, [slide.keyPoints, onChange]);

  const removeKeyPoint = useCallback(
    (i: number) => {
      onChange({ keyPoints: slide.keyPoints.filter((_, idx) => idx !== i) });
    },
    [slide.keyPoints, onChange]
  );

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      {/* 头部 */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg">{SLIDE_TYPE_ICONS[slide.type]}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-6">
          #{slide.index}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          {SLIDE_TYPE_LABELS[slide.type]}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {slide.title}
        </span>
        <span className="text-xs text-gray-400">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-gray-800">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              标题
            </label>
            <input
              type="text"
              value={slide.title}
              onChange={(e) => onChange({ title: e.target.value })}
              disabled={disabled}
              className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 dark:text-gray-400">关键要点</label>
              {!disabled && (
                <button
                  onClick={addKeyPoint}
                  className="text-xs text-blue-600 hover:underline"
                >
                  + 添加
                </button>
              )}
            </div>
            <div className="space-y-1">
              {slide.keyPoints.map((kp, i) => (
                <div key={`${kp}__${i}`} className="flex items-start gap-1">
                  <span className="text-xs text-gray-400 mt-1">•</span>
                  <input
                    type="text"
                    value={kp}
                    onChange={(e) => updateKeyPoint(i, e.target.value)}
                    disabled={disabled}
                    className="flex-1 px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none"
                  />
                  {!disabled && (
                    <button
                      onClick={() => removeKeyPoint(i)}
                      className="text-xs text-red-500 hover:underline px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {slide.keyPoints.length === 0 && (
                <p className="text-xs text-gray-400 italic">暂无要点</p>
              )}
            </div>
          </div>

          {slide.suggestedVisual && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-gray-400">建议视觉：</span>
              {slide.suggestedVisual}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              演讲备注
            </label>
            <textarea
              value={slide.notes ?? ''}
              onChange={(e) => onChange({ notes: e.target.value })}
              disabled={disabled}
              rows={2}
              className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none resize-none"
            />
          </div>

          {slide.knowledgeRefs && slide.knowledgeRefs.length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-gray-400">知识来源：</span>
              {slide.knowledgeRefs.length} 处素材
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============ 子组件：反馈区 ============

interface FeedbackBarProps {
  onFeedback: (feedback: PPTFeedback) => void;
  disabled: boolean;
}

const FeedbackBar: React.FC<FeedbackBarProps> = ({ onFeedback, disabled }) => {
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(0);

  const send = useCallback(
    (type: PPTFeedback['type']) => {
      onFeedback({
        type,
        comment: comment || undefined,
        rating: rating || undefined,
      });
      setComment('');
      setRating(0);
    },
    [comment, rating, onFeedback]
  );

  return (
    <div className="space-y-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        💬 反馈与调整
      </h4>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        disabled={disabled}
        rows={2}
        placeholder="告诉 AI 哪里需要改进，例如：第二页数据要更详细、整体配色偏冷一些…"
        className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none resize-none"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">评分：</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            disabled={disabled}
            className={`text-lg ${n <= rating ? 'text-yellow-500' : 'text-gray-300 dark:text-gray-600'}`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => send('satisfied')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white"
        >
          ✓ 满意，确认完成
        </button>
        <button
          onClick={() => send('regenerate')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white"
        >
          🔄 完全重新生成
        </button>
        <button
          onClick={() => send('adjust_style')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white"
        >
          🎨 调整风格
        </button>
        <button
          onClick={() => send('adjust_content')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white"
        >
          📝 调整内容
        </button>
        <button
          onClick={() => send('adjust_structure')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-400 text-white"
        >
          🏗️ 调整结构
        </button>
        <button
          onClick={() => send('change_template')}
          disabled={disabled}
          className="py-1.5 text-sm rounded bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white"
        >
          📚 更换模板
        </button>
      </div>
    </div>
  );
};

// ============ 子组件：结果信息 ============

interface ResultSummaryProps {
  result: PPTGenerationResult;
}

const ResultSummary: React.FC<ResultSummaryProps> = ({ result }) => {
  const handleOpenPPT = useCallback(async () => {
    if (!result.generatedPath) return;
    try {
      await invoke('open_file', { filePath: result.generatedPath });
    } catch (e) {
      console.error('打开PPT失败', e);
      alert(`打开PPT失败: ${e}`);
    }
  }, [result.generatedPath]);

  return (
    <div className="space-y-2 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-green-700 dark:text-green-300">
          ✨ 生成完成
        </h4>
        <div className="flex items-center gap-2">
          {result.generatedPath && (
            <button
              onClick={handleOpenPPT}
              className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
              title={result.generatedPath}
            >
              📂 打开查看 PPT
            </button>
          )}
          <ExportPptxButton outline={result.outline} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div>
          <span className="text-gray-500">耗时：</span>
          {(result.durationMs / 1000).toFixed(2)}s
        </div>
        <div>
          <span className="text-gray-500">页数：</span>
          {result.outline.slides.length} 页
        </div>
        <div>
          <span className="text-gray-500">知识素材：</span>
          {result.knowledgeUsed.length} 处
        </div>
        <div>
          <span className="text-gray-500">生成时间：</span>
          {formatTime(result.createdAt)}
        </div>
      </div>
      {result.generatedPath && (
        <div className="text-xs text-gray-600 dark:text-gray-400 break-all">
          📁 文件路径：{result.generatedPath}
        </div>
      )}
      {result.appliedTemplate && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          📌 基于模板：{result.appliedTemplate.name} · 评分{' '}
          {renderStars(result.appliedTemplate.userRating ?? 0)}
        </div>
      )}
    </div>
  );
};

// ============ 主组件 ============

/**
 * PPT 制作面板
 */
export const PPTMakerPanel: React.FC = () => {
  // ===== 状态 =====
  const [stage, setStage] = useState<PanelStage>('input');
  const [request, setRequest] = useState<PPTGenerationRequest>({
    topic: '',
    purpose: PPTPurpose.REPORT,
    openInWPS: true,
  });
  const [progress, setProgress] = useState<PPTGenerationProgress | null>(null);
  const [result, setResult] = useState<PPTGenerationResult | null>(null);
  const [outline, setOutline] = useState<PPTOutline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  // 编辑历史 PPT 的请求 ID，用于取消过时的并发加载（竞态保护）
  const editReqIdRef = useRef(0);
  // 组件存活标志，卸载后阻止 generator 进度回调继续 setState
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ===== 历史 PPT 列表 =====
  interface PptHistoryItem {
    name: string;
    path: string;
    modified: number;
    size: number;
  }
  const [pptHistory, setPptHistory] = useState<PptHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 加载历史 PPT 列表
  const loadPptHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const files = await invoke<PptHistoryItem[]>('list_files', { subdir: 'ppt' });
      // 只显示 .html 文件
      setPptHistory(files.filter((f) => f.name.endsWith('.html')));
    } catch (e) {
      console.error('加载PPT历史失败', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 删除历史 PPT
  const handleDeletePpt = useCallback(async (item: PptHistoryItem) => {
    if (!confirm(`确定删除 "${item.name}" 吗？`)) return;
    try {
      // 删除 HTML 文件
      await invoke('delete_data_file', { filepath: item.path });
      // 删除对应的 JSON 文件
      const jsonPath = item.path.replace(/\.html$/, '.json');
      try {
        await invoke('delete_data_file', { filepath: jsonPath });
      } catch {
        // JSON 文件可能不存在，忽略
      }
      // 刷新列表
      await loadPptHistory();
    } catch (e) {
      alert(`删除失败: ${e}`);
    }
  }, [loadPptHistory]);

  // 组件挂载时加载历史；stage 从非 done/preview 变到 done/preview 时刷新
  // 合并原本的两个 useEffect，避免挂载与 stage 初次变化时重复加载
  const prevStageRef = useRef<PanelStage | null>(null);
  useEffect(() => {
    const prev = prevStageRef.current;
    prevStageRef.current = stage;
    // 首次挂载（prev === null）：加载一次
    if (prev === null) {
      loadPptHistory();
      return;
    }
    // 之后仅在 stage 从非 done/preview 切换到 done/preview 时刷新
    const wasTerminal = prev === 'done' || prev === 'preview';
    const isTerminal = stage === 'done' || stage === 'preview';
    if (!wasTerminal && isTerminal) {
      loadPptHistory();
    }
  }, [stage, loadPptHistory]);

  // ===== Store =====
  const searchEntries = useWikiStore((s) => s.searchEntries);

  // ===== 生成器（带 wiki 知识检索器） =====
  const generator = useMemo(() => {
    return getPPTGenerator({
      knowledgeRetriever: createWikiKnowledgeRetriever(searchEntries),
    });
  }, [searchEntries]);

  // ===== 大纲同步 =====
  useEffect(() => {
    if (result) setOutline(result.outline);
  }, [result]);

  // ===== 生成 =====
  const handleGenerate = useCallback(async () => {
    setStage('generating');
    setError(null);
    setProgress(null);
    setResult(null);
    setOutline(null);

    try {
      const res = await generator.generate(request, (p) => {
        // 组件卸载后不再 setState，避免进度回调更新已卸载组件
        if (aliveRef.current) setProgress(p);
      });
      if (!aliveRef.current) return;
      setResult(res);
      setOutline(res.outline);
      setStage('preview');
    } catch (err) {
      if (!aliveRef.current) return;
      setError(describeWPSError(err));
      setStage('input');
    }
  }, [generator, request]);

  // ===== 大纲编辑后同步到 result =====
  const handleOutlineChange = useCallback(
    (newOutline: PPTOutline) => {
      setOutline(newOutline);
      if (result) {
        setResult({ ...result, outline: newOutline });
      }
    },
    [result]
  );

  // ===== 应用编辑并重新在 WPS 创建 =====
  const handleApplyEdit = useCallback(async () => {
    if (!result || !outline) return;
    setStage('generating');
    setProgress({
      stage: PPTGenerationStage.CREATING_PPT,
      percent: 90,
      message: '正在同步编辑到 WPS…',
    });
    try {
      const updated = await generator.applyEditAndCreateInWPS(
        result,
        { slides: outline.slides, title: outline.title, subtitle: outline.subtitle },
        request.outputPath
      );
      setResult(updated);
      setStage('done');
      setProgress({
        stage: PPTGenerationStage.COMPLETED,
        percent: 100,
        message: '编辑已同步到 WPS',
      });
    } catch (err) {
      setError(describeWPSError(err));
      setStage('preview');
    }
  }, [generator, result, outline, request.outputPath]);

  // ===== 反馈 =====
  const handleFeedback = useCallback(
    async (feedback: PPTFeedback) => {
      if (!result) return;
      setFeedbackBusy(true);
      setError(null);

      try {
        if (feedback.type === 'satisfied') {
          setStage('done');
          setResult(await generator.regenerate(result, feedback));
        } else if (feedback.type === 'change_template') {
          // 进入输入阶段，让用户选择新模板
          setStage('input');
          setRequest((r) => ({ ...r, templateId: undefined }));
        } else {
          setStage('generating');
          setProgress(null);
          const newResult = await generator.regenerate(result, feedback, (p) => {
            if (aliveRef.current) setProgress(p);
          });
          if (!aliveRef.current) return;
          setResult(newResult);
          setOutline(newResult.outline);
          setStage('preview');
        }
      } catch (err) {
        setError(describeWPSError(err));
        setStage('preview');
      } finally {
        setFeedbackBusy(false);
      }
    },
    [generator, result]
  );

  // ===== 重置 =====
  const handleReset = useCallback(() => {
    setStage('input');
    setResult(null);
    setOutline(null);
    setProgress(null);
    setError(null);
  }, []);

  // ===== 渲染 =====
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* 头部 */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            🎯 PPT 制作辅助
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            基于您的模板 + 偏好 + 知识库，AI 帮您做出更懂您的 PPT
          </p>
        </div>
        {stage !== 'input' && (
          <button
            onClick={handleReset}
            className="text-sm px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ← 重新开始
          </button>
        )}
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 错误提示 */}
        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            ❌ {error}
          </div>
        )}

        {/* 阶段 1：输入 */}
        {stage === 'input' && (
          <>
            <RequestForm
              request={request}
              onChange={setRequest}
              onGenerate={handleGenerate}
              disabled={false}
            />
            <TemplateRecommend
              selectedId={request.templateId}
              onSelect={(id) => setRequest((r) => ({ ...r, templateId: id }))}
              disabled={false}
            />

            {/* 历史 PPT 列表 */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  📚 历史 PPT（{pptHistory.length} 份）
                </h3>
                <button
                  onClick={loadPptHistory}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  🔄 刷新
                </button>
              </div>
              {historyLoading ? (
                <div className="p-4 text-center text-sm text-gray-400">加载中…</div>
              ) : pptHistory.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  <div className="text-3xl mb-2">📂</div>
                  还没有生成过 PPT，填写上方信息后点击"开始生成 PPT"
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pptHistory.map((item) => (
                    <div
                      key={item.path}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <span className="text-xl flex-shrink-0">📊</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {item.name.replace(/\.html$/, '').replace(/_\d+$/, '')}
                        </div>
                        <div className="text-xs text-gray-400">
                          {new Date(item.modified).toLocaleString('zh-CN')} · {(item.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await invoke('open_file', { filePath: item.path });
                          } catch (e) {
                            alert(`打开失败: ${e}`);
                          }
                        }}
                        className="px-2.5 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 flex-shrink-0"
                        title="在浏览器中查看"
                      >
                        👁 查看
                      </button>
                      <button
                        onClick={async () => {
                          // 竞态保护：每次点击递增 reqId，await 后若不一致则放弃本次结果
                          const reqId = ++editReqIdRef.current;
                          try {
                            // 读取对应的 JSON 大纲文件

                            const jsonContent = await invoke<string>('read_json_file', {
                              filename: `ppt/${item.name.replace(/\.html$/, '.json')}`,
                            });
                            if (reqId !== editReqIdRef.current) return;
                            // JSON.parse 兜底校验：逐字段检查，避免脏数据导致运行时崩溃
                            const parsed = JSON.parse(jsonContent) as unknown;
                            if (!parsed || typeof parsed !== 'object') {
                              alert('大纲文件格式无效：不是合法对象');
                              return;
                            }
                            const obj = parsed as Record<string, unknown>;
                            if (!Array.isArray(obj.slides)) {
                              alert('大纲文件格式无效：slides 缺失或非数组');
                              return;
                            }
                            if (typeof obj.title !== 'string') {
                              obj.title = '';
                            }
                            const loadedOutline = obj as unknown as PPTOutline;
                            if (reqId !== editReqIdRef.current) return;
                            setOutline(loadedOutline);
                            setResult({
                              outline: loadedOutline,
                              generatedPath: item.path,
                              wpsDocumentId: undefined,
                              appliedStyle: null,
                              knowledgeUsed: [],
                              appliedTemplate: null,
                              durationMs: 0,
                              createdAt: new Date(item.modified).toISOString(),
                            });
                            setStage('preview');
                          } catch (e) {
                            if (reqId !== editReqIdRef.current) return;
                            alert(`编辑失败: ${e}`);
                          }
                        }}
                        className="px-2.5 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 flex-shrink-0"
                        title="编辑大纲"
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={() => handleDeletePpt(item)}
                        className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                        title="删除"
                      >
                        🗑 删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 阶段 2：生成中 */}
        {stage === 'generating' && (
          <>
            <ProgressView progress={progress} />
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
              AI 正在为您制作 PPT，请稍候…
            </div>
          </>
        )}

        {/* 阶段 3：预览/编辑 */}
        {stage === 'preview' && outline && (
          <>
            <ProgressView progress={progress} />
            <StylePreview result={result} />
            <div className="flex justify-end items-center gap-2">
              {result?.generatedPath && (
                <button
                  onClick={async () => {
                    try {
                      await invoke('open_file', { filePath: result.generatedPath! });
                    } catch (e) {
                      alert(`打开PPT失败: ${e}`);
                    }
                  }}
                  className="px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                  title={result.generatedPath}
                >
                  📂 打开查看 PPT
                </button>
              )}
              <ExportPptxButton outline={outline} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  📋 大纲预览与编辑
                </h3>
                <button
                  onClick={handleApplyEdit}
                  disabled={feedbackBusy}
                  className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
                >
                  同步编辑到 WPS
                </button>
              </div>
              <OutlineEditor
                outline={outline}
                onChange={handleOutlineChange}
                disabled={feedbackBusy}
              />
            </div>
            <FeedbackBar onFeedback={handleFeedback} disabled={feedbackBusy} />
          </>
        )}

        {/* 阶段 4：完成 */}
        {stage === 'done' && result && (
          <>
            <ResultSummary result={result} />
            <StylePreview result={result} />
            <ExportPptxButton outline={result.outline} />
            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
              🎉 PPT 已生成完成！点击上方"📂 打开查看 PPT"可在浏览器中查看效果。
              如需进一步调整，可点击下方"反馈与调整"。
            </div>
            <FeedbackBar onFeedback={handleFeedback} disabled={feedbackBusy} />
          </>
        )}
      </div>
    </div>
  );
};

export default PPTMakerPanel;