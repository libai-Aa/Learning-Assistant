/**
 * 批注面板组件
 * 用于显示和创建批注
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useAnnotationStore } from '../../stores/annotation-store';
import {
  Annotation,
  AnnotationTypeValue,
  HighlightColorValue,
} from '../../types/annotation';
import { HighlightColorPicker } from './annotation-layer';

/**
 * AnnotationPanel 组件属性
 */
export interface AnnotationPanelProps {
  /** 面板是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 关联的知识条目ID */
  knowledgeId?: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * 批注面板组件
 */
export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  open,
  onClose,
  knowledgeId,
  className = '',
}) => {
  // 状态
  const [content, setContent] = useState('');
  const [type, setType] = useState<AnnotationTypeValue>('note');
  const [highlightColor, setHighlightColor] = useState<HighlightColorValue>('yellow');
  const [tags, setTags] = useState('');

  // 从标注 store 获取数据与操作
  const { getAnnotationsByKnowledge, addAnnotation, deleteAnnotation } = useAnnotationStore();

  // 当前知识条目下的标注列表
  const annotations: Annotation[] = useMemo(() => {
    if (!knowledgeId) return [];
    return getAnnotationsByKnowledge(knowledgeId);
  }, [knowledgeId, getAnnotationsByKnowledge]);

  // 处理创建批注
  const handleCreate = useCallback(() => {
    if (!content.trim() || !knowledgeId) return;

    addAnnotation({
      knowledgeId,
      type,
      content: content.trim(),
      highlightColor: type === 'highlight' ? highlightColor : undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    // 重置表单
    setContent('');
    setTags('');
    onClose();
  }, [content, type, highlightColor, tags, knowledgeId, addAnnotation, onClose]);

  // 处理删除标注
  const handleDelete = useCallback(
    (id: string) => {
      deleteAnnotation(id);
    },
    [deleteAnnotation]
  );

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-50 flex ${className}`}>
      {/* 遮罩层 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 面板 */}
      <div className="relative ml-auto w-96 h-full bg-white dark:bg-gray-900 shadow-xl flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            批注面板
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
        <div className="flex-1 overflow-y-auto p-4">
          {/* 批注输入 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              批注内容
            </label>
            <textarea
              className="w-full h-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="输入批注内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {/* 类型选择 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              标注类型
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('note')}
                className={`flex-1 py-2 px-3 text-sm rounded-md border ${
                  type === 'note'
                    ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                📝 批注
              </button>
              <button
                onClick={() => setType('highlight')}
                className={`flex-1 py-2 px-3 text-sm rounded-md border ${
                  type === 'highlight'
                    ? 'bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                🖍️ 高亮
              </button>
            </div>
          </div>

          {/* 高亮颜色选择 */}
          {type === 'highlight' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                高亮颜色
              </label>
              <HighlightColorPicker value={highlightColor} onChange={setHighlightColor} />
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
              placeholder="例如: 重要, 待复习"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {/* 已有标注列表 */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              已有标注 ({annotations.length})
            </label>
            <div className="space-y-2">
              {annotations.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                  暂无标注
                </p>
              ) : (
                annotations.map((annotation) => (
                  <div
                    key={annotation.id}
                    className="flex items-start gap-2 p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                  >
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {annotation.type === 'highlight' ? '🖍️' : '📝'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 break-words">
                        {annotation.content}
                      </p>
                      {annotation.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {annotation.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(annotation.id)}
                      className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-1"
                      aria-label="删除标注"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
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
            创建
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnotationPanel;