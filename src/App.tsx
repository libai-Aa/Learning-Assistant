import React, { useState, useEffect, useRef, useCallback, Suspense, lazy, Component, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { chat, ChatMessage } from './lib/api/llm-client';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { useConstellationStore, STAR_TYPE_COLORS, STAR_TYPE_ICONS } from './stores/constellation-store';
import { discoverQuestionsWithLLM } from './lib/research/question-discovery';
import { exploreWithLLM } from './lib/research/methodology-engine';
import { falsifyWithLLM } from './lib/research/falsification-engine';
import { searchPapers, qaSearchPapers } from './lib/aminer/aminer-adapter';
import { startNightlyTimer, stopNightlyTimer, triggerManualUpdate, getLastUpdateTime } from './lib/agent/nightly-update';
import { useIdeaStore, usePendingIdeas } from './stores/idea-store';
import { priorityEngine } from './lib/read/idea-priority';
import type { Methodology } from './types/research';

marked.setOptions({ breaks: true, gfm: true });

/**
 * LaTeX 公式预处理：在 marked.parse 之前把 $$...$$（块级）和 $...$（行内）
 * 用 katex.renderToString 转为 HTML，使 Markdown 渲染管线支持数学公式。
 * - 渐进增强：不修改其余 Markdown 语法，仅替换公式片段
 * - 容错：throwOnError:false，公式语法错误时显示原样而不是抛错
 */
function renderLatex(text: string): string {
  // 先处理块级公式 $$...$$
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `$$${expr}$$`;
    }
  });
  // 再处理行内公式 $...$（不含换行，避免误伤价格等场景）
  out = out.replace(/\$([^\$\n]+?)\$/g, (_m, expr: string) => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `$${expr}$`;
    }
  });
  return out;
}

/**
 * AI 对话 System Prompt：明确要求 LLM 输出风格——
 * 专业名词作解释、核心详细说明、来龙去脉讲清楚、抓住核心简洁有力、生动形象、搭配公式说明。
 * 少样本提示：用编号清单明确行为规范。
 */
const AI_CHAT_SYSTEM_PROMPT = `你是一位知识渊博、善于讲解的AI助手。请遵循以下原则回答问题：

1. **专业名词作解释**：遇到专业术语/缩写/概念，用简明语言解释其含义，让非专业读者也能理解。
2. **核心部分详细说明**：对问题的核心要点要深入展开，不要一笔带过。讲清楚"为什么"而不只是"是什么"。
3. **来龙去脉讲清楚**：从背景→问题→方法→结论，逻辑链条完整。先讲清楚问题的来源和动机，再讲解决思路，最后讲结论和意义。
4. **抓住核心、简洁有力**：不啰嗦不注水，每句话都有信息量。抓住问题本质，用最精炼的语言表达。
5. **生动形象**：善用类比、举例、直觉解释，让抽象概念具象化。
6. **搭配公式说明**：涉及数学/物理/算法等内容时，用LaTeX公式精确表达（行内用$...$，块级用$$...$$），并对公式中每个符号的含义作说明。公式是工具不是装饰，用了就要讲清楚。

输出格式：Markdown。公式用LaTeX语法（$...$行内，$$...$$块级）。`;

// ============================================
// 动态导入：用 React.lazy 延迟加载所有可能有问题的组件
// 关键原理：
//   - 静态 import 在模块级别执行，任何一个组件 import 时抛错都会导致整个 App.tsx 无法加载 → 白屏
//   - React.lazy + Suspense 把 import 推迟到组件渲染时才执行
//   - 配合 ErrorBoundary，即使某个组件 import 时抛错，也只影响该标签页，不会白屏整个应用
// ============================================


// Read区改用 LinkReceiver 作为主界面（已包含输入框+自动识别+抓取+显示结果+历史记录）
const LinkReceiver = lazy(() =>
  import('./components/read/link-receiver').then(m => ({ default: m.LinkReceiver }))
);

// 注意：原 GraphView（依赖 @react-sigma/core）和 StarrySky 组件已不再使用，
// 星空图谱改用方案B（CSS+SVG）实现，见 GraphViewPage 函数。
const ExperimentReportPanel = lazy(() =>
  import('./components/research/experiment-report-panel').then(m => ({ default: m.ExperimentReportPanel }))
);
const ExplorationTimeline = lazy(() =>
  import('./components/research/exploration-timeline').then(m => ({ default: m.ExplorationTimeline }))
);
const TemplateLibrary = lazy(() =>
  import('./components/wps/template-library').then(m => ({ default: m.TemplateLibrary }))
);
const PPTMakerPanel = lazy(() =>
  import('./components/wps/ppt-maker-panel').then(m => ({ default: m.PPTMakerPanel }))
);
const ArticleWriterPanel = lazy(() =>
  import('./components/wps/article-writer-panel').then(m => ({ default: m.ArticleWriterPanel }))
);
const PPTStudyPanel = lazy(() =>
  import('./components/wps/ppt-study-panel').then(m => ({ default: m.PPTStudyPanel }))
);


// 注意：原 NodeType/EdgeType 类型导入已删除（makeEmptyGraphData 已移除）。

/**
 * 6 个主标签页：知识库 / Read区 / Research区 / 星空图谱 / WPS助手 / AI对话
 */
type ViewKey = 'wiki' | 'read' | 'research' | 'graph' | 'wps' | 'ai';

const VIEW_LABELS: Record<ViewKey, string> = {
  wiki: '📖 知识库',
  read: '📝 Read区',
  research: '🔬 Research区',
  graph: '🌟 星空图谱',
  wps: '📊 WPS助手',
  ai: '💬 AI对话',
};

// ============================================
// 错误边界：捕获子组件渲染/加载错误，单点崩溃不影响全局
// ============================================

interface ErrorBoundaryProps {
  /** 模块名，用于失败时提示 */
  name: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 仅控制台记录，避免污染 UI
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={errorBoundaryStyles.wrap}>
          <div style={errorBoundaryStyles.title}>⚠️ {this.props.name} 模块加载失败</div>
          <div style={errorBoundaryStyles.msg}>{this.state.message}</div>
          <button
            style={errorBoundaryStyles.btn}
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </button>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

const errorBoundaryStyles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: 24,
    background: '#fff7f7',
    border: '1px solid #ffa39e',
    borderRadius: 8,
    color: '#5c0011',
    margin: 16,
  },
  title: { fontWeight: 600, fontSize: 14, marginBottom: 8 },
  msg: { fontSize: 12, opacity: 0.8, marginBottom: 12, wordBreak: 'break-word' },
  btn: {
    padding: '6px 14px',
    background: '#ff4d4f',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
};

// ============================================
// LazyComponent 包装器：ErrorBoundary + Suspense
// 任何 lazy 组件的加载失败或渲染失败都会被这里兜住
// ============================================

const suspenseFallback = (
  <div style={{ padding: 20, color: '#999', fontSize: 13 }}>加载中…</div>
);

function LazyComponent({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary name="标签页">
      <Suspense fallback={suspenseFallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// ============================================
// 默认 props 构造：为必传 props 提供合理占位值
// ============================================


/** 默认探索记录条目（用于 ExplorationTimeline） */
function makeEmptyExplorationEntries() {
  return [
    {
      id: 'entry_demo_1',
      reportId: 'report_demo',
      type: 'idea',
      title: '示例：起点想法',
      content: '这是一个示例探索记录，展示时间线样式。实际数据由实验报告 store 提供。',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

// ============================================

// 各标签页内容组件
// 每个标签页用 LazyComponent 包裹，确保 lazy 加载失败时只影响该标签页
// ============================================

/** &#x1F4D6; 知识库：拖拽上传用户材料 + 文件列表 */
// ============ 知识库存储管控 ============
// 常量集中管理：各区域存储软限制（字节）
const STORAGE_LIMITS = {
  knowledge: 1_000_000_000,   // 1GB 软限制
} as const;

// 纯函数：字节数 → 人类可读字符串（B/KB/MB/GB）
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// 文件信息类型：与后端 list_files 返回的 FileInfo 对齐
type MaterialItem = { name: string; path: string; size: number; isDir: boolean; modified: number };

// 从完整路径提取相对于 knowledge-materials/ 的子路径（兼容 Windows 反斜杠）
function extractRelPath(fullPath: string, fallback: string): string {
  const normalized = fullPath.replace(/\\/g, '/');
  const marker = 'knowledge-materials/';
  const idx = normalized.indexOf(marker);
  return idx >= 0 ? normalized.slice(idx + marker.length) : fallback;
}

/**
 * 轻量级 Markdown 渲染：支持标题/加粗/斜体/列表/代码块/链接/换行/KaTeX 公式。
 * - 不引入完整 marked 管线（避免对知识库预览的样式污染），用最小正则实现。
 * - 公式：块级 $$...$$（可跨多行）和行内 $...$，用 katex.renderToString 渲染。
 * - 标题带 id 属性（md-heading-N），供目录锚点跳转。
 * - 返回 HTML 字符串，调用方需用 dangerouslySetInnerHTML 注入。
 * - 转义优先：先 escape HTML，再插入标记，避免 XSS。公式片段先提取再 escape，最后还原。
 */
function renderMarkdown(md: string): string {
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBlockMath = false;
  let blockMathBuf: string[] = [];
  let headingCounter = 0;

  const closeList = () => {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  };

  // 渲染块级公式为 KaTeX HTML
  const renderBlockMath = (expr: string): string => {
    try {
      return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `$$${expr}$$`;
    }
  };

  // 行内格式：加粗/斜体/链接/行内代码/行内公式 $...$
  const inline = (s: string) => {
    // 先提取行内公式 $...$ 用占位符替换，避免公式内容被 escape 破坏
    const mathPlaceholders: string[] = [];
    let text = s.replace(/\$([^\$\n]+?)\$/g, (_m, expr: string) => {
      try {
        mathPlaceholders.push(katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }));
      } catch {
        mathPlaceholders.push(`$${expr}$`);
      }
      return `\x00MATH${mathPlaceholders.length - 1}\x00`;
    });
    // escape HTML
    let t = escapeHtml(text);
    // 还原公式 HTML
    t = t.replace(/\x00MATH(\d+)\x00/g, (_m, idx) => mathPlaceholders[Number(idx)]);
    // 行内代码
    t = t.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-family:monospace">$1</code>');
    // 加粗/斜体/链接
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/_([^_]+)_/g, '<em>$1</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#a5b4fc;text-decoration:underline">$1</a>');
    return t;
  };

  for (const raw of lines) {
    // 代码块围栏
    if (/^```/.test(raw)) {
      if (inCode) {
        html.push(`<pre style="background:rgba(0,0,0,0.4);padding:12px;border-radius:6px;overflow:auto;font-family:monospace;font-size:12px;color:#e2e8f0">${escapeHtml(codeBuf.join('\n'))}</pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    // 块级公式 $$...$$（可能跨多行：$$ 开独占一行，内容，$$ 结束）
    if (raw.trim().startsWith('$$')) {
      if (inBlockMath) {
        // 结束块级公式
        closeList();
        html.push(`<div style="margin:12px 0;text-align:center;overflow:auto">${renderBlockMath(blockMathBuf.join('\n'))}</div>`);
        blockMathBuf = [];
        inBlockMath = false;
      } else {
        // 检查是否同一行开始并结束：$$...$$
        const single = raw.match(/^\$\$([\s\S]+?)\$\$$/);
        if (single) {
          closeList();
          html.push(`<div style="margin:12px 0;text-align:center;overflow:auto">${renderBlockMath(single[1])}</div>`);
        } else {
          closeList();
          inBlockMath = true;
        }
      }
      continue;
    }
    if (inBlockMath) { blockMathBuf.push(raw); continue; }

    // 标题
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const sizes = [24, 22, 20, 18, 16, 14];
      headingCounter++;
      const headingId = `md-heading-${headingCounter}`;
      html.push(`<h${level} id="${headingId}" style="color:#f1f5f9;font-size:${sizes[level - 1]}px;font-weight:bold;margin:12px 0 6px;scroll-margin-top:60px">${inline(h[2])}</h${level}>`);
      continue;
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(raw)) {
      if (!inUl) { closeList(); html.push('<ul style="margin:6px 0;padding-left:22px;line-height:1.7">'); inUl = true; }
      html.push(`<li>${inline(raw.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      continue;
    }
    // 有序列表
    if (/^\s*\d+\.\s+/.test(raw)) {
      if (!inOl) { closeList(); html.push('<ol style="margin:6px 0;padding-left:22px;line-height:1.7">'); inOl = true; }
      html.push(`<li>${inline(raw.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      continue;
    }
    // 空行
    if (raw.trim() === '') { closeList(); html.push('<div style="height:8px"></div>'); continue; }
    // 普通段落
    closeList();
    html.push(`<p style="margin:4px 0;line-height:1.7">${inline(raw)}</p>`);
  }
  // 收尾：未闭合的代码块
  if (inCode) {
    html.push(`<pre style="background:rgba(0,0,0,0.4);padding:12px;border-radius:6px;overflow:auto;font-family:monospace;font-size:12px;color:#e2e8f0">${escapeHtml(codeBuf.join('\n'))}</pre>`);
  }
  // 收尾：未闭合的块级公式
  if (inBlockMath) {
    html.push(`<div style="margin:12px 0;text-align:center;overflow:auto">${renderBlockMath(blockMathBuf.join('\n'))}</div>`);
  }
  closeList();
  return html.join('');
}

/**
 * 从 Markdown 提取目录（标题列表），用于侧边栏锚点跳转。
 * - 与 renderMarkdown 的 headingCounter 逻辑保持一致（跳过代码块内的 # 行）。
 * - text 去除 markdown 标记符号，保留纯文本用于目录显示。
 */
function extractTocFromMd(md: string): { level: number; text: string; id: string }[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const toc: { level: number; text: string; id: string }[] = [];
  let inCode = false;
  let headingCounter = 0;
  for (const raw of lines) {
    if (/^```/.test(raw)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      headingCounter++;
      toc.push({ level: h[1].length, text: h[2].replace(/[*_`#]/g, '').trim(), id: `md-heading-${headingCounter}` });
    }
  }
  return toc;
}

function WikiView() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<MaterialItem | null>(null);
  const [storageSize, setStorageSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 文件预览相关 state
  const [fileContent, setFileContent] = useState<string | null>(null);       // 文本类内容（md/txt/json/csv/log/xml/docx 提取后）
  const [contentLoading, setContentLoading] = useState(false);                // 内容加载中
  const [slideContent, setSlideContent] = useState<string[][] | null>(null);  // PPT 每页幻灯片文字（每个元素为一页的文本数组）


  // 加载文件列表（IO 操作，useCallback 稳定引用以便 useEffect 依赖）
  const loadMaterials = useCallback(async () => {
    try {
      const files = await invoke<MaterialItem[]>('list_files', { subdir: 'knowledge-materials' });
      setMaterials(files);
      setError(null);
    } catch (e) {
      console.error('加载文件列表失败:', e);
      setError(`加载文件列表失败：${e}`);
      setMaterials([]);  // 优雅降级：失败显示空列表而非崩溃
    }
  }, []);

  // 加载存储大小（优雅降级：失败不更新，保持上次值）
  const loadStorageSize = useCallback(async () => {
    try {
      const size = await invoke<number>('get_dir_size', { subdir: 'knowledge-materials' });
      setStorageSize(size);
    } catch (e) {
      console.error('获取存储大小失败:', e);
    }
  }, []);

  // 删除文件（悲观更新：等后端成功再更新 UI，避免回滚复杂度）
  const handleDelete = async (file: { name: string; path: string }) => {
    if (!confirm(`确定删除「${file.name}」？此操作不可撤销。`)) return;
    setLoading(true);
    try {
      // 从完整路径提取相对于数据目录的子路径
      const relPath = extractRelPath(file.path, file.name);
      await invoke('delete_file', { filepath: `knowledge-materials/${relPath}` });
      setMaterials(prev => prev.filter(m => m.path !== file.path));
      if (selectedFile?.path === file.path) setSelectedFile(null);
      loadStorageSize();  // 刷新存储用量
    } catch (e) {
      // 错误信息可操作：告知用户可能原因与下一步
      alert(`删除失败：${e}\n可能文件被占用，请关闭后重试`);
    } finally {
      setLoading(false);
    }
  };

  // 打开文件（复用逻辑，统一错误提示）
  const handleOpen = useCallback(async (path: string) => {
    try {
      await invoke('open_file', { filePath: path });
    } catch (e) {
      alert(`打开失败：${e}`);
    }
  }, []);

  // 监听知识库更新事件 + 初始加载
  useEffect(() => {
    loadMaterials();
    loadStorageSize();

    // 监听App根组件派发的knowledge-updated事件（拖拽导入后刷新）
    const onKnowledgeUpdated = () => { loadMaterials(); loadStorageSize(); };
    window.addEventListener('knowledge-updated', onKnowledgeUpdated);
    return () => window.removeEventListener('knowledge-updated', onKnowledgeUpdated);
  }, [loadMaterials, loadStorageSize]);

  // 当选中文件变化时，按扩展名加载预览内容
  // - 文本类：调用 read_text_file Tauri 命令读取
  // - pptx/docx：通过 HTTP 拉取二进制，用 JSZip 解析提取文字
  // - pdf/图片：不加载文本，由渲染层直接用 iframe/img 引用 HTTP URL
  useEffect(() => {
    if (!selectedFile || selectedFile.isDir) {
      setFileContent(null);
      setSlideContent(null);
      return;
    }
    const ext = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    const textExts = ['md', 'txt', 'json', 'csv', 'log', 'xml'];
    const dataUrl = `http://127.0.0.1:18080/data-file/knowledge-materials/${encodeURIComponent(selectedFile.name)}`;

    if (textExts.includes(ext)) {
      setContentLoading(true);
      invoke<string>('readfilecontent', { filePath: selectedFile.path })
        .then(content => { setFileContent(content); setSlideContent(null); })
        .catch(e => { console.error('读取文本文件失败:', e); setFileContent(`[读取失败] ${e}`); setSlideContent(null); })
        .finally(() => setContentLoading(false));
    } else if (ext === 'pptx') {
      setContentLoading(true);
      setFileContent(null);
      (async () => {
        try {
          const JSZip = (await import('jszip')).default;
          const resp = await fetch(dataUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const zip = await JSZip.loadAsync(await resp.arrayBuffer());
          // 枚举 ppt/slides/slideN.xml 并按页号排序
          const slideFiles = Object.keys(zip.files)
            .filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
            .sort((a, b) => {
              const na = parseInt(a.match(/slide(\d+)\.xml/)![1]);
              const nb = parseInt(b.match(/slide(\d+)\.xml/)![1]);
              return na - nb;
            });
          const slides: string[][] = [];
          for (const sf of slideFiles) {
            const xml = await zip.files[sf].async('string');
            // 提取 <a:t> 标签内文字（OOXML 幻灯片文本节点）
            const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)).map(m => m[1]);
            slides.push(texts);
          }
          setSlideContent(slides);
        } catch (e) {
          console.error('解析 PPTX 失败:', e);
          setSlideContent([[`[解析失败] ${e}`]]);
        } finally {
          setContentLoading(false);
        }
      })();
    } else if (ext === 'docx') {
      setContentLoading(true);
      setSlideContent(null);
      (async () => {
        try {
          const JSZip = (await import('jszip')).default;
          const resp = await fetch(dataUrl);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const zip = await JSZip.loadAsync(await resp.arrayBuffer());
          const xml = await zip.files['word/document.xml'].async('string');
          // 提取 <w:t> 标签内文字（OOXML 文档文本节点），按段落换行
          const paragraphs = xml.split(/<\/w:p>/);
          const lines: string[] = [];
          for (const p of paragraphs) {
            const texts = Array.from(p.matchAll(/<w:t(?:[^>]*)>([^<]*)<\/w:t>/g)).map(m => m[1]);
            if (texts.length) lines.push(texts.join(''));
          }
          setFileContent(lines.join('\n'));
        } catch (e) {
          console.error('解析 DOCX 失败:', e);
          setFileContent(`[解析失败] ${e}`);
        } finally {
          setContentLoading(false);
        }
      })();
    } else {
      // pdf / 图片 / 其他：无需预读文本
      setFileContent(null);
      setSlideContent(null);
    }
  }, [selectedFile]);

  /**
   * 根据文件扩展名渲染预览内容。由右侧面板调用。
   * - PDF：iframe 直接嵌入后端 HTTP 流
   * - 图片：img 直接显示
   * - PPT：以 16:9 卡片逐页展示提取的文字
   * - md：调用 renderMarkdown 渲染
   * - 其他文本：pre 原样显示
   * - 不支持类型：友好提示
   */
  const renderFileContent = (file: MaterialItem) => {
    if (file.isDir) {
      return <div style={{ color: '#64748b', fontSize: 13, padding: 16 }}>📁 文件夹，点击列表中的文件查看内容。</div>;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const dataUrl = `http://127.0.0.1:18080/data-file/knowledge-materials/${encodeURIComponent(file.name)}`;
    const preStyle: React.CSSProperties = {
      whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#e2e8f0',
      fontSize: 13, lineHeight: 1.6, fontFamily: 'monospace', margin: 0,
    };

    if (ext === 'pdf') {
      return <iframe src={dataUrl} style={{ width: '100%', height: '100%', minHeight: 480, border: 'none', borderRadius: 8 }} title={file.name} />;
    }
    if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'bmp'].includes(ext)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={dataUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }} />
        </div>
      );
    }
    if (ext === 'pptx') {
      if (!slideContent) {
        return <div style={{ color: '#64748b', fontSize: 13, padding: 16 }}>未提取到幻灯片内容。</div>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 4 }}>
          {slideContent.map((texts, i) => (
            <div
              key={i}
              style={{
                aspectRatio: '16 / 9', width: '100%', boxSizing: 'border-box',
                background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))',
                border: '1px solid rgba(165,180,252,0.2)', borderRadius: 10, padding: 24,
                display: 'flex', flexDirection: 'column', overflow: 'auto',
                boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 8, letterSpacing: 1 }}>
                SLIDE {i + 1} / {slideContent.length}
              </div>
              <div style={{ flex: 1, color: '#e2e8f0', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {texts.length ? texts.join('\n') : <span style={{ color: '#64748b' }}>[此页无文本，可能为图片/图形]</span>}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (ext === 'md') {
      if (fileContent === null) return <div style={{ color: '#64748b', fontSize: 13, padding: 16 }}>无内容。</div>;
      const toc = extractTocFromMd(fileContent);
      return (
        <div style={{ display: 'flex', gap: 16, minHeight: '100%' }}>
          {toc.length > 1 && (
            <div style={{
              width: 200, flexShrink: 0, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
              background: 'rgba(15,23,42,0.5)', borderRadius: 8, padding: '10px 8px',
              border: '1px solid rgba(99,102,241,0.15)', position: 'sticky', top: 0,
            }}>
              <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 'bold', marginBottom: 8, letterSpacing: 1, padding: '0 4px' }}>📑 目录</div>
              {toc.map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    const el = document.getElementById(item.id);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{
                    fontSize: 12, color: '#94a3b8', cursor: 'pointer', padding: '3px 4px',
                    paddingLeft: 4 + (item.level - 1) * 12, borderRadius: 4,
                    lineHeight: 1.5, wordBreak: 'break-all',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#a5b4fc'; e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; }}
                >
                  {item.text}
                </div>
              ))}
            </div>
          )}
          <div
            dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
            style={{ flex: 1, minWidth: 0, color: '#e2e8f0', fontSize: 13 }}
          />
        </div>
      );
    }
    if (['txt', 'json', 'csv', 'log', 'xml', 'docx'].includes(ext)) {
      if (fileContent === null) return <div style={{ color: '#64748b', fontSize: 13, padding: 16 }}>无内容。</div>;
      return <pre style={preStyle}>{fileContent}</pre>;
    }
    return (
      <div style={{ color: '#64748b', fontSize: 13, padding: 16, textAlign: 'center' }}>
        ⚠️ 暂不支持预览「.{ext}」类型文件，请点击右上角「外部打开」使用系统默认程序查看。
      </div>
    );
  };

  return (
    <div

      style={{
        height: '100%', borderRadius: 8, padding: 20, position: 'relative', overflow: 'hidden',
        display: 'flex', gap: 20,
      }}
    >
      <img src="/bg/ink-bg.jpg" alt="" style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',pointerEvents:'none',zIndex:0 }} />
      <div style={{ position:'absolute',inset:0,background:'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%)',pointerEvents:'none',zIndex:0 }} />

        {/* 左侧：刷新按钮 + 拖拽区域 + 文件列表 + 存储仪表盘 */}
        <div
          style={{
            flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 12,
            position: 'relative', zIndex: 1,
          }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); }}
        >
          {/* 刷新按钮 */}
          <button
            onClick={() => { loadMaterials(); loadStorageSize(); }}
            disabled={loading}
            style={{
              padding: '6px 12px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
              border: '1px solid rgba(165,180,252,0.3)', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12, opacity: loading ? 0.6 : 1, alignSelf: 'flex-start',
            }}
          >
            🔄 刷新
          </button>

          {/* 拖拽上传区域 */}
          <div style={{
            height: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            border: `2px dashed ${isDragOver ? '#a5b4fc' : 'rgba(165,180,252,0.3)'}`,
            borderRadius: 12, background: isDragOver ? 'rgba(99,102,241,0.15)' : 'rgba(10,10,30,0.4)',
            transition: 'all 0.2s',
            cursor: 'default',
          }}>
            <span style={{ color: isDragOver ? '#a5b4fc' : 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', whiteSpace: 'pre-line' }}>
              {isDragOver ? '📂 松开放入' : '📂 拖拽文件到此处\nPPT · Word · PDF · md'}
            </span>
            <button
              onClick={async () => {
                try {
                  const { open } = await import('@tauri-apps/plugin-dialog');
                  const selected = await open({ multiple: true, title: '选择文件导入知识库' });
                  if (!selected) return;
                  const paths = Array.isArray(selected) ? selected : [selected];
                  for (const p of paths) {
                    try {
                      await invoke<string>('copy_file_to_knowledge', { sourcePath: p });
                    } catch (e) { console.error('导入失败:', e); alert(`导入失败：${e}`); }
                  }
                  loadMaterials();
                  loadStorageSize();
                } catch (e) { console.error('对话框加载失败:', e); alert(`无法打开文件选择器：${e}`); }
              }}
              style={{
                padding: '4px 16px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                border: '1px solid rgba(165,180,252,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
              }}
            >📁 选择文件</button>
          </div>

          {/* 文件列表标题 */}
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            已上传 {materials.length} 个项目
          </div>
          {error && (
            <div style={{ fontSize: 11, color: '#f87171', padding: '4px 8px', background: 'rgba(248,113,113,0.1)', borderRadius: 4 }}>
              {error}
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {materials.map((m) => (
              <div
                key={m.path}
                style={{
                  padding: '6px 10px', background: selectedFile?.path === m.path ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
                  borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center',
                }}
              >
                <span
                  onClick={() => setSelectedFile(m)}
                  style={{ color: '#ef4444', fontSize: 13, fontWeight: 'bold', flex: 1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor: 'pointer' }}
                  title={m.name}
                >
                  {m.isDir ? '📁' : '📄'} {m.name}
                </span>
                <span style={{ color: '#94a3b8', fontSize: 10, flexShrink: 0 }}>
                  {m.isDir ? '' : formatSize(m.size)}
                </span>
                <button
                  onClick={() => handleDelete(m)}
                  disabled={loading}
                  title="删除"
                  style={{ background:'none', border:'none', color: loading ? '#4b5563' : '#f87171', fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer', padding: '0 2px' }}
                >�</button>
                <button
                  onClick={() => handleOpen(m.path)}
                  title="打开"
                  style={{ background:'none', border:'none', color: '#a5b4fc', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
                >📂</button>
              </div>
            ))}
            {materials.length === 0 && (
              <span style={{ color: '#4b5563', fontSize: 11, padding: 8 }}>
                拖拽文件或文件夹到上方区域即可导入
              </span>
            )}
          </div>

          {/* 存储用量仪表盘 */}
          <div style={{ fontSize: 11, color: '#94a3b8', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            存储用量: {formatSize(storageSize)}
            {storageSize > STORAGE_LIMITS.knowledge && (
              <span style={{ color: '#ef4444' }}> ⚠️ 超过1GB，建议清理</span>
            )}
          </div>
        </div>

        {/* 中间区域：文件预览详情（原汁原味显示文件内容） */}
        <div style={{ flex: 1, position: 'relative', zIndex: 1, background: 'rgba(10,10,30,0.4)', borderRadius: 12, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {selectedFile ? (
            <div style={{ padding: 20, color: '#e2e8f0', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
              {/* 标题栏：文件名 + 外部打开备选按钮 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
                <h3 style={{ margin: 0, color: '#ef4444', fontSize: 16, fontWeight: 'bold', wordBreak: 'break-all', flex: 1 }}>
                  {selectedFile.isDir ? '📁' : '📄'} {selectedFile.name}
                </h3>
                <button
                  onClick={() => handleOpen(selectedFile.path)}
                  title="使用系统默认程序打开"
                  style={{
                    padding: '6px 12px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
                    border: '1px solid rgba(165,180,252,0.4)', borderRadius: 6, cursor: 'pointer', fontSize: 12, flexShrink: 0,
                  }}
                >📂 外部打开</button>
              </div>
              {/* 元信息行 */}
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>{selectedFile.isDir ? '文件夹' : formatSize(selectedFile.size)}</span>
                <span>{new Date(selectedFile.modified).toLocaleString('zh-CN')}</span>
                <span style={{ color: '#475569', wordBreak: 'break-all' }}>{selectedFile.path}</span>
              </div>
              {/* 内容区 */}
              <div style={{ flex: 1, minHeight: 0 }}>
                {contentLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>
                    ⏳ 加载中...
                  </div>
                ) : (
                  renderFileContent(selectedFile)
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4b5563', fontSize: 13 }}>
              选择左侧文件查看内容
            </div>
          )}
        </div>
    </div>
  );
}


/** 📝 Read区：链接接收为主 + 已接收内容列表 + 简单批注 */
function ReadView() {
  const [ideaContent, setIdeaContent] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const createIdea = useIdeaStore(s => s.createIdea);
  const setImportance = useIdeaStore(s => s.setImportance);
  const setUrgency = useIdeaStore(s => s.setUrgency);
  const setPriorityScore = useIdeaStore(s => s.setPriorityScore);

  /** 保存想法：创建后自动分析优先级（重要性/紧急度/分数） */
  const handleSaveIdea = () => {
    const content = ideaContent.trim();
    if (!content) return;
    const id = createIdea({ content, source: 'reading' });
    const analysis = priorityEngine.analyzeIdea(content);
    setImportance(id, analysis.estimatedPriority.importance);
    setUrgency(id, analysis.estimatedPriority.urgency);
    setPriorityScore(id, priorityEngine.calculatePriorityScore(content));
    setIdeaContent('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* 顶部：链接接收（LinkReceiver 已有输入框+自动识别+抓取+显示结果+历史记录） */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <LazyComponent>
          <LinkReceiver />
        </LazyComponent>
      </div>
      {/* 底部：简单批注/想法记录区域 */}
      <div style={{
        flex: '0 0 160px',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)',
        borderRadius: 8,
        border: '1px solid #dee2e6',
        padding: 14,
        overflow: 'auto',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#374151', fontWeight: 600 }}>📝 快速批注/想法</h3>
        <textarea
          placeholder="记录灵感、批注、想法..."
          value={ideaContent}
          onChange={e => setIdeaContent(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveIdea(); }}
          style={{
            width: '100%', height: 70, resize: 'none',
            border: '1px solid #d1d5db', borderRadius: 6,
            padding: 8, fontSize: 13, fontFamily: 'inherit',
            boxSizing: 'border-box',
            background: 'white',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSaveIdea}
          disabled={!ideaContent.trim()}
          style={{
            marginTop: 8, padding: '6px 16px',
            background: ideaContent.trim() ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#9ca3af',
            color: 'white',
            border: 'none', borderRadius: 6, cursor: ideaContent.trim() ? 'pointer' : 'not-allowed', fontSize: 12,
            fontWeight: 500, boxShadow: '0 2px 4px rgba(59,130,246,0.3)',
          }}
        >
          {savedFlash ? '✅ 已保存' : '保存想法'}
        </button>
      </div>
    </div>
  );
}

/** 🔬 Research区：逐步移除hooks排查 #185 */
function ResearchView() {
  const demoReportId = 'report_demo';
  const demoEntries = useMemo(() => makeEmptyExplorationEntries(), []);

  // 星座store：用于在探索过程中动态构建星系图谱
  const addConstellation = useConstellationStore(s => s.addConstellation);
  const addStar = useConstellationStore(s => s.addStar);
  const addEdge = useConstellationStore(s => s.addEdge);
  const updateConstellationStatus = useConstellationStore(s => s.updateConstellationStatus);

  // 想法输入
  const [ideaText, setIdeaText] = useState('');
  const [isExploring, setIsExploring] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);
  const [summary, setSummary] = useState<string>('');
  const [aminerPapers, setAminerPapers] = useState<any[]>([]);
  const [showAminerResults, setShowAminerResults] = useState(true);
  const [currentRound, setCurrentRound] = useState(0);
  const [maxRounds] = useState(5);
  const [totalConflicts, setTotalConflicts] = useState(0);

  // 待实践想法（usePendingIdeas 已在 idea-store.ts 中修复为 useMemo 模式）
  const pendingIdeas = usePendingIdeas();
  const updatePracticeStatus = useIdeaStore(s => s.updatePracticeStatus);
  const [autoExploreIdeaId, setAutoExploreIdeaId] = useState<string | null>(null);

  // 探索历史
  interface ExplorationHistoryItem {
    id: string; timestamp: string; idea: string; summary: string;
    rounds: number; conflicts: number; conclusionsCount: number; logs: string[];
  }
  const [history, setHistory] = useState<ExplorationHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('exploration-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  /** 保存探索记录到历史 */
  const saveToHistory = (item: ExplorationHistoryItem) => {
    setHistory(prev => {
      const next = [item, ...prev].slice(0, 50);
      try { localStorage.setItem('exploration-history', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  /** 追加一条日志 */
  const appendLog = (line: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    logsRef.current = [...logsRef.current, entry];
    setLogs(prev => [...prev, entry]);
  };

  /** 启动全流程探索 */
  const handleStartExplore = async (overrideText?: string) => {
    const text = (overrideText ?? ideaText).trim();
    if (!text) { appendLog('请先输入一个想法'); return; }
    if (isExploring) return;

    setIsExploring(true);
    setStage('开始探索');
    setProgress(5);
    setLogs([]);
    logsRef.current = [];
    setSummary('');
    setAminerPapers([]);
    setCurrentRound(0);
    setTotalConflicts(0);
    appendLog(`想法：${text}`);

    try {
      // a. 创建星系
      setStage('创建星系');
      setProgress(10);
      const constellationId = addConstellation(text, 'idea', undefined);
      appendLog('已创建星系');

      // b. 调用LLM发现问题
      setStage('AI 正在发现问题…');
      setProgress(20);
      let discovered;
      try {
        discovered = await discoverQuestionsWithLLM(text, 'idea');
      } catch (e) {
        discovered = [];
        appendLog(`发现问题失败：${e instanceof Error ? e.message : String(e)}`);
      }
      appendLog(`发现 ${discovered.length} 个值得研究的问题`);
      setProgress(35);

      if (discovered.length === 0) {
        setStage('探索完成');
        setProgress(100);
        setSummary('AI 未从该想法中发现值得研究的问题，请尝试更具体的描述。');
        updateConstellationStatus(constellationId, 'synthesized');
        return;
      }

      // b.5 AMiner学术搜索
      setStage('正在搜索相关学术文献…');
      appendLog('调用 AMiner 搜索相关学术文献');
      try {
        const aminerQuery = discovered[0]?.question || text;
        const papers = await searchPapers(aminerQuery, 10);
        const paperList = Array.isArray(papers) ? papers : (papers?.papers || []);
        setAminerPapers(paperList);
        appendLog(`AMiner 返回 ${paperList.length} 篇相关论文`);
        for (const paper of paperList.slice(0, 5)) {
          try {
            const paperTitle = paper.title || paper.title_zh || '未知论文';
            const paperYear = paper.year || '未知';
            const paperCitations = paper.n_citation ?? paper.citationCount ?? 0;
            const paperAuthors = Array.isArray(paper.authors)
              ? paper.authors.map((a: any) => typeof a === 'string' ? a : (a.name || a.name_zh || '')).filter(Boolean).join(', ')
              : '未知作者';
            addStar(constellationId, paperTitle, 'evidence', 'aminer', {
              detail: `AMiner 学术文献\n年份：${paperYear}\n引用数：${paperCitations}\n作者：${paperAuthors}`,
              status: 'verified', size: 6,
            });
          } catch (e) { console.warn('添加 AMiner 论文节点失败:', e); }
        }
      } catch (e) {
        console.warn('AMiner 搜索失败:', e);
        setAminerPapers([]);
        appendLog(`AMiner 搜索失败：${e instanceof Error ? e.message : String(e)}`);
      }

      // c. 探索-证伪循环
      const allConclusions: string[] = [];
      let finalRound = 0;
      let finalConflicts = 0;
      let currentQuestions = discovered.map(q => ({
        question: q.question, type: q.type, valueScore: q.valueScore,
        recommendedMethodologies: q.recommendedMethodologies,
      }));

      for (let round = 1; round <= maxRounds; round++) {
        finalRound = round;
        setCurrentRound(round);
        setStage(`第 ${round}/${maxRounds} 轮探索-证伪循环…`);
        appendLog(`===== 第 ${round} 轮循环（共 ${currentQuestions.length} 个问题）=====`);

        let hasNewQuestions = false;
        const nextRoundQuestions: any[] = [];
        const questionsCount = currentQuestions.length;

        for (let i = 0; i < questionsCount; i++) {
          const q = currentQuestions[i];
          const methodLabel = `第${round}轮 问题 ${i + 1}/${questionsCount}：${q.question.slice(0, 30)}…`;
          setStage(`AI 正在探索 ${methodLabel}`);
          setProgress(35 + Math.round(((round - 1) / maxRounds) * 55) + Math.round(((i + 0.5) / questionsCount) * (55 / maxRounds)));

          const methodology: Methodology = q.recommendedMethodologies[0] || 'first-principles';
          const methodologyName = methodology === 'socratic' ? '苏格拉底法' : methodology === 'five-whys' ? '五问法' : '第一性原理';

          const questionStarId = addStar(constellationId, q.question, 'sub-question', q.type,
            { detail: `第${round}轮 · 类型：${q.type}，价值：${q.valueScore}/10`, status: 'researching' });

          // AMiner QA搜索
          try {
            const qaPapersRaw = await qaSearchPapers(q.question, 5);
            const qaPapers = Array.isArray(qaPapersRaw) ? qaPapersRaw : (qaPapersRaw?.papers || []);
            if (qaPapers.length > 0) {
              setAminerPapers(prev => [...prev, ...qaPapers]);
              appendLog(`AMiner QA 搜索为该问题补充 ${qaPapers.length} 篇学术背景文献`);
            }
          } catch (e) { console.warn('AMiner QA 搜索失败:', e); }

          // LLM探索
          let exploreResult;
          try {
            exploreResult = await exploreWithLLM(q.question, methodology);
          } catch (e) {
            appendLog(`探索失败（${methodologyName}）：${e instanceof Error ? e.message : String(e)}`);
            continue;
          }
          appendLog(`用${methodologyName}完成探索，得到 ${exploreResult.steps.length} 个步骤`);

          for (const step of exploreResult.steps) {
            const hypothesisStarId = addStar(constellationId, `步骤${step.step}：${step.question}`, 'hypothesis', methodology,
              { detail: step.analysis, methodology, status: 'discovered' });
            addEdge(questionStarId, hypothesisStarId, '追问');
          }

          if (exploreResult.conclusion) {
            allConclusions.push(exploreResult.conclusion);
            const conclusionStarId = addStar(constellationId, '结论', 'conclusion', methodology,
              { detail: exploreResult.conclusion, methodology, status: 'synthesized', size: 9 });
            addEdge(questionStarId, conclusionStarId, '得出');

            // 证伪
            setStage(`第${round}轮 AI 正在证伪（问题 ${i + 1}）…`);
            try {
              const falsification = await falsifyWithLLM(
                exploreResult.conclusion,
                `原问题：${q.question}\n探索步骤：${exploreResult.steps.map(s => s.analysis).join('；')}`
              );
              const conflictCount = falsification.conflicts.length;
              const contradictionCount = falsification.conflicts.filter(c => c.conflictType === 'contradiction').length;
              appendLog(`证伪完成：发现 ${conflictCount} 个冲突（其中 ${contradictionCount} 个直接矛盾）`);
              finalConflicts += conflictCount;
              setTotalConflicts(prev => prev + conflictCount);

              const evidenceStarId = addStar(constellationId, `证伪：${contradictionCount > 0 ? '发现矛盾' : conflictCount > 0 ? '存在削弱' : '暂未证伪'}`,
                'evidence', 'falsification', {
                  detail: falsification.recommendation + '\n\n冲突点：' + falsification.conflicts.map(c => `${c.conflictType}: ${c.evidence}`).join('；'),
                  status: contradictionCount > 0 ? 'falsified' : 'verified', size: 7,
                });
              addEdge(conclusionStarId, evidenceStarId, '证伪');

              if (contradictionCount > 0) {
                hasNewQuestions = true;
                const contradictionTexts = falsification.conflicts.filter(c => c.conflictType === 'contradiction').map(c => c.assertion);
                try {
                  const newQuestions = await discoverQuestionsWithLLM(contradictionTexts.join('; '), 'conversation');
                  for (const nq of newQuestions) {
                    nextRoundQuestions.push({ question: nq.question, type: nq.type, valueScore: nq.valueScore, recommendedMethodologies: nq.recommendedMethodologies });
                  }
                  appendLog(`证伪产生 ${contradictionCount} 个新矛盾，LLM判断为 ${newQuestions.length} 个新问题，将进入下一轮探索`);
                } catch (e) {
                  for (const text of contradictionTexts) {
                    nextRoundQuestions.push({ question: `证伪新问题：${text}`, type: 'sub-question', valueScore: 7, recommendedMethodologies: ['first-principles'] });
                  }
                  appendLog(`证伪产生 ${contradictionCount} 个新矛盾（LLM判断失败，降级处理），将进入下一轮探索`);
                }
              }
            } catch (e) { appendLog(`证伪失败：${e instanceof Error ? e.message : String(e)}`); }
          }
        }

        if (!hasNewQuestions) { appendLog(`第 ${round} 轮未发现新问题，探索-证伪循环完成`); break; }
        if (round === maxRounds) { appendLog(`达到最大轮数 ${maxRounds}，探索-证伪循环完成`); }
        currentQuestions = nextRoundQuestions;
      }

      // 完成
      setStage('探索完成');
      setProgress(100);
      updateConstellationStatus(constellationId, 'synthesized');
      const summaryText = [
        `从想法中发现了 ${discovered.length} 个值得研究的问题，`,
        `经过 ${finalRound} 轮探索-证伪循环，`,
        `共完成 ${allConclusions.length} 个结论的探索与证伪，累计发现 ${finalConflicts} 个冲突。`,
        allConclusions.length > 0 ? `\n\n主要结论：\n${allConclusions.map((c, i) => `${i + 1}. ${c.slice(0, 100)}${c.length > 100 ? '…' : ''}`).join('\n')}` : '',
      ].join('');
      setSummary(summaryText);
      appendLog('全流程探索完成');
      saveToHistory({
        id: `exp_${Date.now()}`, timestamp: new Date().toISOString(), idea: text,
        summary: summaryText, rounds: finalRound, conflicts: finalConflicts,
        conclusionsCount: allConclusions.length, logs: [...logsRef.current],
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      appendLog(`探索中断：${errMsg}`);
      setStage('探索中断');
      setSummary(`探索过程中出现异常：${errMsg}`);
      if (autoExploreIdeaId) {
        updatePracticeStatus(autoExploreIdeaId, 'active', '探索中断');
        setAutoExploreIdeaId(null);
      }
    } finally {
      setIsExploring(false);
      if (autoExploreIdeaId && summary) {
        updatePracticeStatus(autoExploreIdeaId, 'done', summary.slice(0, 200));
        setAutoExploreIdeaId(null);
      }
    }
  };

  /** 自动探索最高优先级想法 */
  const handleAutoExplore = () => {
    if (isExploring || pendingIdeas.length === 0) return;
    const topIdea = pendingIdeas[0];
    setIdeaText(topIdea.content);
    setAutoExploreIdeaId(topIdea.id);
    updatePracticeStatus(topIdea.id, 'active');
    handleStartExplore(topIdea.content);
  };

  return (
    <div style={{ position: 'relative', minHeight: '100%', overflow: 'auto' }}>
      {/* 壁纸背景 */}
      <img
        src="/bg/star-bg.jpg"
        alt=""
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2, pointerEvents: 'none' }}
      />
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: -1, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(10,10,30,0.45) 0%, rgba(10,10,30,0.65) 100%)' }} />

      <div style={{ padding: 16, color: '#e5e7ff' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: 22, fontWeight: 700, color: '#e5e7ff' }}>🔬 实验报告系统</h1>
        <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#a5b4fc' }}>想法 → AI发现问题 → 探索-证伪循环 → 实验报告</p>

        {/* 待实践想法面板 */}
        {pendingIdeas.length > 0 && (
          <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.6)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600 }}>📌 待实践想法（{pendingIdeas.length}）</span>
              <button
                onClick={handleAutoExplore}
                disabled={isExploring}
                style={{ padding: '6px 12px', background: isExploring ? '#4b5563' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', border: 'none', borderRadius: 6, cursor: isExploring ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                ⚡ 自动探索最高优先级
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingIdeas.slice(0, 10).map(idea => {
                // 状态标签：usePendingIdeas 只返回 new/pending，明确映射为文字标签
                const statusLabel = idea.practiceStatus === 'new' ? '新' : idea.practiceStatus === 'pending' ? '待跟进' : idea.practiceStatus;
                const statusColor = idea.practiceStatus === 'new' ? '#60a5fa' : '#fbbf24';
                // 重要性标签：high/medium/low → 高/中/低
                const importanceLabel = idea.importance === 'high' ? '高' : idea.importance === 'medium' ? '中' : '低';
                const importanceColor = idea.importance === 'high' ? '#f87171' : idea.importance === 'medium' ? '#fbbf24' : '#94a3b8';
                return (
                <div
                  key={idea.id}
                  onClick={() => setIdeaText(idea.content)}
                  title={`优先级 ${idea.priorityScore?.toFixed(1) ?? '?'} · 状态：${statusLabel} · 重要性：${importanceLabel} · 点击填入输入框`}
                  style={{ padding: '6px 8px', background: 'rgba(30,30,60,0.5)', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                >
                  <span style={{ color: '#fbbf24', fontWeight: 700, minWidth: 36 }}>★{idea.priorityScore?.toFixed(1) ?? '?'}</span>
                  <span style={{ flex: 1, color: '#e5e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.content}</span>
                  <span style={{ padding: '1px 6px', background: `${statusColor}33`, color: statusColor, borderRadius: 3, fontSize: 10, fontWeight: 600, border: `1px solid ${statusColor}66` }}>{statusLabel}</span>
                  <span style={{ padding: '1px 6px', background: `${importanceColor}22`, color: importanceColor, borderRadius: 3, fontSize: 10, border: `1px solid ${importanceColor}44` }}>{importanceLabel}</span>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 想法输入 */}
        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.6)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
          <textarea
            value={ideaText}
            onChange={e => setIdeaText(e.target.value)}
            placeholder="输入一个想法，AI 会自动发现问题、探索并证伪…"
            rows={3}
            style={{ width: '100%', padding: 8, background: 'rgba(20,20,40,0.7)', color: '#e5e7ff', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => handleStartExplore()}
            disabled={isExploring}
            style={{ marginTop: 8, padding: '8px 18px', background: isExploring ? '#4b5563' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', border: 'none', borderRadius: 6, cursor: isExploring ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            {isExploring ? '⏳ 探索中…' : '🚀 开始探索'}
          </button>

          {stage && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#a5b4fc' }}>
              阶段：{stage}
              {currentRound > 0 && <span style={{ marginLeft: 12, color: '#fbbf24' }}>第 {currentRound}/{maxRounds} 轮</span>}
              {totalConflicts > 0 && <span style={{ marginLeft: 12, color: '#f87171' }}>冲突：{totalConflicts}</span>}
            </div>
          )}
          {progress > 0 && progress < 100 && (
            <div style={{ marginTop: 6, height: 4, background: 'rgba(30,30,60,0.6)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1 0%, #a78bfa 100%)', transition: 'width 0.3s' }} />
            </div>
          )}

          {logs.length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'rgba(0,0,0,0.4)', borderRadius: 4, maxHeight: 200, overflow: 'auto', fontFamily: 'Consolas, monospace', fontSize: 11, color: '#94a3b8' }}>
              {logs.map((l, i) => <div key={i} style={{ lineHeight: 1.5 }}>{l}</div>)}
            </div>
          )}
        </div>

        {/* AMiner 搜索结果 */}
        {showAminerResults && aminerPapers.length > 0 && (
          <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.6)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600 }}>📚 AMiner 学术文献（{aminerPapers.length}）</span>
              <button onClick={() => setShowAminerResults(false)} style={{ padding: '2px 8px', background: 'rgba(30,30,60,0.6)', color: '#94a3b8', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>收起</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {aminerPapers.slice(0, 15).map((p, i) => (
                <div key={i} style={{ padding: '6px 8px', background: 'rgba(30,30,60,0.5)', borderRadius: 4, fontSize: 12 }}>
                  <div style={{ color: '#e5e7ff', fontWeight: 600 }}>{p.title || p.title_zh || '未知'}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                    {Array.isArray(p.authors) ? p.authors.map((a: any) => typeof a === 'string' ? a : (a.name || a.name_zh)).filter(Boolean).join(', ') : ''}
                    {' · '}{p.year || '未知'}{' · 引用 '}{p.n_citation ?? p.citationCount ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 探索摘要 */}
        {summary && (
          <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.6)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600, marginBottom: 6 }}>📋 探索摘要</div>
            <div style={{ fontSize: 12, color: '#e5e7ff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{summary}</div>
          </div>
        )}

        {/* 探索历史 */}
        {history.length > 0 && (
          <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.6)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.25)' }}>
            <div style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>🕘 探索历史（{history.length}）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {history.slice(0, 20).map(h => (
                <div key={h.id} style={{ padding: '6px 8px', background: 'rgba(30,30,60,0.5)', borderRadius: 4 }}>
                  <div
                    onClick={() => setExpandedHistoryId(expandedHistoryId === h.id ? null : h.id)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                  >
                    <span style={{ color: '#fbbf24' }}>{expandedHistoryId === h.id ? '▼' : '▶'}</span>
                    <span style={{ flex: 1, color: '#e5e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.idea}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{h.rounds}轮·{h.conflicts}冲突</span>
                  </div>
                  {expandedHistoryId === h.id && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                      <div style={{ color: '#a5b4fc', marginBottom: 4 }}>{h.summary}</div>
                      <div style={{ fontFamily: 'Consolas, monospace', maxHeight: 150, overflow: 'auto' }}>
                        {h.logs.map((l, i) => <div key={i}>{l}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 实验报告面板 */}
        <div style={{ marginBottom: 12 }}>
          <ErrorBoundary name="实验报告面板">
            <Suspense fallback={suspenseFallback}>
              {/* @ts-ignore */}
              <ExperimentReportPanel reportId={demoReportId} />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* 探索时间线 */}
        <div style={{ marginBottom: 12, padding: 12, background: 'rgba(10,10,30,0.4)', borderRadius: 8, border: '1px solid rgba(165,180,252,0.2)' }}>
          <div style={{ fontSize: 13, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>🧭 探索时间线</div>
          <ErrorBoundary name="探索时间线">
            <Suspense fallback={suspenseFallback}>
              <ExplorationTimeline />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

/** 星空图谱 */
function GraphViewPage() {
  // 从星座store读取数据
  const { stars, edges: storeEdges, removeConstellation, removeStar, constellations } = useConstellationStore();

  // 示例节点（仅在星座store为空时作为演示）
  const defaultNodes = useMemo(() => [
    { id: 'n1', label: '机器学习', x: 20, y: 30, size: 8, category: 'AI', color: '#60a5fa' },
    { id: 'n2', label: '深度学习', x: 35, y: 20, size: 6, category: 'AI', color: '#60a5fa' },
    { id: 'n3', label: '神经网络', x: 50, y: 35, size: 7, category: 'AI', color: '#60a5fa' },
    { id: 'n4', label: 'Transformer', x: 65, y: 25, size: 6, category: 'AI', color: '#60a5fa' },
    { id: 'n5', label: '知识图谱', x: 80, y: 40, size: 8, category: '知识', color: '#a78bfa' },
    { id: 'n6', label: '图数据库', x: 70, y: 60, size: 5, category: '知识', color: '#a78bfa' },
    { id: 'n7', label: 'RAG', x: 45, y: 55, size: 7, category: '应用', color: '#34d399' },
    { id: 'n8', label: 'Agent', x: 30, y: 70, size: 6, category: '应用', color: '#34d399' },
    { id: 'n9', label: 'Prompt工程', x: 55, y: 75, size: 5, category: '应用', color: '#34d399' },
    { id: 'n10', label: '第一性原理', x: 15, y: 50, size: 6, category: '思维', color: '#fbbf24' },
  ], []);

  const defaultEdges = useMemo(() => [
    { from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' }, { from: 'n4', to: 'n5' },
    { from: 'n5', to: 'n6' }, { from: 'n6', to: 'n7' },
    { from: 'n7', to: 'n8' }, { from: 'n8', to: 'n9' },
    { from: 'n9', to: 'n7' }, { from: 'n1', to: 'n10' },
    { from: 'n10', to: 'n8' }, { from: 'n3', to: 'n7' },
  ], []);

  // 节点位置用 useState 管理，支持拖拽更新
  // 初始用示例节点；当星座store有数据时，用store的star
  const [nodes, setNodes] = useState(defaultNodes);
  // 标记节点是否被用户拖拽过（拖拽过的节点位置不被store覆盖）
  const [draggedIds, setDraggedIds] = useState<Set<string>>(new Set());

  // 监听星座store的stars变化：同步新节点，保留已拖拽节点的位置
  useEffect(() => {
    if (stars.length === 0) {
      // store为空，用示例节点
      setNodes(defaultNodes);
      setDraggedIds(new Set());
      return;
    }

    // 把 StarNode 转为图谱节点格式
    setNodes(prevNodes => {
      const prevMap = new Map(prevNodes.map(n => [n.id, n]));
      const nextNodes = stars.map(s => {
        const color = STAR_TYPE_COLORS[s.type] || '#ffffff';
        // 如果节点已存在且被拖拽过，保留原位置
        if (prevMap.has(s.id) && draggedIds.has(s.id)) {
          const prev = prevMap.get(s.id)!;
          return { ...prev, label: s.label, size: s.size, category: s.type, color };
        }
        // 否则用store的位置
        return {
          id: s.id,
          label: s.label,
          x: s.x,
          y: s.y,
          size: s.size,
          category: s.type,
          color,
        };
      });
      return nextNodes;
    });
  }, [stars, defaultNodes, draggedIds]);

  // 边：store有数据用store的，否则用示例
  const edges = useMemo<Array<{ from: string; to: string; relation?: string }>>(() => {
    if (stars.length === 0) return defaultEdges;
    return storeEdges.map(e => ({ from: e.from, to: e.to, relation: e.relation }));
  }, [stars.length, storeEdges, defaultEdges]);

  // 拖拽状态
  const [dragId, setDragId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 选中的星标（点击查看详情）
  const [selectedStarId, setSelectedStarId] = useState<string | null>(null);
  // 鼠标按下起始坐标（用于区分点击和拖拽）
  const mouseDownPos = useRef<{ x: number; y: number; id: string } | null>(null);
  const [showManager, setShowManager] = useState(false);

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  // 从星座store获取完整star数据（含detail等字段）
  const starMap = useMemo(() => new Map(stars.map(s => [s.id, s])), [stars]);

  // 鼠标拖拽处理
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragId(id);
    mouseDownPos.current = { x: e.clientX, y: e.clientY, id };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // 限制在 0-100 范围内
    const cx = Math.max(2, Math.min(98, x));
    const cy = Math.max(2, Math.min(98, y));
    setNodes(prev => prev.map(n => n.id === dragId ? { ...n, x: cx, y: cy } : n));
    // 标记该节点已被拖拽
    setDraggedIds(prev => {
      if (prev.has(dragId)) return prev;
      const next = new Set(prev);
      next.add(dragId);
      return next;
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // 判断是点击还是拖拽：移动距离 < 5px 视为点击
    if (mouseDownPos.current) {
      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) {
        // 点击：选中星标显示详情
        setSelectedStarId(mouseDownPos.current.id);
      }
      mouseDownPos.current = null;
    }
    setDragId(null);
  };

  // 图例颜色：优先用星类型颜色，store为空时用示例分类
  const legendItems = useMemo(() => {
    if (stars.length === 0) {
      return [
        { label: 'AI', color: '#60a5fa' },
        { label: '知识', color: '#a78bfa' },
        { label: '应用', color: '#34d399' },
        { label: '思维', color: '#fbbf24' },
      ];
    }
    // 用星类型作为图例
    return [
      { label: '问题', color: STAR_TYPE_COLORS.question },
      { label: '子问题', color: STAR_TYPE_COLORS['sub-question'] },
      { label: '假设', color: STAR_TYPE_COLORS.hypothesis },
      { label: '证据', color: STAR_TYPE_COLORS.evidence },
      { label: '结论', color: STAR_TYPE_COLORS.conclusion },
      { label: '想法', color: STAR_TYPE_COLORS.idea },
    ];
  }, [stars.length]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'relative', height: '100%',
        borderRadius: 8, overflow: 'hidden',
        cursor: dragId ? 'grabbing' : 'default',
      }}
    >
      {/* 壁纸背景：满画质 */}
      <img
        src="/bg/star-bg.jpg"
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      {/* 渐变遮罩 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,10,0.2) 0%, rgba(0,0,10,0.4) 100%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* SVG 星座连线 */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="rgba(165,180,252,0.7)" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const from = nodeMap.get(e.from);
          const to = nodeMap.get(e.to);
          if (!from || !to) return null;
          // 中点用于放置关系标签
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={i}>
              <line
                x1={`${from.x}%`} y1={`${from.y}%`}
                x2={`${to.x}%`} y2={`${to.y}%`}
                stroke="rgba(165,180,252,0.4)" strokeWidth="1"
                markerEnd="url(#arrowhead)"
              />
              {e.relation && (
                <g>
                  <rect
                    x={`${midX}%`} y={`${midY}%`}
                    width={e.relation.length * 7 + 6} height="14"
                    rx="3" ry="3"
                    transform={`translate(${-(e.relation.length * 7 + 6) / 2}, -7)`}
                    fill="rgba(10,10,30,0.85)"
                    stroke="rgba(165,180,252,0.3)" strokeWidth="0.5"
                  />
                  <text
                    x={`${midX}%`} y={`${midY}%`}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fill="rgba(165,180,252,0.9)"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >{e.relation}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* 知识节点 - 可拖拽，带发光效果 */}
      {nodes.map(n => {
        const color = n.color || '#ffffff';
        return (
          <div
            key={n.id}
            onMouseDown={(e) => handleMouseDown(e, n.id)}
            style={{
              position: 'absolute', left: `${n.x}%`, top: `${n.y}%`,
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: 'grab',
              zIndex: dragId === n.id ? 10 : 1,
              transition: dragId ? 'none' : 'left 0.1s, top 0.1s',
            }}
          >
            <div style={{
              width: n.size * 3, height: n.size * 3,
              borderRadius: '50%',
              background: color,
              boxShadow: `0 0 ${n.size * 2}px ${color}, 0 0 ${n.size * 4}px ${color}66`,
              opacity: dragId === n.id ? 1 : 0.9,
            }} />
            <span style={{
              marginTop: 4, fontSize: 11, color: '#e5e7ff',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{n.label}</span>
          </div>
        );
      })}

      {/* 星标详情面板 */}
      {selectedStarId && (() => {
        const star = starMap.get(selectedStarId);
        const node = nodeMap.get(selectedStarId);
        if (!star && !node) return null;
        const typeLabel: Record<string, string> = {
          'question': '问题', 'sub-question': '子问题', 'hypothesis': '假设',
          'evidence': '证据', 'conclusion': '结论', 'idea': '想法',
        };
        const statusLabel: Record<string, string> = {
          'discovered': '已发现', 'researching': '研究中', 'verified': '已验证',
          'falsified': '已证伪', 'synthesized': '已综合',
        };
        const methodLabel: Record<string, string> = {
          'socratic': '苏格拉底法', 'five-whys': '五问法', 'first-principles': '第一性原理',
        };
        const label = star?.label || node?.label || '未知';
        const type = star?.type || node?.category || 'unknown';
        const detail = star?.detail;
        const methodology = star?.methodology;
        const status = star?.status;
        const createdAt = star?.createdAt;
        const color = node?.color || STAR_TYPE_COLORS[type as keyof typeof STAR_TYPE_COLORS] || '#ffffff';
        return (
          <div style={{
            position: 'absolute', top: 12, right: 12,
            width: 320, maxHeight: '70%',
            background: 'rgba(10,10,30,0.92)',
            borderRadius: 10, padding: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            border: '1px solid rgba(165,180,252,0.3)',
            zIndex: 20, overflowY: 'auto',
            color: '#e5e7ff',
          }}>
            {/* 关闭按钮 */}
            <button
              onClick={() => setSelectedStarId(null)}
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: '#94a3b8', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>

            {/* 星标标题 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingRight: 28 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', lineHeight: 1.4 }}>{label}</div>
            </div>

            {/* 类型标签 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: `${color}33`, color, border: `1px solid ${color}55` }}>
                {typeLabel[type] || type}
              </span>
              {methodology && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                  {methodLabel[methodology] || methodology}
                </span>
              )}
              {status && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                  {statusLabel[status] || status}
                </span>
              )}
            </div>

            {/* 详细内容 */}
            {detail && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>详细内容：</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 6 }}>
                  {detail}
                </div>
              </div>
            )}

            {/* 创建时间 */}
            {createdAt && (
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                创建于：{new Date(createdAt).toLocaleString('zh-CN')}
              </div>
            )}

            {/* 如果是示例节点（无store数据） */}
            {!star && node && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                示例节点 · 分类：{node.category}
              </div>
            )}

            {/* 删除此星按钮（仅store中的星可删除） */}
            {star && (
              <button
                onClick={() => {
                  if (confirm(`确认删除星标「${label}」？其所有连线将一并移除。`)) {
                    removeStar(selectedStarId);
                    setSelectedStarId(null);
                  }
                }}
                style={{
                  marginTop: 12, width: '100%', padding: '6px 8px', fontSize: 12,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                  color: '#f87171', borderRadius: 6, cursor: 'pointer',
                }}
              >🗑️ 删除此星</button>
            )}
          </div>
        );
      })()}

      {/* 星座管理按钮 */}
      <button
        onClick={() => setShowManager(!showManager)}
        style={{
          position: 'absolute', top: 12, right: 12,
          padding: '6px 12px', fontSize: 12,
          background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(165,180,252,0.3)',
          color: '#a5b4fc', borderRadius: 6, cursor: 'pointer', zIndex: 20,
        }}
      >⚙️ 星座管理</button>

      {/* 星座管理面板 */}
      {showManager && (
        <div style={{
          position: 'absolute', top: 48, right: 12, width: 300, maxHeight: '70%',
          background: 'rgba(10,10,30,0.92)', borderRadius: 10, padding: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid rgba(165,180,252,0.3)',
          zIndex: 20, overflowY: 'auto', color: '#e5e7ff',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 14, color: '#a5b4fc', fontWeight: 500 }}>星座管理系统</span>
            <button onClick={() => setShowManager(false)} style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>

          {/* 存储统计 */}
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>
            <div>⭐ 活跃星座：{constellations.length} 个 · 星标：{stars.length} 个 · 连线：{storeEdges.length} 条</div>
            <div>💾 localStorage：约 {Math.round(JSON.stringify({stars,edges:storeEdges}).length / 1024)} KB / 5MB</div>
          </div>

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={() => {
                if (confirm(`确认清空全部 ${constellations.length} 个星座？归档数据保留在磁盘。`)) {
                  for (const c of constellations) removeConstellation(c.id);
                }
              }}
              style={{ flex: 1, padding: '4px 8px', fontSize: 11, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', borderRadius: 4, cursor: 'pointer' }}
            >🗑 清空全部</button>
          </div>

          {/* 星座列表 */}
          <div style={{ fontSize: 11, marginBottom: 4, color: '#cbd5e1' }}>星座列表：</div>
          {constellations.map(c => {
            const cStars = stars.filter(s => s.constellationId === c.id);
            return (
              <div key={c.id} style={{
                padding: '6px 8px', marginBottom: 4,
                background: 'rgba(255,255,255,0.05)', borderRadius: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: '#e5e7ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name.slice(0, 25)}{c.name.length > 25 ? '…' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {cStars.length} 颗星 · {new Date(c.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric' })}
                      {c.methodology && ` · ${c.methodology}`}
                    </div>
                  </div>
                  <button
                    onClick={() => { if (confirm('删除此星座？（归档保留在磁盘）')) removeConstellation(c.id); }}
                    style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >删除星座</button>
                </div>
                {/* 星列表：每颗星可单独删除 */}
                {cStars.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {cStars.map(s => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px', background: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                        <span style={{ fontSize: 10, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                          {STAR_TYPE_ICONS[s.type] || '•'} {s.label}
                        </span>
                        <button
                          onClick={() => { if (confirm(`删除星标「${s.label}」？`)) removeStar(s.id); }}
                          style={{ fontSize: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}
                          title="删除此星"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {constellations.length === 0 && (
            <div style={{ fontSize: 11, color: '#4b5563', padding: 8, textAlign: 'center' }}>
              暂无星座 · 在Research区探索后自动生成
            </div>
          )}
        </div>
      )}

      {/* 图例 */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12,
        background: 'rgba(10,10,30,0.75)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          {stars.length > 0 ? `知识星座图（${stars.length} 颗星）` : '知识星座图（示例）'}
        </div>
        {legendItems.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, boxShadow: `0 0 4px ${item.color}` }} />
            <span style={{ fontSize: 10, color: '#cbd5e1' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 📊 WPS助手：子标签页切换 模板库 / PPT制作 / 文章写作 / PPT进修 */
function WpsView() {
  const [sub, setSub] = useState<'template' | 'ppt' | 'article' | 'study'>('template');
  const subTabs: Array<{ key: typeof sub; label: string }> = [
    { key: 'template', label: '📚 模板库' },
    { key: 'ppt', label: '🎯 PPT制作' },
    { key: 'article', label: '✍️ 文章写作' },
    { key: 'study', label: '📚 PPT进修' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 12px',
          background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
          borderBottom: '1px solid #dee2e6',
        }}
      >
        {subTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              padding: '8px 18px',
              background: sub === t.key
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'white',
              color: sub === t.key ? 'white' : '#495057',
              border: '1px solid #dee2e6',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              boxShadow: sub === t.key ? '0 2px 6px rgba(59,130,246,0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {sub === 'template' && (
          <ErrorBoundary name="模板库">
            <Suspense fallback={suspenseFallback}>
              {/* @ts-ignore */}
              <TemplateLibrary />
            </Suspense>
          </ErrorBoundary>
        )}
        {sub === 'ppt' && (
          <ErrorBoundary name="PPT制作">
            <Suspense fallback={suspenseFallback}>
              {/* @ts-ignore */}
              <PPTMakerPanel />
            </Suspense>
          </ErrorBoundary>
        )}
        {sub === 'article' && (
          <ErrorBoundary name="文章写作">
            <Suspense fallback={suspenseFallback}>
              {/* @ts-ignore */}
              <ArticleWriterPanel />
            </Suspense>
          </ErrorBoundary>
        )}
        {sub === 'study' && (
          <ErrorBoundary name="PPT进修">
            <Suspense fallback={suspenseFallback}>
              {/* @ts-ignore */}
              <PPTStudyPanel />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

// ============================================
// 主应用
// ============================================

/**
 * LLM Wiki 主应用
 * - 启动时自动确保数据目录存在（D:\code\llm-wiki-data）
 * - 打开即用，无需创建/选择项目
 * - 顶部显示数据目录路径
 * - 6 个标签页：知识库 / Read区 / Research区 / 星空图谱 / WPS助手 / AI对话
 */
export default function App() {
  const [dataDir, setDataDir] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('wiki');
  // 离开 AI 对话区时询问保存到知识库（非阻塞模态）
  const [showSaveChatDialog, setShowSaveChatDialog] = useState(false);
  const [pendingView, setPendingView] = useState<ViewKey | null>(null);
  const [chatSessionInfo, setChatSessionInfo] = useState<{ title: string; messageCount: number; lastUpdate: number } | null>(null);
  // 知识库夜间更新状态
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // 初始化：确保数据目录存在并获取路径
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const dir = await invoke<string>('ensure_data_dir');
        if (!cancelled) setDataDir(dir);

      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // 启动夜间定时器（只在挂载时启动一次）
  useEffect(() => {
    try {
      // 读取上次更新时间（模块级变量）
      const last = getLastUpdateTime();
      if (last) setLastUpdateTime(last);

      startNightlyTimer(() => {
        setLastUpdateTime(new Date().toISOString());
      });
    } catch (e) {
      console.error('启动夜间定时器失败:', e);
    }

    // 清理函数：组件卸载时停止定时器
    return () => {
      try {
        stopNightlyTimer();
      } catch (e) {
        console.warn('停止夜间定时器失败:', e);
      }
    };
  }, []);

  // 监听Rust端on_webview_event发出的knowledge-updated Tauri事件
  // Rust端拖拽回调复制文件后通过webview.emit("knowledge-updated")通知前端
  // 这里桥接Tauri事件 → DOM事件，WikiView监听DOM事件刷新文件列表
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import('@tauri-apps/api/event').then(async ({ listen }) => {
      const fn = await listen('knowledge-updated', () => {
        // 桥接：Tauri事件 → DOM事件，触发WikiView刷新
        window.dispatchEvent(new Event('knowledge-updated'));
      });
      if (cancelled) { fn(); } else { unlisten = fn; }
    }).catch(e => console.error('knowledge-updated事件监听注册失败:', e));
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  /** 手动触发知识库更新 */
  const handleManualUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await triggerManualUpdate();
      setLastUpdateTime(new Date().toISOString());
    } catch (e) {
      console.error('手动更新失败:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  /** 把当前最近一次有内容的 AI 对话整理为 markdown 保存到 knowledge 目录 */
  const saveChatToKnowledge = async () => {
    try {
      const json = await invoke<string>('read_json_file', { filename: 'chat-sessions.json' });
      const sessions = JSON.parse(json);
      if (!Array.isArray(sessions) || sessions.length === 0) return;
      const withContent = sessions.filter((s: any) => s.messages && s.messages.length > 0);
      if (withContent.length === 0) return;
      const latest = withContent.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];

      const lines: string[] = [];
      lines.push(`# ${latest.title || 'AI对话记录'}`);
      lines.push('');
      lines.push(`> 保存时间：${new Date().toLocaleString('zh-CN')}`);
      lines.push(`> 消息数：${latest.messages.length}`);
      lines.push('');
      for (const msg of latest.messages) {
        const role = msg.role === 'user' ? '## 🧑 用户' : '## 🤖 AI';
        lines.push(role);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
      const markdown = lines.join('\n');
      const filename = `knowledge/chat-${new Date(latest.updatedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
      // btoa 不支持 UTF-8，用 unescape(encodeURIComponent(...)) 安全编码中文
      const base64 = btoa(unescape(encodeURIComponent(markdown)));
      await invoke('write_binary_file', { filename, base64Data: base64 });
    } catch (e) {
      console.error('保存对话到知识库失败', e);
    }
  };

  /**
   * 包装 setActiveView：从 AI 对话切出时，若有内容则弹模态询问是否保存到知识库。
   * UX 中断原则：主动询问但不强制，模态对话框非阻塞式确认。
   */
  const handleViewChange = async (newView: ViewKey) => {
    if (activeView === 'ai' && newView !== 'ai') {
      try {
        const json = await invoke<string>('read_json_file', { filename: 'chat-sessions.json' });
        const sessions = JSON.parse(json);
        if (Array.isArray(sessions) && sessions.length > 0) {
          const withContent = sessions.filter((s: any) => s.messages && s.messages.length > 0);
          if (withContent.length > 0) {
            const latest = withContent.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
            setChatSessionInfo({ title: latest.title, messageCount: latest.messages.length, lastUpdate: latest.updatedAt });
            setPendingView(newView);
            setShowSaveChatDialog(true);
            return; // 不直接切换，等用户选择
          }
        }
      } catch (e) { console.error('读取会话失败', e); }
    }
    setActiveView(newView);
  };


  if (loading) {
    return (
      <div style={styles.center}>
        <div>加载中...</div>
      </div>
    );
  }

  // 主界面：打开即用
  return (
    <div style={styles.appColumn}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>LLM Wiki</h1>
          <span style={styles.breadcrumb}>/ llm-wiki-data</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* 知识库更新状态 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {lastUpdateTime && (
              <span title="上次知识库更新时间">
                上次更新: {new Date(lastUpdateTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleManualUpdate}
              disabled={isUpdating}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                background: isUpdating ? 'rgba(107,114,128,0.3)' : 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.3)',
                color: isUpdating ? 'rgba(255,255,255,0.4)' : '#a5b4fc',
                borderRadius: 4,
                cursor: isUpdating ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {isUpdating ? '⏳ 更新中…' : '🔄 手动更新知识库'}
            </button>
          </div>
          <span style={styles.dataPath} title={dataDir}>
            数据目录: {dataDir}
          </span>
        </div>
      </header>
      <nav style={styles.tabs}>
        {(Object.keys(VIEW_LABELS) as ViewKey[]).map(v => (
          <button
            key={v}
            onClick={() => handleViewChange(v)}
            style={{
              ...styles.tab,
              ...(activeView === v ? styles.tabActive : {}),
            }}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </nav>
      <main style={styles.main}>
        {error && <p style={styles.errorText}>{error}</p>}
        {activeView === 'wiki' && (
          <ErrorBoundary name="WikiView">
            <WikiView />
          </ErrorBoundary>
        )}
        {activeView === 'read' && (
          <ErrorBoundary name="ReadView">
            <ReadView />
          </ErrorBoundary>
        )}
        {activeView === 'research' && (
          <ErrorBoundary name="ResearchView">
            <ResearchView />
          </ErrorBoundary>
        )}
        {activeView === 'graph' && (
          <ErrorBoundary name="星空图谱">
            <GraphViewPage />
          </ErrorBoundary>
        )}
        {activeView === 'wps' && <WpsView />}
        {activeView === 'ai' && (
          <ErrorBoundary name="AiChatPanel">
            <AiChatPanel />
          </ErrorBoundary>
        )}
      </main>
      {/* 离开 AI 对话区时询问是否保存到知识库（App 层级渲染，不被切走组件卸载影响） */}
      {showSaveChatDialog && pendingView && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>💾 保存对话到知识库？</h3>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
              当前对话「{chatSessionInfo?.title}」有 {chatSessionInfo?.messageCount} 条消息。
              是否将本次问答整理保存到知识库？
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowSaveChatDialog(false); setPendingView(null); }} style={{ padding: '6px 16px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>取消</button>
              <button onClick={() => { setActiveView(pendingView); setShowSaveChatDialog(false); setPendingView(null); }} style={{ padding: '6px 16px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>不保存</button>
              <button onClick={async () => { await saveChatToKnowledge(); setActiveView(pendingView); setShowSaveChatDialog(false); setPendingView(null); }} style={{ padding: '6px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** AI 对话面板 - 豆包式多会话管理 + 日漫青春背景 */
interface ChatMsg { role: 'user' | 'assistant'; content: string; api?: string; ts: number }
interface ChatSession { id: string; title: string; createdAt: number; updatedAt: number; messages: ChatMsg[] }

/**
 * 单条消息内容渲染：用 useMemo 缓存 marked.parse + DOMPurify.sanitize 结果，
 * 避免每次父组件重渲染都重新解析 Markdown，同时防止 XSS。
 */
function ChatMessageContent({ msg }: { msg: ChatMsg }) {
  const html = useMemo(() => {
    // 先用 katex 把 LaTeX 公式转为 HTML，再交给 marked 解析剩余 Markdown 语法
    const withLatex = renderLatex(msg.content);
    return DOMPurify.sanitize(marked.parse(withLatex) as string, {
      ADD_TAGS: ['span', 'div'],
      ADD_ATTR: ['class', 'style'],
    });
  }, [msg.content]);
  if (msg.role === 'user') {
    return <div style={styles.bubbleContent}>{msg.content}</div>;
  }
  return (
    <div
      className="md-body"
      style={styles.bubbleContent}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function AiChatPanel() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set());
  const loadedRef = useRef(false);

  const activeSession = sessions.find(s => s.id === activeId) || null;
  const history = activeSession?.messages ?? [];

  // 初始化：从磁盘加载会话
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await invoke<string>('read_json_file', { filename: 'chat-sessions.json' });
        const saved = JSON.parse(json);
        if (!cancelled && Array.isArray(saved) && saved.length > 0) {
          setSessions(saved);
          setActiveId(saved[0].id);
        }
      } catch (e) { console.error('加载会话失败', e); }
      if (!cancelled) loadedRef.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  // 自动保存
  useEffect(() => {
    if (!loadedRef.current) return;
    invoke('write_json_file', { filename: 'chat-sessions.json', content: JSON.stringify(sessions) })
      .catch(e => console.error('保存会话失败', e));
  }, [sessions]);

  const newSession = () => {
    const s: ChatSession = { id: Date.now().toString(36), title: '新对话', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
    setSelectMode(false);
  };

  const deleteSession = (id: string) => {
    const next = sessions.filter(s => s.id !== id);
    setSessions(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const updateSession = (id: string, fn: (s: ChatSession) => ChatSession) => {
    setSessions(prev => prev.map(s => s.id === id ? fn(s) : s));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || busy || !activeId) return;
    const sessionId = activeId;
    setInput('');
    setBusy(true);
    setLastError(null);

    const userMsg: ChatMsg = { role: 'user', content: text, ts: Date.now() };
    const nextMsgs = [...history, userMsg];
    updateSession(sessionId, s => ({ ...s, messages: nextMsgs, updatedAt: Date.now(), title: s.messages.length === 0 ? text.slice(0, 24) : s.title }));

    const messages: ChatMessage[] = [
      { role: 'system', content: AI_CHAT_SYSTEM_PROMPT },
      ...nextMsgs.map(m => ({ role: m.role, content: m.content })),
    ];
    try {
      const result = await chat(messages);

      if (result.success) {
        updateSession(sessionId, s => ({ ...s, messages: [...s.messages, { role: 'assistant', content: result.content, api: result.apiUsed, ts: Date.now() }], updatedAt: Date.now() }));
      } else {
        setLastError(result.error ?? '未知错误');
        updateSession(sessionId, s => ({ ...s, messages: [...s.messages, { role: 'assistant', content: `（请求失败：${result.error ?? '未知错误'}）`, api: 'none', ts: Date.now() }], updatedAt: Date.now() }));
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      setLastError(errMsg);
      updateSession(sessionId, s => ({ ...s, messages: [...s.messages, { role: 'assistant', content: `（请求异常：${errMsg}）`, api: 'none', ts: Date.now() }], updatedAt: Date.now() }));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSend(); }
  };

  const fmtTs = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ ...styles.chatWrap, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
      {/* 壁纸背景 */}
      <img src="/bg/anime-bg.jpg" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* 左侧：会话列表（豆包式） */}
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.2)', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.3)' }}>
        <button onClick={newSession} style={{ margin: 10, padding: '8px', background: 'rgba(59,130,246,0.9)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>+ 新建对话</button>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 6px' }}>
          {sessions.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>暂无对话</div>}
          {sessions.map(s => (
            <div key={s.id} onClick={() => { setActiveId(s.id); setSelectMode(false); setSelectedIdx(new Set()); }} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
              background: s.id === activeId ? 'rgba(59,130,246,0.3)' : 'transparent', color: 'rgba(255,255,255,0.85)', fontSize: 13,
              transition: 'background .15s', border: s.id === activeId ? '1px solid rgba(59,130,246,0.5)' : '1px solid transparent',
            }} onMouseEnter={e => { if (s.id !== activeId) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }} onMouseLeave={e => { if (s.id !== activeId) e.currentTarget.style.background = 'transparent'; }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{s.messages.length}</span>
              <button onClick={e => { e.stopPropagation(); if (confirm('删除此对话？')) deleteSession(s.id); }} style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }} onMouseEnter={e => e.currentTarget.style.color='#ef4444'} onMouseLeave={e => e.currentTarget.style.color='rgba(255,255,255,0.3)'}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：对话区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, minWidth: 0 }}>
        {/* 顶部栏 */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>{activeSession?.title || 'AI 对话'}</strong>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Ctrl+Enter 发送</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {history.length > 0 && (
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIdx(new Set()); }} style={{ padding: '3px 10px', background: selectMode ? 'rgba(252,211,77,0.3)' : 'rgba(255,255,255,0.1)', color: selectMode ? '#fcd34d' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>{selectMode ? '取消' : '多选'}</button>
            )}
            {selectMode && selectedIdx.size > 0 && (
              <button onClick={() => { if (confirm(`删除选中的 ${selectedIdx.size} 条？`)) { updateSession(activeId!, s => ({ ...s, messages: s.messages.filter((_, i) => !selectedIdx.has(i)) })); setSelectedIdx(new Set()); setSelectMode(false); } }} style={{ padding: '3px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>删除({selectedIdx.size})</button>
            )}
          </div>
        </div>

        {/* 消息列表 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!activeSession && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40, fontSize: 14 }}>点击「新建对话」开始</div>}
          {activeSession && history.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40, fontSize: 14 }}>输入消息开始对话…</div>}
          {selectMode && history.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'rgba(252,211,77,0.15)', borderRadius: 6 }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={selectedIdx.size === history.length} onChange={e => setSelectedIdx(e.target.checked ? new Set(history.map((_, i) => i)) : new Set())} /> 全选
              </label>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>已选 {selectedIdx.size}/{history.length}</span>
            </div>
          )}
          {history.map((m, i) => (
            <div key={i} style={{ ...styles.chatBubble, ...(m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant), position: 'relative', outline: selectMode && selectedIdx.has(i) ? '2px solid #3b82f6' : 'none', outlineOffset: 2 }}>
              {selectMode ? (
                <input type="checkbox" checked={selectedIdx.has(i)} onChange={e => { const ns = new Set(selectedIdx); e.target.checked ? ns.add(i) : ns.delete(i); setSelectedIdx(ns); }} style={{ position: 'absolute', top: -8, left: -8, cursor: 'pointer' }} />
              ) : (
                <button onClick={() => updateSession(activeId!, s => ({ ...s, messages: s.messages.filter((_, idx) => idx !== i) }))} title="删除" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, background: 'rgba(255,255,255,0.9)', border: '1px solid #e5e7eb', borderRadius: '50%', cursor: 'pointer', fontSize: 12, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35 }} onMouseEnter={e => (e.currentTarget.style.opacity = '1', e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.opacity = '0.35', e.currentTarget.style.color = '#9ca3af')}>✕</button>
              )}
              <div style={{ fontSize: 10, opacity: 0.5, marginBottom: 3 }}>{m.role === 'user' ? '我' : 'AI'}{m.api && m.role === 'assistant' ? ` · ${m.api}` : ''} · {fmtTs(m.ts)}</div>
              <ChatMessageContent msg={m} />
            </div>
          ))}
          {busy && <div style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', padding: '6px 12px' }}>AI 思考中…</div>}
        </div>

        {lastError && <div style={{ color: '#fca5a5', fontSize: 12, padding: '4px 16px', background: 'rgba(239,68,68,0.1)' }}>错误：{lastError}</div>}

        {/* 输入区 */}
        <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.25)' }}>
          <textarea style={{ flex: 1, resize: 'none', padding: 8, borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', fontSize: 14, fontFamily: 'inherit', background: 'rgba(255,255,255,0.9)', color: '#1f2937' }} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="输入消息…" rows={3} disabled={busy || !activeId} />
          <button style={{ padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, alignSelf: 'flex-end' }} onClick={handleSend} disabled={busy || !input.trim() || !activeId}>{busy ? '发送中…' : '发送'}</button>
        </div>
      </div>
    </div>
  );
}

/** 内联样式集中管理 */
const styles: Record<string, React.CSSProperties> = {
  center: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  appColumn: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#f5f5f5',
  },
  header: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 50%, #1e3a5f 100%)',
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerTitle: { margin: 0, fontSize: 22, color: 'white', fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  breadcrumb: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  dataPath: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' },
  tabs: {
    display: 'flex',
    gap: 4,
    background: 'linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%)',
    padding: '6px 8px',
    borderBottom: '1px solid #dee2e6',
  },
  tab: {
    padding: '8px 20px',
    background: 'transparent',
    color: '#495057',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    borderRadius: 6,
    transition: 'all 0.2s',
    fontWeight: 500,
  },
  tabActive: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: 'white',
    boxShadow: '0 2px 6px rgba(59,130,246,0.4)',
  },
  main: { flex: 1, padding: 16, overflow: 'auto', background: '#f0f2f5', display: 'flex', flexDirection: 'column' },
  errorText: { color: 'red', fontSize: 14 },
  // AI 对话面板样式
  chatWrap: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  chatBubble: { maxWidth: '80%', padding: '8px 12px', borderRadius: 8, fontSize: 14 },
  bubbleUser: { alignSelf: 'flex-end', background: '#3b82f6', color: 'white' },
  bubbleAssistant: { alignSelf: 'flex-start', background: '#f1f5f9', color: '#1f2937' },
  bubbleContent: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};
