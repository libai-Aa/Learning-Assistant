/**
 * 来源视图组件
 * 扩展支持网页链接接收和显示
 */

import React, { useState, useCallback } from 'react';
import { FileEntry, SourceType, KnowledgeType } from '../../types/knowledge';

/**
 * SourcesView 组件属性
 */
export interface SourcesViewProps {
  /** 来源列表 */
  sources: FileEntry[];
  /** 选中来源回调 */
  onSourceSelect?: (source: FileEntry) => void;
  /** 网页链接提交回调 */
  onWebLinkSubmit?: (url: string) => Promise<FileEntry>;
  /** 文件上传回调 */
  onFileUpload?: (file: File) => Promise<FileEntry>;
  /** 自定义类名 */
  className?: string;
}

/**
 * 来源视图组件
 */
export const SourcesView: React.FC<SourcesViewProps> = ({
  sources,
  onSourceSelect,
  onWebLinkSubmit,
  onFileUpload,
  className = '',
}) => {
  // 状态
  const [activeTab, setActiveTab] = useState<'all' | 'web' | 'file' | 'chat' | 'research'>('all');
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 过滤来源
  const filteredSources = sources.filter((source) => {
    if (activeTab === 'all') return true;
    return source.sourceType === activeTab;
  });

  // 处理网页链接提交
  const handleUrlSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!urlInput.trim() || isFetchingUrl || !onWebLinkSubmit) return;

      setIsFetchingUrl(true);
      try {
        await onWebLinkSubmit(urlInput.trim());
        setUrlInput('');
      } catch (error) {
        console.error('Failed to fetch web content:', error);
      } finally {
        setIsFetchingUrl(false);
      }
    },
    [urlInput, isFetchingUrl, onWebLinkSubmit]
  );

  // 处理文件上传
  const handleFileDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      if (!onFileUpload || e.dataTransfer.files.length === 0) return;

      const file = e.dataTransfer.files[0];
      try {
        await onFileUpload(file);
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    },
    [onFileUpload]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!onFileUpload || !files || files.length === 0) return;

      const file = files[0];
      try {
        await onFileUpload(file);
        e.target.value = '';
      } catch (error) {
        console.error('Failed to upload file:', error);
      }
    },
    [onFileUpload]
  );

  return (
    <div className={`sources-view flex flex-col h-full ${className}`}>
      {/* 标签页 */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {[
          { key: 'all', label: '全部' },
          { key: 'web', label: '🌐 网页' },
          { key: 'file', label: '📄 文件' },
          { key: 'chat', label: '💬 对话' },
          { key: 'research', label: '🔬 研究' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 添加来源区域 */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 space-y-3">
        {/* 网页链接输入 */}
        {onWebLinkSubmit && (
          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <input
              type="url"
              placeholder="输入网页链接..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={isFetchingUrl || !urlInput.trim()}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isFetchingUrl ? '抓取中...' : '添加'}
            </button>
          </form>
        )}

        {/* 文件上传区域 */}
        {onFileUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`flex items-center justify-center p-4 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
              dragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <input
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.mp4,.webm"
            />
            <label
              htmlFor="file-upload"
              className="text-sm text-gray-500 dark:text-gray-400 cursor-pointer text-center"
            >
              <span className="text-lg">📁</span>
              <p className="mt-1">拖拽文件到此处或点击上传</p>
              <p className="text-xs mt-1">支持 PDF, DOCX, PPTX, XLSX, MD, 图片, 音视频</p>
            </label>
          </div>
        )}
      </div>

      {/* 来源列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredSources.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <div className="text-center p-4">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">暂无来源</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredSources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                onClick={() => onSourceSelect?.(source)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 来源项组件
 */
interface SourceItemProps {
  source: FileEntry;
  onClick?: () => void;
}

const SourceItem: React.FC<SourceItemProps> = ({ source, onClick }) => {
  // 获取类型图标
  const getTypeIcon = (type: KnowledgeType): string => {
    const icons: Record<KnowledgeType, string> = {
      document: '📄',
      webpage: '🌐',
      image: '🖼️',
      audio: '🎵',
      video: '🎬',
      idea: '💡',
      question: '❓',
      annotation: '📝',
      markdown: '📝',
    };
    return icons[type] || '📁';
  };

  // 获取来源图标
  const getSourceIcon = (sourceType: SourceType): string => {
    const icons: Record<SourceType, string> = {
      file: '📁',
      web: '🌐',
      chat: '💬',
      research: '🔬',
    };
    return icons[sourceType] || '📄';
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* 类型图标 */}
        <span className="text-xl">{getTypeIcon(source.type)}</span>

        <div className="flex-1 min-w-0">
          {/* 标题 */}
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {source.metadata.title || source.name}
          </p>

          {/* 元信息 */}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{getSourceIcon(source.sourceType)}</span>
            <span>
              {source.metadata.author && `${source.metadata.author} • `}
              {new Date(source.createdAt).toLocaleDateString('zh-CN')}
            </span>
            {source.metadata.pageCount && <span>• {source.metadata.pageCount}页</span>}
            {source.metadata.duration && (
              <span>• {Math.floor(source.metadata.duration / 60)}分</span>
            )}
          </div>

          {/* 标签 */}
          {(source.tags ?? []).length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {(source.tags ?? []).slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded dark:bg-gray-700 dark:text-gray-300"
                >
                  {tag}
                </span>
              ))}
              {(source.tags ?? []).length > 3 && (
                <span className="text-xs text-gray-400">+{(source.tags ?? []).length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

export default SourcesView;