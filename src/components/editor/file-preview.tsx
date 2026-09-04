/**
 * 文件预览组件
 * 扩展支持多格式文件预览
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { FileEntry, KnowledgeType } from '../../types/knowledge';

/**
 * FilePreview 组件属性
 */
export interface FilePreviewProps {
  /** 当前预览的文件 */
  file: FileEntry;
  /** 是否显示阅读模式 */
  showReadMode?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 文件预览组件
 */
export const FilePreview: React.FC<FilePreviewProps> = ({
  file,
  showReadMode: _showReadMode = true,
  className = '',
}) => {
  // 状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // 引用
  const containerRef = useRef<HTMLDivElement>(null);

  // 重置状态当文件变化
  useEffect(() => {
    setZoom(1);
    setCurrentPage(1);
    setError(null);
  }, [file.id]);

  // 处理缩放
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.1, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.1, 0.5));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, []);

  // 处理全屏
  const handleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 渲染内容
  const renderContent = () => {
    switch (file.type) {
      case 'webpage':
        return <WebpagePreview file={file} />;
      case 'document':
        return <DocumentPreview file={file} zoom={zoom} currentPage={currentPage} />;
      case 'image':
        return <ImagePreview file={file} zoom={zoom} />;
      case 'audio':
        return <AudioPreview file={file} />;
      case 'video':
        return <VideoPreview file={file} />;
      case 'markdown':

        return <MarkdownPreview file={file} />;
      default:
        return <DefaultPreview file={file} />;
    }
  };

  // 渲染分页控件
  const renderPagination = () => {
    if (file.type !== 'document' || !file.metadata.pageCount) return null;

    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage <= 1}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
          {currentPage} / {file.metadata.pageCount}
        </span>
        <button
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, file.metadata.pageCount || 1))}
          disabled={currentPage >= (file.metadata.pageCount || 1)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`file-preview flex flex-col h-full ${className}`}
    >
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
        {/* 左侧：文件名 */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-lg">{getTypeIcon(file.type)}</span>
          <span className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
            {file.metadata.title || file.name}
          </span>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-1">
          {/* 缩放控件 */}
          {(file.type === 'document' || file.type === 'image') && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="缩小"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="text-xs text-gray-600 dark:text-gray-300 min-w-[40px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                title="放大"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={handleZoomReset}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs text-gray-600 dark:text-gray-300"
                title="重置缩放"
              >
                100%
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
            </>
          )}

          {/* 分页控件 */}
          {renderPagination()}

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />

          {/* 全屏按钮 */}
          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="全屏"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-4">
              <div className="text-3xl mb-2">❌</div>
              <p className="text-red-500 mb-2">预览失败</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
          </div>
        ) : (
          <div
            className="h-full transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          >
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 获取类型图标
 */
function getTypeIcon(type: KnowledgeType): string {
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
}

/**
 * 网页预览组件
 */
const WebpagePreview: React.FC<{ file: FileEntry }> = ({ file }) => {
  const content = file.content?.text || '';

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-full">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        {file.metadata.title || file.name}
      </h1>

      {file.metadata.author && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          作者: {file.metadata.author}
        </p>
      )}

      {file.metadata.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {file.metadata.description}
        </p>
      )}

      <div className="prose dark:prose-invert max-w-none">
        {content.split('\n').map((paragraph, index) => (
          <p key={index} className="mb-4 text-gray-700 dark:text-gray-300">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
};

/**
 * 文档预览组件
 */
const DocumentPreview: React.FC<{ file: FileEntry; zoom: number; currentPage: number }> = ({
  file,

}) => {
  const content = file.content?.text || '';

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-full">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        {file.metadata.title || file.name}
      </h1>

      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {file.metadata.author && <span>作者: {file.metadata.author} • </span>}
        {file.metadata.pageCount && <span>{file.metadata.pageCount} 页</span>}
      </div>

      <div className="prose dark:prose-invert max-w-none">
        {content.split('\n').map((paragraph, index) => (
          <p key={index} className="mb-4 text-gray-700 dark:text-gray-300">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
};

/**
 * 图片预览组件
 */
const ImagePreview: React.FC<{ file: FileEntry; zoom: number }> = ({ file }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  // 获取图片内容（base64 或 URL）
  const imageUrl = file.content?.images?.[0] || file.path;

  return (
    <div className="flex items-center justify-center min-h-full p-4">
      <div className="relative">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}
        <img
          src={imageUrl}
          alt={file.metadata.title || file.name}
          className={`max-w-full h-auto shadow-lg rounded ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
        />
      </div>
    </div>
  );
};

/**
 * 音频预览组件
 */
const AudioPreview: React.FC<{ file: FileEntry }> = ({ file }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6">
      <div className="text-6xl mb-4">🎵</div>
      <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {file.metadata.title || file.name}
      </h2>

      {file.metadata.duration && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          时长: {Math.floor(file.metadata.duration / 60)}分{Math.round(file.metadata.duration % 60)}秒
        </p>
      )}

      <audio
        ref={audioRef}
        src={file.path}
        controls
        className="w-full max-w-md"
      >
        您的浏览器不支持音频播放
      </audio>

      {file.content?.transcription && (
        <div className="mt-6 w-full max-w-2xl">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            转录内容
          </h3>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg max-h-64 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
            {file.content.transcription}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 视频预览组件
 */
const VideoPreview: React.FC<{ file: FileEntry }> = ({ file }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6">
      <video
        ref={videoRef}
        src={file.path}
        controls
        className="w-full max-w-4xl rounded-lg shadow-lg"
      >
        您的浏览器不支持视频播放
      </video>

      {file.metadata.duration && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          时长: {Math.floor(file.metadata.duration / 60)}分{Math.round(file.metadata.duration % 60)}秒
        </p>
      )}
    </div>
  );
};

/**
 * Markdown 预览组件
 */
const MarkdownPreview: React.FC<{ file: FileEntry }> = ({ file }) => {
  const content = file.content?.text || '';

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-900 min-h-full prose dark:prose-invert max-w-none">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        {file.metadata.title || file.name}
      </h1>

      <div className="text-gray-700 dark:text-gray-300">
        {content.split('\n').map((line, index) => (
          <p key={index} className="mb-2">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
};

/**
 * 默认预览组件
 */
const DefaultPreview: React.FC<{ file: FileEntry }> = ({ file }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-6">
      <div className="text-6xl mb-4">📄</div>
      <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {file.metadata.title || file.name}
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        此格式暂不支持预览
      </p>
      <div className="mt-4 flex gap-2">
        <button className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm">
          下载文件
        </button>
      </div>
    </div>
  );
};

export default FilePreview;