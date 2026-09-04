/**
 * 模板库 UI 组件
 *
 * @description "更懂你的WPS"模板库主界面。提供：
 *   - 分类筛选侧边栏
 *   - 模板网格/列表视图（含缩略图预览）
 *   - 模板详情面板（评分、备注、风格特征、使用场景）
 *   - 添加模板对话框
 *   - 拖拽排序
 *   - 批量选择/删除
 *   - 全文搜索
 *
 * 设计原则：
 *   - 用户满意导向：UI 强调"我满意的模板"，而非"推荐模板市场"
 *   - 风格可视化：配色/字体/密度等特征以视觉化方式呈现
 *   - 持续积累：使用次数与评分显著展示，鼓励用户反馈
 *
 * @module src/components/wps/template-library
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { invoke } from '@tauri-apps/api/core';
import { useTemplateStore } from '../../stores/template-store';
import {
  DocumentTemplate,
  TemplateCategoryValue,
  DocumentTypeValue,
  TemplateCategory,
  TemplateCategoryNames,

  TemplateSortOptions,
} from '../../types/template';

// ============ 常量 ============

/** 分类列表（用于侧边栏） */
const CATEGORIES: TemplateCategoryValue[] = [
  TemplateCategory.ACADEMIC,
  TemplateCategory.BUSINESS,
  TemplateCategory.TECHNICAL,
  TemplateCategory.CREATIVE,
  TemplateCategory.REPORT,
  TemplateCategory.PRESENTATION,
  TemplateCategory.DOCUMENT,
  TemplateCategory.CUSTOM,
];

/** 文档类型图标 */
const TYPE_ICONS: Record<DocumentTypeValue, string> = {
  ppt: '📊',
  word: '📝',
  pdf: '📄',
  excel: '📈',
};

/** 排序选项标签 */
const SORT_LABELS: Array<{ value: TemplateSortOptions; label: string }> = [
  { value: { sortBy: 'createdAt', sortOrder: 'desc' }, label: '最新创建' },
  { value: { sortBy: 'updatedAt', sortOrder: 'desc' }, label: '最近更新' },
  { value: { sortBy: 'usageCount', sortOrder: 'desc' }, label: '使用最多' },
  { value: { sortBy: 'userRating', sortOrder: 'desc' }, label: '评分最高' },
  { value: { sortBy: 'name', sortOrder: 'asc' }, label: '名称 A-Z' },
];

// ============ 工具函数 ============

/** 格式化日期 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 渲染星级评分 */
function renderStars(rating?: number): string {
  if (rating === undefined) return '☆☆☆☆☆';
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

// ============ 子组件：分类侧边栏 ============

interface CategorySidebarProps {
  selectedCategory: TemplateCategoryValue | undefined;
  onSelect: (category: TemplateCategoryValue | undefined) => void;
  counts: Record<TemplateCategoryValue, number>;
  total: number;
}

const CategorySidebar: React.FC<CategorySidebarProps> = ({
  selectedCategory,
  onSelect,
  counts,
  total,
}) => {
  return (
    <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 p-3 overflow-y-auto">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        分类
      </h3>
      <button
        onClick={() => onSelect(undefined)}
        className={`w-full text-left px-2 py-1.5 rounded-md text-sm mb-1 ${
          selectedCategory === undefined
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        全部模板 ({total})
      </button>
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm mb-1 ${
            selectedCategory === cat
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {TemplateCategoryNames[cat]} ({counts[cat] || 0})
        </button>
      ))}
    </div>
  );
};

// ============ 子组件：模板卡片 ============

interface TemplateCardProps {
  template: DocumentTemplate;
  selected: boolean;
  inBatch: boolean;
  viewMode: 'grid' | 'list';
  /** 当前卡片在可见列表中的索引（用于拖拽排序定位） */
  index: number;
  onSelect: (id: string) => void;
  onToggleBatch: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropToIndex: (index: number) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  selected,
  inBatch,
  viewMode,
  index,
  onSelect,
  onToggleBatch,
  onDragStart,
  onDragEnd,
  onDropToIndex,
}) => {
  const isGrid = viewMode === 'grid';

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      onDragStart(template.id);
    },
    [template.id, onDragStart]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      // 传递当前卡片对应的索引，由父组件执行排序
      onDropToIndex(index);
    },
    [onDropToIndex, index]
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => onSelect(template.id)}
      onDoubleClick={async (e) => {
        e.stopPropagation();
        try {
          await invoke('open_file', { filePath: template.filePath });
        } catch (err) {
          console.error('打开文件失败', err);
          alert(`打开文件失败: ${err}`);
        }
      }}
      className={`group relative cursor-pointer rounded-lg border bg-white dark:bg-gray-900 transition-shadow hover:shadow-md ${
        selected
          ? 'border-blue-400 ring-2 ring-blue-300'
          : 'border-gray-200 dark:border-gray-700'
      } ${isGrid ? 'p-3' : 'p-3 flex items-center gap-3'} ${inBatch ? 'opacity-60' : ''}`}
      title="单击选中 · 双击用系统默认程序打开"
    >
      {/* 批量选择复选框 */}
      <input
        type="checkbox"
        checked={inBatch}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleBatch(template.id)}
        className="absolute top-2 left-2 w-4 h-4"
        aria-label="批量选择"
      />

      {/* 缩略图 */}
      <div
        className={`bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-center text-3xl ${
          isGrid ? 'w-full h-32 mb-2' : 'w-16 h-16 flex-shrink-0'
        }`}
      >
        {template.thumbnailPath ? (
          <img
            src={template.thumbnailPath}
            alt={template.name}
            className="w-full h-full object-cover rounded-md"
          />
        ) : (
          <span>{TYPE_ICONS[template.type]}</span>
        )}
      </div>

      {/* 信息区 */}
      <div className={isGrid ? '' : 'flex-1 min-w-0'}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {TemplateCategoryNames[template.category]}
          </span>
          <span className="text-xs text-gray-400">{TYPE_ICONS[template.type]}</span>
        </div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {template.name}
        </h4>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
          <span title="评分">{renderStars(template.userRating)}</span>
          <span title="使用次数">使用 {template.usageCount}</span>
        </div>
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {template.tags.slice(0, isGrid ? 3 : 5).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
              >
                {tag}
              </span>
            ))}
            {template.tags.length > (isGrid ? 3 : 5) && (
              <span className="text-xs text-gray-400">
                +{template.tags.length - (isGrid ? 3 : 5)}
              </span>
            )}
          </div>
        )}
        <div className="text-xs text-gray-400 mt-1">{formatDate(template.createdAt)}</div>
      </div>
    </div>
  );
};

// ============ 子组件：模板详情面板 ============

interface TemplateDetailPanelProps {
  template: DocumentTemplate;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUse: (id: string) => void;
}

const TemplateDetailPanel: React.FC<TemplateDetailPanelProps> = ({
  template,
  onClose,
  onDelete,
  onUse,
}) => {
  // 用 selector 分别获取所需 actions，避免整个 store 变化导致重渲染
  const setRating = useTemplateStore((s) => s.setRating);
  const setNotes = useTemplateStore((s) => s.setNotes);
  const recommend = useTemplateStore((s) => s.recommend);
  const [notesDraft, setNotesDraft] = useState(template.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);

  // 相似推荐
  const recommendations = useMemo(
    () => recommend(template.id, 3, 0.1),
    [recommend, template.id]
  );

  const handleSaveNotes = useCallback(() => {
    setNotes(template.id, notesDraft);
    setEditingNotes(false);
  }, [template.id, notesDraft, setNotes]);

  return (
    <div className="w-96 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          模板详情
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          aria-label="关闭详情"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 名称与类型 */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {template.name}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>{TYPE_ICONS[template.type]} {template.type}</span>
            <span>·</span>
            <span>{TemplateCategoryNames[template.category]}</span>
            <span>·</span>
            <span>{formatDate(template.createdAt)}</span>
          </div>
        </div>

        {/* 缩略图预览 */}
        {template.thumbnailPath && (
          <img
            src={template.thumbnailPath}
            alt={template.name}
            className="w-full rounded-md border border-gray-200 dark:border-gray-700"
          />
        )}

        {/* 评分 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            评分
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(template.id, star)}
                className={`text-xl ${
                  (template.userRating || 0) >= star
                    ? 'text-yellow-400'
                    : 'text-gray-300 dark:text-gray-600'
                }`}
                aria-label={`评 ${star} 星`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* 备注 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            备注
          </label>
          {editingNotes ? (
            <div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                className="w-full h-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="记录这个模板好在哪里、什么时候用..."
              />
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSaveNotes}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditingNotes(false)}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => {
                setNotesDraft(template.notes || '');
                setEditingNotes(true);
              }}
              className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded min-h-[3rem] border border-dashed border-gray-200 dark:border-gray-700"
            >
              {template.notes || '点击添加备注...'}
            </div>
          )}
        </div>

        {/* 标签 */}
        {template.tags.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              标签
            </label>
            <div className="flex flex-wrap gap-1">
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 使用场景 */}
        {template.useCases.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              适用场景
            </label>
            <div className="flex flex-wrap gap-1">
              {template.useCases.map((u) => (
                <span
                  key={u}
                  className="text-xs px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                >
                  {u}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 适合主题 */}
        {template.suitableFor.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              适合主题
            </label>
            <div className="flex flex-wrap gap-1">
              {template.suitableFor.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 风格特征 */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            风格特征
          </label>
          <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
            {template.styleFeatures.colorScheme &&
              template.styleFeatures.colorScheme.length > 0 && (
                <div className="flex items-center gap-2">
                  <span>配色：</span>
                  <div className="flex gap-1">
                    {template.styleFeatures.colorScheme.slice(0, 6).map((c) => (
                      <span
                        key={c}
                        className="w-4 h-4 rounded border border-gray-200"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}
            {template.styleFeatures.fontFamily &&
              template.styleFeatures.fontFamily.length > 0 && (
                <div>字体：{template.styleFeatures.fontFamily.join('、')}</div>
              )}
            {template.styleFeatures.layoutStyle && (
              <div>布局：{template.styleFeatures.layoutStyle}</div>
            )}
            {template.styleFeatures.toneStyle && (
              <div>语气：{template.styleFeatures.toneStyle}</div>
            )}
            {template.styleFeatures.structurePattern && (
              <div>结构：{template.styleFeatures.structurePattern}</div>
            )}
            {template.styleFeatures.visualDensity && (
              <div>密度：{template.styleFeatures.visualDensity}</div>
            )}
          </div>
        </div>

        {/* 使用统计 */}
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <div>使用次数：{template.usageCount}</div>
          <div>来源：{template.source}</div>
          {template.originalPath && <div>原路径：{template.originalPath}</div>}
        </div>

        {/* 相似推荐 */}
        {recommendations.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              相似模板
            </label>
            <div className="space-y-1">
              {recommendations.map((rec) => (
                <div
                  key={rec.template.id}
                  className="text-xs p-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                >
                  <div className="font-medium text-gray-800 dark:text-gray-200">
                    {rec.template.name}
                  </div>
                  <div className="text-gray-500 mt-0.5">
                    相似度 {(rec.score * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        <button
          onClick={async () => {
            try {
              await invoke('open_file', { filePath: template.filePath });
            } catch (e) {
              console.error('打开文件失败', e);
              alert(`打开文件失败: ${e}`);
            }
          }}
          className="flex-1 px-3 py-1.5 text-sm bg-green-500 text-white rounded hover:bg-green-600"
          title={template.filePath}
        >
          📂 打开文件
        </button>
        <button
          onClick={() => onUse(template.id)}
          className="flex-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          使用此模板
        </button>
        <button
          onClick={() => onDelete(template.id)}
          className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          删除
        </button>
      </div>
    </div>
  );
};

// ============ 子组件：添加模板对话框 ============

interface AddTemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (request: {
    name: string;
    type: DocumentTypeValue;
    category: TemplateCategoryValue;
    filePath: string;
    tags: string[];
    useCases: string[];
    suitableFor: string[];
    notes?: string;
  }) => void;
}

const AddTemplateDialog: React.FC<AddTemplateDialogProps> = ({
  open,
  onClose,
  onAdd,
}) => {
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [analyzed, setAnalyzed] = useState<{
    name: string;
    type: DocumentTypeValue;
    category: TemplateCategoryValue;
    tags: string[];
  } | null>(null);
  const [notes, setNotes] = useState('');

  // 自动分析文件：根据文件名/扩展名推断类型、分类、标签
  const analyzeFile = useCallback((filePath: string) => {
    const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '未命名模板';
    const ext = filePath.split('.').pop()?.toLowerCase() || '';

    // 根据扩展名判断类型
    let type: DocumentTypeValue = 'word';
    if (ext === 'pdf') type = 'pdf';
    else if (ext === 'ppt' || ext === 'pptx') type = 'ppt';
    else if (ext === 'xls' || ext === 'xlsx') type = 'excel';
    else if (ext === 'doc' || ext === 'docx') type = 'word';

    // 根据文件名关键词推断分类
    const lowerName = fileName.toLowerCase();
    let category: TemplateCategoryValue = TemplateCategory.CUSTOM;
    if (/汇报|报告|总结|季度|年度|月度/.test(fileName)) category = TemplateCategory.REPORT;
    else if (/学术|论文|研究|paper|thesis/.test(lowerName)) category = TemplateCategory.ACADEMIC;
    else if (/商务|合同|投标|报价|business|contract/.test(lowerName)) category = TemplateCategory.BUSINESS;
    else if (/技术|方案|设计|架构|technical|design/.test(lowerName)) category = TemplateCategory.TECHNICAL;
    else if (/创意|海报|creative|poster/.test(lowerName)) category = TemplateCategory.CREATIVE;
    else if (/演示|展示|演讲|presentation|slide/.test(lowerName)) category = TemplateCategory.PRESENTATION;
    else if (/文档|手册|说明|document|manual/.test(lowerName)) category = TemplateCategory.DOCUMENT;

    // 自动生成标签：文档类型 + 文件名关键词
    const tags = new Set<string>();
    if (type === 'word') tags.add('Word');
    else if (type === 'ppt') tags.add('PPT');
    else if (type === 'excel') tags.add('Excel');
    else if (type === 'pdf') tags.add('PDF');
    // 从文件名提取关键词（按分隔符切分，取长度>=2的片段，最多3个）
    const keywords = fileName.split(/[-_·\s]+/).filter((k) => k.length >= 2);
    keywords.slice(0, 3).forEach((k) => tags.add(k));

    setAnalyzed({ name: fileName, type, category, tags: [...tags] });
  }, []);

  // 监听 Tauri 拖拽事件（仅对话框打开时）
  useEffect(() => {
    if (!open) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const fn = await getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === 'over') {
            setIsDragging(true);
          } else if (event.payload.type === 'leave') {
            setIsDragging(false);
          } else if (event.payload.type === 'drop') {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const file = paths[0];
              setDraggedFile(file);
              analyzeFile(file);
            }
          }
        });
        // await 返回后若已取消，立即释放本次监听器，避免泄漏
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      } catch (e) {
        console.error('拖拽监听失败', e);
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [open, analyzeFile]);

  // 对话框关闭时重置状态
  useEffect(() => {
    if (!open) {
      setDraggedFile(null);
      setAnalyzed(null);
      setNotes('');
      setIsDragging(false);
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    if (!analyzed || !draggedFile) return;
    onAdd({
      name: analyzed.name,
      type: analyzed.type,
      category: analyzed.category,
      filePath: draggedFile,
      tags: analyzed.tags,
      useCases: [],
      suitableFor: [],
      notes: notes.trim() || undefined,
    });
    // 重置
    setDraggedFile(null);
    setAnalyzed(null);
    setNotes('');
    onClose();
  }, [analyzed, draggedFile, notes, onAdd, onClose]);

  if (!open) return null;


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-[480px] max-h-[90vh] bg-white dark:bg-gray-900 rounded-lg shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            添加满意模板
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 拖拽区域 */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : analyzed
                ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50'
            }`}
          >
            {analyzed ? (
              <div className="space-y-2">
                <div className="text-3xl">✅</div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {analyzed.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-full" title={draggedFile || ''}>
                  📄 {draggedFile}
                </div>
                <div className="flex flex-wrap gap-1 justify-center pt-1">
                  <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {TYPE_ICONS[analyzed.type]} {analyzed.type.toUpperCase()}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                    {TemplateCategoryNames[analyzed.category]}
                  </span>
                  {analyzed.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setDraggedFile(null);
                    setAnalyzed(null);
                  }}
                  className="mt-2 text-xs text-blue-500 hover:underline"
                >
                  重新拖拽文件
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl">{isDragging ? '📥' : '📁'}</div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDragging ? '松开以添加文件' : '拖拽文件到此处'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  支持 Word / PPT / Excel / PDF
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                  系统将自动分析文件名、类型、分类和标签
                </div>
              </div>
            )}
          </div>

          {/* 备注（用户唯一需要填写的） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              备注（可选）
            </label>
            <textarea
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="这个模板好在哪里、什么时候用..."
            />
          </div>

          {/* 自动分析说明 */}
          <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/30 rounded p-2">
            💡 系统已根据文件名自动识别类型、分类和标签，您只需填写备注即可。
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!analyzed || !draggedFile}
            className="flex-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
};

// ============ 主组件：模板库 ============

/**
 * TemplateLibrary 组件属性
 */
export interface TemplateLibraryProps {
  /** 自定义类名 */
  className?: string;
  /** 使用模板回调（点击"使用此模板"时触发） */
  onUseTemplate?: (template: DocumentTemplate) => void;
}

/**
 * 模板库主组件
 */
export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({
  className = '',
  onUseTemplate,
}) => {
  // 用 selector 分别获取状态与 actions，避免任何 store 变化重渲染整棵树
  const selectedId = useTemplateStore((s) => s.selectedId);
  const selectedIds = useTemplateStore((s) => s.selectedIds);
  const filter = useTemplateStore((s) => s.filter);
  const sortOptions = useTemplateStore((s) => s.sortOptions);
  const searchQuery = useTemplateStore((s) => s.searchQuery);
  const viewMode = useTemplateStore((s) => s.viewMode);

  const getVisibleTemplates = useTemplateStore((s) => s.getVisibleTemplates);
  const getStats = useTemplateStore((s) => s.getStats);
  const getTemplate = useTemplateStore((s) => s.getTemplate);
  const patchFilter = useTemplateStore((s) => s.patchFilter);
  const setSelected = useTemplateStore((s) => s.setSelected);
  const toggleSelected = useTemplateStore((s) => s.toggleSelected);
  const deleteTemplate = useTemplateStore((s) => s.deleteTemplate);
  const deleteTemplates = useTemplateStore((s) => s.deleteTemplates);
  const incrementUsage = useTemplateStore((s) => s.incrementUsage);
  const addTemplate = useTemplateStore((s) => s.addTemplate);
  const moveTemplate = useTemplateStore((s) => s.moveTemplate);
  const setSortOptions = useTemplateStore((s) => s.setSortOptions);
  const setSearchQuery = useTemplateStore((s) => s.setSearchQuery);
  const setViewMode = useTemplateStore((s) => s.setViewMode);
  const clearSelection = useTemplateStore((s) => s.clearSelection);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const dragIdRef = useRef<string | null>(null);

  // 可见模板列表（已应用筛选+排序+搜索）
  const visibleTemplates = getVisibleTemplates();
  const stats = getStats();
  const selectedTemplate = selectedId ? getTemplate(selectedId) : undefined;

  // ===== 事件处理 =====

  const handleCategorySelect = useCallback(
    (category: TemplateCategoryValue | undefined) => {
      patchFilter({ category });
    },
    [patchFilter]
  );

  const handleSelectTemplate = useCallback(
    (id: string) => {
      setSelected(id);
    },
    [setSelected]
  );

  const handleToggleBatch = useCallback(
    (id: string) => {
      toggleSelected(id);
    },
    [toggleSelected]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm('确定删除该模板？此操作不可撤销。')) {
        try {
          deleteTemplate(id);
        } catch (e) {
          console.error('删除模板失败', e);
          alert(`删除模板失败: ${e}`);
        }
      }
    },
    [deleteTemplate]
  );

  const handleBatchDelete = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`确定删除选中的 ${selectedIds.length} 个模板？`)) {
      try {
        deleteTemplates(selectedIds);
      } catch (e) {
        console.error('批量删除模板失败', e);
        alert(`批量删除失败: ${e}`);
      }
    }
  }, [selectedIds, deleteTemplates]);

  const handleUse = useCallback(
    (id: string) => {
      const tpl = getTemplate(id);
      if (tpl) {
        try {
          incrementUsage(id);
        } catch (e) {
          console.error('更新使用次数失败', e);
        }
        onUseTemplate?.(tpl);
      }
    },
    [getTemplate, incrementUsage, onUseTemplate]
  );

  const handleAdd = useCallback(
    (request: {
      name: string;
      type: DocumentTypeValue;
      category: TemplateCategoryValue;
      filePath: string;
      tags: string[];
      useCases: string[];
      suitableFor: string[];
      notes?: string;
    }) => {
      try {
        addTemplate({
          name: request.name,
          type: request.type,
          category: request.category,
          filePath: request.filePath,
          tags: request.tags,
          useCases: request.useCases,
          suitableFor: request.suitableFor,
          notes: request.notes,
          source: 'user_upload',
        });
      } catch (e) {
        console.error('添加模板失败', e);
        alert(`添加模板失败: ${e}`);
      }
    },
    [addTemplate]
  );

  // 拖拽排序
  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
  }, []);

  const handleDropToIndex = useCallback(
    (index: number) => {
      if (!dragIdRef.current) return;
      const targetIndex = index === -1 ? -1 : index;
      // 简化处理：拖到末尾
      const moveTo = targetIndex === -1 ? visibleTemplates.length - 1 : targetIndex;
      try {
        moveTemplate(dragIdRef.current, moveTo);
      } catch (e) {
        console.error('拖拽排序失败', e);
      }
      dragIdRef.current = null;
    },
    [moveTemplate, visibleTemplates.length]
  );

  // ===== 渲染 =====

  return (
    <div
      className={`flex h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${className}`}
    >
      {/* 左侧分类栏 */}
      <CategorySidebar
        selectedCategory={filter.category}
        onSelect={handleCategorySelect}
        counts={stats.byCategory}
        total={stats.total}
      />

      {/* 中间主区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模板名称、标签、场景..."
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={`${sortOptions.sortBy}:${sortOptions.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split(':') as [
                TemplateSortOptions['sortBy'],
                TemplateSortOptions['sortOrder']
              ];
              setSortOptions({ sortBy, sortOrder });
            }}
            className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
          >
            {SORT_LABELS.map((opt, i) => (
              <option
                key={i}
                value={`${opt.value.sortBy}:${opt.value.sortOrder}`}
              >
                {opt.label}
              </option>
            ))}
          </select>

          {/* 视图切换 */}
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1.5 text-sm ${
                viewMode === 'grid'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600'
              }`}
              aria-label="网格视图"
            >
              ▦
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1.5 text-sm ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600'
              }`}
              aria-label="列表视图"
            >
              ☰
            </button>
          </div>

          <button
            onClick={() => setShowAddDialog(true)}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            + 添加模板
          </button>
        </div>

        {/* 批量操作栏 */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              已选中 {selectedIds.length} 个
            </span>
            <button
              onClick={handleBatchDelete}
              className="px-2 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              批量删除
            </button>
            <button
              onClick={() => clearSelection()}
              className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >
              取消选择
            </button>
          </div>
        )}

        {/* 模板列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {visibleTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="text-4xl mb-2">📂</div>
              <p className="text-sm">
                {searchQuery || filter.category
                  ? '没有匹配的模板，试试调整筛选条件'
                  : '还没有模板，点击"添加模板"存下你满意的文档'}
              </p>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
                  : 'flex flex-col gap-2'
              }
            >
              {visibleTemplates.map((tpl, index) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  selected={selectedId === tpl.id}
                  inBatch={selectedIds.includes(tpl.id)}
                  viewMode={viewMode}
                  index={index}
                  onSelect={handleSelectTemplate}
                  onToggleBatch={handleToggleBatch}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDropToIndex={handleDropToIndex}
                />
              ))}
            </div>
          )}
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between p-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <span>共 {stats.total} 个模板 · 显示 {visibleTemplates.length} 个</span>
          <span>
            平均评分 {stats.averageRating.toFixed(1)} · 总使用 {stats.totalUsageCount} 次
          </span>
        </div>
      </div>

      {/* 右侧详情面板 */}
      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUse={handleUse}
        />
      )}

      {/* 添加模板对话框 */}
      <AddTemplateDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAdd}
      />
    </div>
  );
};

export default TemplateLibrary;