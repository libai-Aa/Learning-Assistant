/**
 * 高亮标注层组件
 * 用于在文本内容上渲染高亮标注
 */

import React, { useMemo } from 'react';
import { Annotation, HighlightColorValue, HighlightRenderData } from '../../types/annotation';
import { useAnnotationStore } from '../../stores/annotation-store';

/**
 * AnnotationLayer 组件属性
 */
export interface AnnotationLayerProps {
  /** 文本内容 */
  content: string;
  /** 标注列表 */
  annotations: Annotation[];
  /** 高亮点击回调 */
  onHighlightClick?: (annotation: Annotation) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 高亮颜色映射
 */
const highlightColorMap: Record<HighlightColorValue, { bg: string; text: string; border: string }> = {
  yellow: { bg: 'bg-yellow-200/50', text: 'text-yellow-900', border: 'border-yellow-400' },
  green: { bg: 'bg-green-200/50', text: 'text-green-900', border: 'border-green-400' },
  blue: { bg: 'bg-blue-200/50', text: 'text-blue-900', border: 'border-blue-400' },
  pink: { bg: 'bg-pink-200/50', text: 'text-pink-900', border: 'border-pink-400' },
  purple: { bg: 'bg-purple-200/50', text: 'text-purple-900', border: 'border-purple-400' },
};

/**
 * 高亮标注层组件
 */
export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  content,
  annotations,
  onHighlightClick,
  className = '',
}) => {
  // 处理高亮数据
  const highlights = useMemo(() => {
    // 只处理高亮类型的标注
    const highlightAnnotations = annotations.filter((a) => a.type === 'highlight');

    if (highlightAnnotations.length === 0 || !content) {
      return [];
    }

    // 构建高亮渲染数据
    const renderData: HighlightRenderData[] = highlightAnnotations
      .filter((a) => a.position)
      .map((a) => ({
        id: a.id,
        color: a.highlightColor || 'yellow',
        textFragment: a.position?.textFragment || '',
        startOffset: a.position?.startOffset || 0,
        endOffset: a.position?.endOffset || 0,
        className: `highlight-${a.id}`,
      }));

    return renderData;
  }, [annotations, content]);

  // 渲染带高亮的内容
  const renderContent = useMemo(() => {
    if (!content || highlights.length === 0) {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    // 按位置排序
    const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);

    // 构建带高亮的内容片段
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, index) => {
      // 添加高亮前的文本
      if (highlight.startOffset > lastIndex) {
        const beforeText = content.slice(lastIndex, highlight.startOffset);
        parts.push(<span key={`text-${index}`}>{beforeText}</span>);
      }

      // 添加高亮文本
      const highlightText = content.slice(highlight.startOffset, highlight.endOffset);
      const colorClass = highlightColorMap[highlight.color];
      parts.push(
        <mark
          key={`highlight-${highlight.id}`}
          className={`px-0.5 rounded cursor-pointer transition-all hover:ring-2 hover:ring-gray-400 ${colorClass.bg} ${colorClass.text}`}
          onClick={() => {
            const annotation = annotations.find((a) => a.id === highlight.id);
            if (annotation) {
              onHighlightClick?.(annotation);
            }
          }}
          title={highlight.textFragment}
        >
          {highlightText}
        </mark>
      );

      lastIndex = highlight.endOffset;
    });

    // 添加剩余文本
    if (lastIndex < content.length) {
      parts.push(<span key="text-last">{content.slice(lastIndex)}</span>);
    }

    return <p className="whitespace-pre-wrap leading-relaxed">{parts}</p>;
  }, [content, highlights, annotations, onHighlightClick]);

  return (
    <div className={`annotation-layer ${className}`}>
      {renderContent}
    </div>
  );
};

/**
 * 高亮标记组件（用于单独显示高亮片段）
 */
export interface HighlightMarkProps {
  /** 标注数据 */
  annotation: Annotation;
  /** 点击回调 */
  onClick?: () => void;
  /** 自定义类名 */
  className?: string;
}

export const HighlightMark: React.FC<HighlightMarkProps> = ({
  annotation,
  onClick,
  className = '',
}) => {
  if (annotation.type !== 'highlight') {
    return null;
  }

  const color = annotation.highlightColor || 'yellow';
  const colorClass = highlightColorMap[color];

  return (
    <mark
      className={`px-0.5 rounded ${colorClass.bg} ${colorClass.text} ${className}`}
      onClick={onClick}
    >
      {annotation.content}
    </mark>
  );
};

/**
 * 高亮颜色选择器组件
 */
export interface HighlightColorPickerProps {
  /** 当前选中的颜色 */
  value: HighlightColorValue;
  /** 颜色变更回调 */
  onChange: (color: HighlightColorValue) => void;
  /** 自定义类名 */
  className?: string;
}

export const HighlightColorPicker: React.FC<HighlightColorPickerProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const colors: HighlightColorValue[] = ['yellow', 'green', 'blue', 'pink', 'purple'];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {colors.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
            value === color
              ? 'border-gray-800 dark:border-gray-200 scale-110'
              : 'border-transparent'
          }`}
          style={{ backgroundColor: getHighlightColorHex(color) }}
          title={getHighlightColorName(color)}
          aria-label={`选择${getHighlightColorName(color)}`}
        />
      ))}
    </div>
  );
};

/**
 * 获取高亮颜色十六进制值
 */
function getHighlightColorHex(color: HighlightColorValue): string {
  const hexColors: Record<HighlightColorValue, string> = {
    yellow: '#fef08a',
    green: '#bbf7d0',
    blue: '#bfdbfe',
    pink: '#fbcfe8',
    purple: '#e9d5ff',
  };
  return hexColors[color];
}

/**
 * 获取高亮颜色名称
 */
function getHighlightColorName(color: HighlightColorValue): string {
  const names: Record<HighlightColorValue, string> = {
    yellow: '黄色',
    green: '绿色',
    blue: '蓝色',
    pink: '粉色',
    purple: '紫色',
  };
  return names[color];
}

/**
 * 从标注 store 获取指定知识条目的高亮渲染数据
 * 便于外部组件直接消费 store 数据
 */
export function useAnnotationLayerData(knowledgeId?: string): {
  annotations: Annotation[];
  highlights: Annotation[];
  notes: Annotation[];
} {
  const { getAnnotationsByKnowledge, getHighlights, getNotes } = useAnnotationStore();

  return useMemo(() => {
    if (!knowledgeId) {
      return { annotations: [], highlights: [], notes: [] };
    }
    return {
      annotations: getAnnotationsByKnowledge(knowledgeId),
      highlights: getHighlights(knowledgeId),
      notes: getNotes(knowledgeId),
    };
  }, [knowledgeId, getAnnotationsByKnowledge, getHighlights, getNotes]);
}

/**
 * 连接标注 store 的 AnnotationLayer 包装组件
 * 自动从 store 获取指定知识条目的标注并渲染高亮层
 */
interface ConnectedAnnotationLayerProps {
  /** 文本内容 */
  content: string;
  /** 关联的知识条目 ID */
  knowledgeId?: string;
  /** 高亮点击回调 */
  onHighlightClick?: (annotation: Annotation) => void;
  /** 自定义类名 */
  className?: string;
}

export const ConnectedAnnotationLayer: React.FC<ConnectedAnnotationLayerProps> = ({
  content,
  knowledgeId,
  onHighlightClick,
  className,
}) => {
  const { annotations } = useAnnotationLayerData(knowledgeId);

  return (
    <AnnotationLayer
      content={content}
      annotations={annotations}
      onHighlightClick={onHighlightClick}
      className={className}
    />
  );
};

export default AnnotationLayer;