/**
 * 想法捕获组件
 * 用于记录和捕获新想法
 */

import React, { useState, useCallback, useEffect } from 'react';
import { priorityEngine } from '../../lib/read/idea-priority';
import {
  CreateIdeaRequest,
  IdeaAnalysis,
  PracticeStatusValue,
  ImportanceLevelValue,
  UrgencyLevelValue,
} from '../../types/idea';

/**
 * IdeaCapture 组件属性
 */
export interface IdeaCaptureProps {
  /** 面板是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 关联的知识条目ID */
  knowledgeId?: string;
  /** 关联的标注ID */
  annotationId?: string;
  /** 提交回调 */
  onSubmit: (request: CreateIdeaRequest) => string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 想法捕获组件
 */
export const IdeaCapture: React.FC<IdeaCaptureProps> = ({
  open,
  onClose,
  knowledgeId,
  annotationId,
  onSubmit,
  className = '',
}) => {
  // 状态
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [analysis, setAnalysis] = useState<IdeaAnalysis | null>(null);
  const [, setIsAnalyzing] = useState(false);

  // 分析结果自动更新
  useEffect(() => {
    if (content.trim().length < 10) {
      setAnalysis(null);
      return;
    }

    const timer = setTimeout(() => {
      setIsAnalyzing(true);
      try {
        const result = priorityEngine.analyzeIdea(content);
        setAnalysis(result);
      } catch (error) {
        console.error('Failed to analyze idea:', error);
      } finally {
        setIsAnalyzing(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [content]);

  // 处理创建想法
  const handleCreate = useCallback(() => {
    if (!content.trim()) return;

    const request: CreateIdeaRequest = {
      content: content.trim(),
      source: knowledgeId ? 'reading' : 'manual',
      knowledgeId,
      annotationId,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    onSubmit(request);

    // 重置表单
    setContent('');
    setTags('');
    setAnalysis(null);
    onClose();
  }, [content, knowledgeId, annotationId, tags, onSubmit, onClose]);

  // 处理快捷键
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}>
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 面板 */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl rounded-xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            💡 记录新想法
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4" onKeyDown={handleKeyDown}>
          {/* 想法输入 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              想法内容
            </label>
            <textarea
              className="w-full h-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="记录你的想法..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              autoFocus
            />
          </div>

          {/* 智能分析 */}
          {analysis && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                🤖 智能分析结果
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">实践状态:</span>
                  <StatusBadge status={analysis.practiceStatus} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">重要性:</span>
                  <ImportanceBadge importance={analysis.estimatedPriority.importance} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">紧急度:</span>
                  <UrgencyBadge urgency={analysis.estimatedPriority.urgency} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">置信度:</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {Math.round(analysis.confidence * 100)}%
                  </span>
                </div>
              </div>
              {analysis.domain && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">领域:</span>
                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded dark:bg-blue-900/30 dark:text-blue-300">
                    {analysis.domain}
                  </span>
                </div>
              )}
              {analysis.suggestedTags.length > 0 && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-400">建议标签:</span>
                  {analysis.suggestedTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded dark:bg-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 标签输入 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              标签 (逗号分隔)
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如: 重要, 待跟进"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {/* 提示信息 */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            💡 提示: 系统会自动分析想法内容并推荐优先级和实践状态
          </div>
        </div>

        {/* 底部操作 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={!content.trim()}
            className="flex-1 py-2 px-4 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            保存想法
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * 状态徽章组件
 */
const StatusBadge: React.FC<{ status: PracticeStatusValue }> = ({ status }) => {
  const config: Record<PracticeStatusValue, { label: string; className: string }> = {
    new: { label: '新想法', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
    pending: { label: '待跟进', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
    active: { label: '进行中', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    done: { label: '已完成', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    falsified: { label: '已证伪', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  };

  const { label, className } = config[status];

  return <span className={`px-2 py-0.5 text-xs rounded-full ${className}`}>{label}</span>;
};

/**
 * 重要性徽章组件
 */
const ImportanceBadge: React.FC<{ importance: ImportanceLevelValue }> = ({ importance }) => {
  const config: Record<ImportanceLevelValue, { label: string; className: string }> = {
    high: { label: '高', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    medium: { label: '中', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
    low: { label: '低', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  };

  const { label, className } = config[importance];

  return <span className={`px-2 py-0.5 text-xs rounded-full ${className}`}>{label}</span>;
};

/**
 * 紧急度徽章组件
 */
const UrgencyBadge: React.FC<{ urgency: UrgencyLevelValue }> = ({ urgency }) => {
  const config: Record<UrgencyLevelValue, { label: string; className: string }> = {
    urgent: { label: '紧急', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    normal: { label: '一般', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    not_urgent: { label: '不紧急', className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  };

  const { label, className } = config[urgency];

  return <span className={`px-2 py-0.5 text-xs rounded-full ${className}`}>{label}</span>;
};

export default IdeaCapture;