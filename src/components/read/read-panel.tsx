/**
 * Read区域主组件
 * 实现碎片化知识接收、阅读、标注、想法记录功能
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useIdeaStore } from '../../stores/idea-store';
import { AnnotationLayer } from './annotation-layer';
import { AnnotationPanel } from './annotation-panel';
import { IdeaCapture } from './idea-capture';
import {
  FileEntry,
  KnowledgeType,
  ImportanceLevelValue,
} from '../../types/knowledge';
import {
  Annotation,
  HighlightColorValue,
} from '../../types/annotation';
import {
  Idea,
  CreateIdeaRequest,
} from '../../types/idea';
import { priorityEngine } from '../../lib/read/idea-priority';

/**
 * ReadPanel 组件属性
 */
export interface ReadPanelProps {
  /** 当前选中的知识条目 */
  selectedKnowledge?: FileEntry;
  /** 知识列表 */
  knowledgeList: FileEntry[];
  /** 选中知识变更回调 */
  onKnowledgeSelect?: (knowledge: FileEntry) => void;
  /** 知识更新回调 */
  onKnowledgeUpdate?: (knowledge: FileEntry) => void;
  /** 网页链接输入回调 */
  onWebLinkSubmit?: (url: string) => Promise<FileEntry>;
  /** 自定义类名 */
  className?: string;
}

/**
 * ReadPanel 组件状态
 */
interface ReadPanelState {
  /** 当前阅读进度 */
  readProgress: number;
  /** 是否显示标注面板 */
  showAnnotationPanel: boolean;
  /** 是否显示想法面板 */
  showIdeaPanel: boolean;
  /** 选中的文本 */
  selectedText: string;
  /** 选中文本的位置 */
  selectedRange: Range | null;
  /** 当前高亮颜色 */
  currentHighlightColor: HighlightColorValue;
  /** 搜索关键词 */
  searchKeyword: string;
  /** 过滤标签 */
  filterTag: string | null;
}

/**
 * ReadPanel 组件
 */
export const ReadPanel: React.FC<ReadPanelProps> = ({
  selectedKnowledge,
  knowledgeList,
  onKnowledgeSelect,
  onKnowledgeUpdate: _onKnowledgeUpdate,
  onWebLinkSubmit,
  className = '',
}) => {
  // 状态
  const [state, setState] = useState<ReadPanelState>({
    readProgress: selectedKnowledge?.readProgress || 0,
    showAnnotationPanel: false,
    showIdeaPanel: false,
    selectedText: '',
    selectedRange: null,
    currentHighlightColor: 'yellow',
    searchKeyword: '',
    filterTag: null,
  });

  // 引用
  const contentRef = useRef<HTMLDivElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [, setIdeas] = useState<Idea[]>([]);

  // 从 store 获取想法
  const { createIdea, getIdeasByKnowledge } = useIdeaStore();

  // 加载标注和想法
  useEffect(() => {
    if (selectedKnowledge) {
      // 加载标注 (实际项目中应从 store 加载)
      const loadedAnnotations: Annotation[] = [];
      setAnnotations(loadedAnnotations);

      // 加载想法
      const loadedIdeas = getIdeasByKnowledge(selectedKnowledge.id);
      setIdeas(loadedIdeas);
    }
  }, [selectedKnowledge, getIdeasByKnowledge]);

  // 处理文本选择
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setState((prev) => ({
        ...prev,
        selectedText: '',
        selectedRange: null,
      }));
      return;
    }

    const text = selection.toString();
    if (text.trim().length > 0) {
      const range = selection.getRangeAt(0);
      setState((prev) => ({
        ...prev,
        selectedText: text,
        selectedRange: range,
      }));
    }
  }, []);

  // 处理高亮
  const handleHighlight = useCallback(() => {
    if (!state.selectedRange || !selectedKnowledge) return;

    // 创建标注
    const annotation: Annotation = {
      id: `annotation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      knowledgeId: selectedKnowledge.id,
      type: 'highlight',
      content: state.selectedText,
      highlightColor: state.currentHighlightColor,
      position: {
        startOffset: 0, // 实际应计算偏移量
        endOffset: state.selectedText.length,
        startContainerXPath: '',
        endContainerXPath: '',
        textFragment: state.selectedText,
      },
      createdBy: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
    };

    setAnnotations((prev) => [...prev, annotation]);
    setState((prev) => ({
      ...prev,
      selectedText: '',
      selectedRange: null,
    }));
  }, [state.selectedRange, state.selectedText, state.currentHighlightColor, selectedKnowledge]);

  // 处理批注
  const handleNote = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showAnnotationPanel: true,
    }));
  }, []);

  // 处理想法记录
  const handleIdeaCapture = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showIdeaPanel: true,
    }));
  }, []);

  // 处理网页链接提交
  const handleWebLinkSubmit = useCallback(
    async (url: string) => {
      if (onWebLinkSubmit) {
        const knowledge = await onWebLinkSubmit(url);
        if (knowledge && onKnowledgeSelect) {
          onKnowledgeSelect(knowledge);
        }
      }
    },
    [onWebLinkSubmit, onKnowledgeSelect]
  );

  // 处理想法创建
  const handleCreateIdea = useCallback(
    (request: CreateIdeaRequest) => {
      const ideaId = createIdea(request);
      // 刷新想法列表
      if (selectedKnowledge) {
        const updatedIdeas = getIdeasByKnowledge(selectedKnowledge.id);
        setIdeas(updatedIdeas);
      }
      return ideaId;
    },
    [createIdea, getIdeasByKnowledge, selectedKnowledge]
  );

  // 处理阅读进度更新
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const progress = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 100;

    setState((prev) => ({
      ...prev,
      readProgress: Math.min(Math.max(progress, 0), 100),
    }));
  }, []);

  // 过滤知识列表
  const filteredKnowledgeList = knowledgeList.filter((k) => {
    if (state.searchKeyword) {
      const matchSearch =
        k.name.toLowerCase().includes(state.searchKeyword.toLowerCase()) ||
        k.metadata.title?.toLowerCase().includes(state.searchKeyword.toLowerCase());
      if (!matchSearch) return false;
    }
    if (state.filterTag) {
      if (!(k.tags ?? []).includes(state.filterTag)) return false;
    }
    return true;
  });

  // 按时间排序
  const sortedKnowledgeList = [...filteredKnowledgeList].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className={`read-panel flex h-full ${className}`}>
      {/* 左侧：知识列表 */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* 搜索框 */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="搜索知识..."
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={state.searchKeyword}
            onChange={(e) => setState((prev) => ({ ...prev, searchKeyword: e.target.value }))}
          />
        </div>

        {/* 链接输入 */}
        {onWebLinkSubmit && (
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <WebLinkInput onSubmit={handleWebLinkSubmit} />
          </div>
        )}

        {/* 知识列表 */}
        <div className="flex-1 overflow-y-auto">
          {sortedKnowledgeList.map((knowledge) => (
            <KnowledgeListItem
              key={knowledge.id}
              knowledge={knowledge}
              isActive={selectedKnowledge?.id === knowledge.id}
              onClick={() => onKnowledgeSelect?.(knowledge)}
            />
          ))}
        </div>
      </div>

      {/* 右侧：阅读区域 */}
      <div className="flex-1 flex flex-col">
        {/* 阅读工具栏 */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
          {/* 高亮工具 */}
          {state.selectedText && (
            <>
              <button
                onClick={handleHighlight}
                className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded-md hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200"
              >
                高亮
              </button>
              <button
                onClick={handleNote}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
              >
                批注
              </button>
              <button
                onClick={handleIdeaCapture}
                className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-md hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
              >
                想法
              </button>
              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
            </>
          )}

          {/* 高亮颜色选择 */}
          <div className="flex items-center gap-1">
            {(['yellow', 'green', 'blue', 'pink', 'purple'] as HighlightColorValue[]).map(
              (color) => (
                <button
                  key={color}
                  onClick={() =>
                    setState((prev) => ({ ...prev, currentHighlightColor: color }))
                  }
                  className={`w-6 h-6 rounded-full border-2 ${
                    state.currentHighlightColor === color
                      ? 'border-gray-800 dark:border-gray-200'
                      : 'border-transparent'
                  }`}
                  style={{ backgroundColor: getHighlightColorStyle(color) }}
                  title={`选择${getHighlightColorName(color)}`}
                />
              )
            )}
          </div>

          {/* 阅读进度 */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              进度: {Math.round(state.readProgress)}%
            </span>
            <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${state.readProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-6"
          onMouseUp={handleTextSelection}
          onScroll={handleScroll}
        >
          {selectedKnowledge ? (
            <div className="max-w-3xl mx-auto">
              {/* 标题 */}
              <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                {selectedKnowledge.metadata.title || selectedKnowledge.name}
              </h1>

              {/* 元数据 */}
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
                {selectedKnowledge.metadata.author && (
                  <span>作者: {selectedKnowledge.metadata.author}</span>
                )}
                <span>
                  创建于:{' '}
                  {new Date(selectedKnowledge.createdAt).toLocaleDateString('zh-CN')}
                </span>
                <span>
                  类型: {getKnowledgeTypeName(selectedKnowledge.type)}
                </span>
              </div>

              {/* 标签 */}
              {(selectedKnowledge.tags ?? []).length > 0 && (
                <div className="flex items-center gap-2 mb-6">
                  {(selectedKnowledge.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 内容 */}
              <div className="prose dark:prose-invert max-w-none">
                <AnnotationLayer
                  content={selectedKnowledge.content?.text || ''}
                  annotations={annotations}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-4">📖</div>
                <p>选择或添加知识开始阅读</p>
              </div>
            </div>
          )}
        </div>

      {/* 标注面板 */}
        <AnnotationPanel
          open={state.showAnnotationPanel}
          onClose={() => setState((prev) => ({ ...prev, showAnnotationPanel: false }))}
          knowledgeId={selectedKnowledge?.id}
        />

        {/* 想法面板 */}
        <IdeaCapture
          open={state.showIdeaPanel}
          onClose={() => setState((prev) => ({ ...prev, showIdeaPanel: false }))}
          knowledgeId={selectedKnowledge?.id}
          onSubmit={handleCreateIdea}
        />
      </div>
    </div>
  );
};

/**
 * 获取高亮颜色样式
 */
function getHighlightColorStyle(color: HighlightColorValue): string {
  const colors: Record<HighlightColorValue, string> = {
    yellow: '#fef08a',
    green: '#bbf7d0',
    blue: '#bfdbfe',
    pink: '#fbcfe8',
    purple: '#e9d5ff',
  };
  return colors[color];
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
 * 获取知识类型名称
 */
function getKnowledgeTypeName(type: KnowledgeType): string {
  const names: Record<KnowledgeType, string> = {
    document: '文档',
    webpage: '网页',
    image: '图片',
    audio: '音频',
    video: '视频',
    idea: '想法',
    question: '问题',
    annotation: '标注',
    markdown: 'Markdown',
  };
  return names[type] || type;
}

/**
 * 网页链接输入组件
 */
interface WebLinkInputProps {
  onSubmit: (url: string) => Promise<void>;
}

const WebLinkInput: React.FC<WebLinkInputProps> = ({ onSubmit }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    try {
      await onSubmit(url.trim());
      setUrl('');
    } catch (error) {
      console.error('Failed to fetch web content:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="url"
        placeholder="输入网页链接..."
        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '抓取中...' : '添加'}
      </button>
    </form>
  );
};

/**
 * 知识列表项组件
 */
interface KnowledgeListItemProps {
  knowledge: FileEntry;
  isActive: boolean;
  onClick: () => void;
}

const KnowledgeListItem: React.FC<KnowledgeListItemProps> = ({
  knowledge,
  isActive,
  onClick,
}) => {
  const priority = priorityEngine.calculatePriority(
    knowledge.metadata.title || knowledge.name,
    undefined,
    knowledge.createdAt
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
        isActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {/* 类型图标 */}
        <span className="text-lg">
          {knowledge.type === 'webpage' ? '🌐' : knowledge.type === 'document' ? '📄' : '📁'}
        </span>
        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {knowledge.metadata.title || knowledge.name}
          </p>
          {/* 元信息 */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{new Date(knowledge.createdAt).toLocaleDateString('zh-CN')}</span>
            <span>•</span>
            <span
              className={`${
                priority.importance === 'high'
                  ? 'text-red-500'
                  : priority.importance === 'medium'
                  ? 'text-yellow-500'
                  : 'text-gray-400'
              }`}
            >
              {getImportanceLabel(priority.importance)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

/**
 * 获取重要性标签
 */
function getImportanceLabel(importance: ImportanceLevelValue): string {
  const labels: Record<ImportanceLevelValue, string> = {
    high: '高',
    medium: '中',
    low: '低',
  };
  return labels[importance];
}

export default ReadPanel;