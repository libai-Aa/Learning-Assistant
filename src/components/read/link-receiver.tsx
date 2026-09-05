import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { invoke } from '@tauri-apps/api/core';
import { chat, type ChatMessage } from '@/lib/api/llm-client';
import { logger } from '@/lib/utils/logger';

const log = logger.module('LinkReceiver');

type LinkKind = 'wechat' | 'github' | 'web';
type HighlightType = 'underline' | 'red' | 'strikethrough';
interface Highlight { text: string; type: HighlightType; }

interface SavedLink {
  id: number; url: string; kind: LinkKind; title: string; createdAt: number;
  author: string; textContent: string; htmlContent: string;
  annotations: { id: string; text: string; createdAt: number; highlightRef?: string }[];
  ideas: { id: string; text: string; createdAt: number }[];
  highlights: Highlight[];
  loaded: boolean;
  htmlTruncated?: boolean;
}

const KIND_LABEL: Record<LinkKind,string> = { wechat:'微信公众号', github:'GitHub', web:'网页' };
const KIND_COLOR: Record<LinkKind,string> = { wechat:'#07c160', github:'#24292f', web:'#3b82f6' };

function identifyKind(url: string): LinkKind {
  try { const u = new URL(url);
    if (u.hostname==='mp.weixin.qq.com') return 'wechat';
    if (u.hostname==='github.com'||u.hostname.endsWith('.github.io')) return 'github';
  } catch {}
  return 'web';
}

function highlightStyle(type: HighlightType): React.CSSProperties {
  switch (type) {
    case 'red': return { color: '#dc2626', fontWeight: 600, background: 'transparent' };
    case 'strikethrough': return { textDecoration: 'line-through', textDecorationColor: '#ef4444', background: 'transparent' };
    case 'underline':
    default: return { textDecoration: 'underline', textDecorationColor: '#f59e0b', textUnderlineOffset: '2px', textDecorationThickness: '2px', background: 'transparent' };
  }
}

// 将 React.CSSProperties 转为 CSS 字符串（用于 DOM 操作设置 mark 标签样式）
function highlightStyleStr(type: HighlightType): string {
  const s = highlightStyle(type);
  return Object.entries(s).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`).join(';');
}

function renderMarked(text: string, hl: Highlight[], onRemove?: (h: Highlight) => void): React.ReactNode {
  if (!text) return null; if (!hl.length) return text;
  type Part = string | { h: Highlight };
  let parts: Part[] = [text];
  for (const h of hl) {
    if (!h.text) continue; const next: Part[] = [];
    for (const p of parts) {
      if (typeof p !== 'string') { next.push(p); continue; }
      const i = p.indexOf(h.text); if (i === -1) { next.push(p); continue; }
      if (i > 0) next.push(p.slice(0, i)); next.push({ h }); const r = p.slice(i + h.text.length); if (r) next.push(r);
    }
    parts = next;
  }
  return parts.map((p, i) => typeof p === 'string'
    ? React.createElement('span', { key: i }, p)
    : React.createElement('mark', {
        key: i,
        onClick: onRemove ? () => onRemove(p.h) : undefined,
        style: { ...highlightStyle(p.h.type), cursor: onRemove ? 'pointer' : 'default' },
        title: onRemove ? '点击取消标记' : undefined,
      }, p.h.text));
}

// 用 TreeWalker 遍历文本节点，渲染 LaTeX 公式定界符
// 注意：root 可能属于 DOMParser 创建的文档，必须用 root.ownerDocument 创建元素和 TreeWalker
function renderLatexInElement(root: Element | null | undefined) {
  if (!root) return;
  const ownerDoc = root.ownerDocument || document;
  const walker = ownerDoc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.textContent && node.textContent.length > 2) textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const text = textNode.textContent!;
    const parent = textNode.parentElement;
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue;

    const patterns: { regex: RegExp; display: boolean }[] = [
      { regex: /\$\$([\s\S]+?)\$\$/g, display: true },
      { regex: /\\\[([\s\S]+?)\\\]/g, display: true },
      { regex: /\$([^\$\n]+?)\$/g, display: false },
      { regex: /\\\(([\s\S]+?)\\\)/g, display: false },
    ];

    let result = text;
    let hasFormula = false;
    const placeholders: string[] = [];

    for (const { regex, display } of patterns) {
      result = result.replace(regex, (match, formula) => {
        try {
          const rendered = katex.renderToString(formula.trim(), { throwOnError: false, displayMode: display });
          const idx = placeholders.length;
          placeholders.push(rendered);
          hasFormula = true;
          return `\u0000FORMULA${idx}\u0000`;
        } catch {
          return match;
        }
      });
    }

    if (hasFormula) {
      const span = ownerDoc.createElement('span');
      span.innerHTML = result.replace(/\u0000FORMULA(\d+)\u0000/g, (_, idx) => placeholders[parseInt(idx)]);
      textNode.replaceWith(span);
    }
  }
}

export function LinkReceiver() {
  const [url, setUrl] = useState('');
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [readingId, setReadingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [annText, setAnnText] = useState<Record<number,string>>({});
  const [ideaText, setIdeaText] = useState<Record<number,string>>({});
  const loadedRef = useRef(false); // 标记是否已完成初始加载
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // 修复3：自动保存失败提示状态
  const [saveError, setSaveError] = useState(false);
  // 修复2：fetch 失败提示状态
  const [fetchFailed, setFetchFailed] = useState<string | null>(null);
  // 修复5：enterReading 竞态保护请求 id
  const reqIdRef = useRef(0);
  // 修复4：自动保存 debounce timer 句柄
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 修复6：图片代理竞态保护，跟踪最新 readingId
  const latestReadingIdRef = useRef<number | null>(null);
  // 问题5：浮动工具条位置与选中文本
  const [floatToolbar, setFloatToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
  // 问题3：列表中批注/想法折叠展开状态（按 link.id）
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  // AI 对话状态
  interface AiMsg { role: 'user' | 'assistant'; content: string; }
  const [aiMessages, setAiMessages] = useState<Record<number, AiMsg[]>>({});
  const [aiInput, setAiInput] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<number, boolean>>({});
  const aiScrollRef = useRef<HTMLDivElement>(null);

  // 图片内存缓存：key=原始http src, value=base64 data URL
  // 不写回 htmlContent，避免超过 150KB 存储上限导致内容被清空
  const [imgCache, setImgCache] = useState<Record<string, string>>({});

  // 记录代理失败的 src，避免死循环重复 fetch
  const failedSet = useRef<Set<string>>(new Set());

  const readingLink = links.find(l => l.id===readingId);

  // 修复8：JSON.parse 校验函数，逐字段兜底
  const normalizeSavedLink = (l: any): SavedLink => ({
    id: typeof l?.id === 'number' ? l.id : 0,
    url: typeof l?.url === 'string' ? l.url : '',
    kind: (l?.kind === 'wechat' || l?.kind === 'github' || l?.kind === 'web') ? l.kind : 'web',
    title: typeof l?.title === 'string' ? l.title : '',
    createdAt: typeof l?.createdAt === 'number' ? l.createdAt : 0,
    author: typeof l?.author === 'string' ? l.author : '',
    textContent: typeof l?.textContent === 'string' ? l.textContent : '',
    htmlContent: typeof l?.htmlContent === 'string' ? l.htmlContent : '',
    highlights: Array.isArray(l?.highlights)
      ? l.highlights.map((h: any): Highlight =>
          typeof h === 'string'
            ? { text: h, type: 'underline' }
            : { text: typeof h?.text === 'string' ? h.text : '', type: (h?.type === 'red' || h?.type === 'strikethrough') ? h.type : 'underline' }
        ).filter((h: Highlight) => h.text)
      : [],
    annotations: Array.isArray(l?.annotations) ? l.annotations : [],
    ideas: Array.isArray(l?.ideas) ? l.ideas : [],
    loaded: typeof l?.loaded === 'boolean' ? l.loaded : false,
    htmlTruncated: typeof l?.htmlTruncated === 'boolean' ? l.htmlTruncated : undefined,
  });

  // 处理抓取的 HTML：提取正文、处理图片懒加载、渲染公式
  const processFetchedHtml = (html: string, baseUrl: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const author = doc.querySelector('#js_name')?.textContent?.trim() || '';
    const el = doc.querySelector('#js_content') || doc.body;

    // 1. 图片懒加载属性扩展：data-src(微信) / data-original(jQuery) / data-lazy-src(lozad)
    const allImgs = el?.querySelectorAll('img') || [];

    allImgs.forEach(img => {
      // 先处理懒加载属性
      for (const attr of ['data-src', 'data-original', 'data-lazy-src']) {
        const val = img.getAttribute(attr);
        if (val) {
          if (val.startsWith('http')) { img.setAttribute('src', val); break; }
          if (val.startsWith('//')) { img.setAttribute('src', 'https:' + val); break; }
        }
      }
      // 相对路径转绝对 URL（GitHub 等常见 /assets/img.png，微信 //mmbiz.qpic.cn/...）
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        if (src.startsWith('//')) {
          img.setAttribute('src', 'https:' + src);
        } else {
          try { img.setAttribute('src', new URL(src, baseUrl).href); } catch {}
        }
      }
    });

    // 2. 移除无用元素（保留 SVG，因为微信文章公式是 MathJax 生成的 SVG 格式）
    el?.querySelectorAll('script,style,.qr_code_pc,.reward_area').forEach(n => n.remove());


    // 3. 渲染知乎 data-tex 公式
    el?.querySelectorAll('[data-tex]').forEach(node => {
      const tex = node.getAttribute('data-tex');
      if (tex) {
        try {
          const rendered = katex.renderToString(tex, { throwOnError: false, displayMode: node.tagName === 'DIV' || node.tagName === 'P' });
          const span = doc.createElement('span');
          span.innerHTML = rendered;
          node.replaceWith(span);
        } catch {}
      }
    });

    // 4. 渲染文本节点 LaTeX 定界符公式
    renderLatexInElement(el);

    const textContent = el?.textContent?.trim() || '';
    const htmlContent = el?.innerHTML?.trim() || '';
    return { author, textContent, htmlContent };
  };

  // 渲染时把 htmlContent 中的 http src 替换为 imgCache 中的 base64
  // 注意：HTML 中 & 可能被编码为 &amp;，需要同时替换两种形式
  const applyImgCache = (html: string): string => {
    let result = html;
    for (const [src, b64] of Object.entries(imgCache)) {
      // 替换 DOM 解码后的 src（& 形式）
      result = result.split(src).join(b64);
      // 替换 HTML 实体编码的 src（&amp; 形式）
      const encodedSrc = src.replace(/&/g, '&amp;');
      if (encodedSrc !== src) {
        result = result.split(encodedSrc).join(b64);
      }
    }
    return result;
  };

  // 在 htmlContent 中应用高亮：用 DOMParser 解析，遍历文本节点，将匹配高亮文本包裹在 <mark> 标签中
  // 这样在 htmlContent 模式下也能显示划线/标红/删除线
  const applyHighlights = (html: string, highlights: Highlight[]): string => {
    if (!highlights.length) return html;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const hl of highlights) {
        if (!hl.text) continue;
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
        const textNodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = node.textContent || '';
          if (text.includes(hl.text)) textNodes.push(node as Text);
        }
        for (const textNode of textNodes) {
          const text = textNode.textContent!;
          const idx = text.indexOf(hl.text);
          if (idx === -1) continue;
          const parent = textNode.parentElement;
          if (!parent) continue;
          // 跳过已在 mark 标签内的文本（避免重复嵌套）
          if (parent.tagName === 'MARK') continue;
          const before = text.slice(0, idx);
          const after = text.slice(idx + hl.text.length);
          const mark = doc.createElement('mark');
          mark.textContent = hl.text;
          mark.setAttribute('style', highlightStyleStr(hl.type));
          mark.setAttribute('data-hl-type', hl.type);
          mark.setAttribute('data-hl-text', hl.text);
          mark.title = '点击取消标记';
          mark.style.cursor = 'pointer';
          const frag = doc.createDocumentFragment();
          if (before) frag.appendChild(doc.createTextNode(before));
          frag.appendChild(mark);
          if (after) frag.appendChild(doc.createTextNode(after));
          parent.replaceChild(frag, textNode);
        }
      }
      return doc.body.innerHTML;
    } catch {
      return html; // 解析失败时返回原始 HTML
    }
  };

  // 初始化：从磁盘加载已保存的链接
  // 修复7：初始加载卸载保护，async 操作后检查 alive 再 setState
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const json = await invoke<string>('read_json_file', { filename: 'read-links.json' });
        const raw = JSON.parse(json);
        if (alive && Array.isArray(raw) && raw.length > 0) {
          const saved = raw.map(normalizeSavedLink);
          setLinks(saved);
        }
      } catch (e) { if (alive) log.error('加载链接失败', { error: String(e) }); }
      if (alive) loadedRef.current = true;
    })();
    return () => { alive = false; };
  }, []);

  // 自动保存：每次链接变化时写入磁盘（跳过初始加载前）
  // 修复4：debounce 500ms；修复3：失败提示；修复9：超限提示；修复10：大文章标记
  useEffect(() => {
    if (!loadedRef.current) return;
    // 修复9：超过50个链接提示
    if (links.length > 50) {
      log.warn(`链接数量超过50（当前 ${links.length}），保存时将截断为前50条`);
    }
    // debounce 500ms 后保存
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      // 保护措施：最多保存50个链接，超出则截断
      const toSave = links.length > 50 ? links.slice(0, 50) : links;
      // 修复10：htmlContent超过150KB的标记为 htmlTruncated 并清空，避免存储膨胀
      const cleaned = toSave.map(l =>
        l.htmlContent.length > 150000
          ? { ...l, htmlContent: '', htmlTruncated: true }
          : { ...l, htmlTruncated: false }
      );
      invoke('write_json_file', { filename: 'read-links.json', content: JSON.stringify(cleaned) })
        .then(() => { setSaveError(false); })
        .catch(e => { log.error('保存链接失败', e); setSaveError(true); });
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [links]);

  // 同步 latestReadingIdRef，供图片代理竞态保护使用
  useEffect(() => { latestReadingIdRef.current = readingId; }, [readingId]);

  const handleReceive = async () => {
    if (!url.trim()||loading) return;
    setLoading(true);
    const kind = identifyKind(url.trim());
    let title = url.trim();
    // 修复2：fetch 失败提示用户，不静默继续创建 link
    let fetchOk = true;
    try {
      const html = await invoke<string>('fetch_url',{url:url.trim()});
      const doc = new DOMParser().parseFromString(html,'text/html');
      title = doc.querySelector('#activity-name')?.textContent?.trim()
           || doc.title?.trim() || url.trim();
    } catch (e) {
      log.error('抓取链接失败', { error: String(e) });
      fetchOk = false;
    }
    if (fetchOk) {
      setLinks(prev => [{id:Date.now(),url:url.trim(),kind,title,createdAt:Date.now(),author:'',textContent:'',htmlContent:'',annotations:[],ideas:[],highlights:[],loaded:false},...prev]);
      setUrl('');
      setFetchFailed(null);
    } else {
      setFetchFailed(url.trim());
      alert(`抓取链接失败：${url.trim()}\n请检查链接是否有效或网络是否可用。`);
    }
    setLoading(false);
  };

  // 修复5：enterReading 竞态保护，快速点击不同链接时旧请求结果作废
  const enterReading = async (link: SavedLink) => {
    const reqId = ++reqIdRef.current;
    log.debug('enterReading start', { url: link.url });
    setReadingId(link.id);
    // 切换文章时清空图片缓存和失败记录，避免内存累积
    setImgCache({});
    failedSet.current.clear();
    // 总是重新 fetch，确保用最新的 processFetchedHtml 处理（公式渲染、图片懒加载等）
    // 旧链接的 htmlContent 可能是被150KB上限清空的，或是旧代码处理过的（无公式渲染）
    setLoading(true);
    try {
      const html = await invoke<string>('fetch_url', { url: link.url });
      if (reqId !== reqIdRef.current) return;
      const { author, textContent, htmlContent } = processFetchedHtml(html, link.url);
      log.debug('enterReading fetched', { htmlLen: html.length, contentLen: htmlContent.length, imgCount: (htmlContent.match(/<img/g)||[]).length });
      setLinks(prev => prev.map(l => l.id === link.id ? { ...l, author, textContent: textContent.substring(0, 8000), htmlContent, loaded: true, htmlTruncated: false } : l));
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      log.error('抓取失败', { error: String(e) });
    }
    if (reqId === reqIdRef.current) setLoading(false);
  };

  // 渲染后代理图片：遍历DOM中的img，通过后端下载绕过防盗链
  // 修复6：竞态保护，快速切换文章时旧请求不设置到新 img
  // 图片 base64 存入 imgCache（不写回 htmlContent），避免超过 150KB 存储上限
  // 关键修复：loading 加入依赖，避免再次进入同一文章时 htmlContent 未变导致 useEffect 不触发
  const articleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return; // loading 时跳过（articleRef 未挂载）
    if (!articleRef.current || !readingLink?.htmlContent) {
      return;
    }
    const currentReadingId = readingId;
    const imgs = articleRef.current.querySelectorAll('img');
    log.debug('useEffect trigger', { readingId, imgCount: imgs.length, cacheKeys: Object.keys(imgCache).length });
    imgs.forEach((img) => {
      const src = img.getAttribute('src');
      if (src && src.startsWith('http')) {
        if (imgCache[src] || failedSet.current.has(src)) return;
        invoke<string>('fetch_image_base64', { url: src })
          .then(b64 => {
            if (latestReadingIdRef.current !== currentReadingId) return;
            if (b64.length > 2_700_000) { failedSet.current.add(src); return; }
            log.debug('fetch OK', { src: src?.substring(0, 60), len: b64.length });
            setImgCache(prev => ({ ...prev, [src]: b64 }));
          })
          .catch(() => {
            log.debug('fetch FAIL', { src: src?.substring(0, 60) });
            failedSet.current.add(src);
          });
      }
    });
  }, [readingLink?.htmlContent, readingId, loading]);


  // 问题5：选中文字后显示浮动工具条（替代原自动下划线）
  const handleMouseUp = () => {
    if (!readingId) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) { setFloatToolbar(null); return; }
    const range = sel?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      setFloatToolbar({ x: rect.left + rect.width / 2, y: rect.top, text });
    }
  };

  // 问题5：添加指定样式的高亮
  const addHighlight = (text: string, type: HighlightType) => {
    if (!readingId || !text) return;
    setLinks(prev => prev.map(l =>
      l.id === readingId && !l.highlights.some(h => h.text === text && h.type === type)
        ? { ...l, highlights: [...l.highlights, { text, type }] }
        : l
    ));
    setFloatToolbar(null);
    window.getSelection()?.removeAllRanges();
  };

  const removeHighlight = (id: number, hl: Highlight) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, highlights: l.highlights.filter(h => !(h.text === hl.text && h.type === hl.type)) } : l));
  };

  const saveAnnotation = (id: number) => {
    const text = annText[id]?.trim(); if(!text)return;
    setLinks(prev => prev.map(l=>l.id===id?{...l,annotations:[...l.annotations,{id:Date.now().toString(36),text,createdAt:Date.now()}]}:l));
    setAnnText(prev => {const n={...prev}; delete n[id]; return n;});
  };

  const saveIdea = (id: number) => {
    const text = ideaText[id]?.trim(); if(!text)return;
    setLinks(prev => prev.map(l=>l.id===id?{...l,ideas:[...l.ideas,{id:Date.now().toString(36),text,createdAt:Date.now()}]}:l));
    setIdeaText(prev => {const n={...prev}; delete n[id]; return n;});
  };

  // AI 对话：基于当前阅读文章内容回答用户问题
  const handleAiAsk = async (linkId: number) => {
    const question = aiInput[linkId]?.trim();
    if (!question || aiLoading[linkId]) return;

    const link = links.find(l => l.id === linkId);
    if (!link) return;

    // 构造上下文：用 textContent 作为文章背景（截断到前4000字，避免 token 过长）
    const articleContext = link.textContent.substring(0, 4000);

    const systemPrompt = `你是一位知识渊博的AI助手，正在帮助用户阅读一篇${KIND_LABEL[link.kind]}文章。

文章标题：${link.title}
文章内容摘要（前4000字）：
${articleContext}

请基于这篇文章的上下文和背景知识，回答用户的问题。遵循以下原则：
1. **专业名词作解释**：遇到专业术语/缩写/概念，用简明语言解释其含义。
2. **结合文章上下文**：优先基于文章内容回答，引用文章中的相关段落或观点。
3. **来龙去脉讲清楚**：从背景→问题→解释，逻辑链条完整。
4. **简洁有力**：不啰嗦不注水，抓住问题本质。
5. **生动形象**：善用类比、举例，让抽象概念具象化。

输出格式：Markdown。公式用LaTeX语法（$...$行内，$$...$$块级）。`;

    const history = aiMessages[linkId] || [];
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content: question },
    ];

    // 先显示用户消息
    setAiMessages(prev => ({ ...prev, [linkId]: [...(prev[linkId] || []), { role: 'user', content: question }] }));
    setAiInput(prev => { const n = { ...prev }; delete n[linkId]; return n; });
    setAiLoading(prev => ({ ...prev, [linkId]: true }));

    try {
      const result = await chat(messages, { temperature: 0.7 });
      if (result.success) {
        setAiMessages(prev => ({ ...prev, [linkId]: [...(prev[linkId] || []), { role: 'assistant', content: result.content }] }));
      } else {
        setAiMessages(prev => ({ ...prev, [linkId]: [...(prev[linkId] || []), { role: 'assistant', content: `⚠️ AI 回答失败：${result.error || '未知错误'}` }] }));
      }
    } catch (e) {
      log.error('AI对话失败', { error: String(e) });
      setAiMessages(prev => ({ ...prev, [linkId]: [...(prev[linkId] || []), { role: 'assistant', content: '⚠️ AI 回答失败，请稍后重试。' }] }));
    } finally {
      setAiLoading(prev => ({ ...prev, [linkId]: false }));
    }
  };

  // AI 对话区自动滚动到底部
  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiMessages, aiLoading]);

  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});


  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 200, gap: 12, padding: 12, boxSizing: 'border-box' }}>

      {/* ====== 列表视图 ====== */}
      {readingId === null && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key==='Enter'&&handleReceive()}
              placeholder="粘贴微信公众号/GitHub/网页链接..."
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none' }}
            />
            <button onClick={handleReceive} disabled={loading||!url.trim()} style={{
              padding: '8px 20px', background: loading?'#94a3b8':'#3b82f6', color: 'white', border: 'none', borderRadius: 6, cursor: loading?'not-allowed':'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap'
            }}>{loading?'接收中...':'接收'}</button>
            {links.length > 0 && (
              <button onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }} style={{
                padding: '8px 16px', background: selectMode?'#fef3c7':'#f3f4f6', color: selectMode?'#d97706':'#6b7280',
                border: `1px solid ${selectMode?'#fcd34d':'#d1d5db'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap',
              }}>{selectMode?'取消多选':'多选'}</button>
            )}
          </div>

          {/* 修复2：fetch 失败提示 */}
          {fetchFailed && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
              ⚠️ 抓取链接失败：{fetchFailed}。请检查链接是否有效或网络是否可用。
            </div>
          )}
          {/* 修复3：自动保存失败提示 */}
          {saveError && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, color: '#991b1b', fontSize: 13 }}>
              ⚠️ 自动保存失败，本地数据可能未同步。请检查磁盘权限或稍后重试。
            </div>
          )}
          {/* 修复9：超过50个链接提示 */}
          {links.length > 50 && (
            <div style={{ padding: '8px 12px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
              ⚠️ 链接数量超过50（当前 {links.length}），超出部分将不会保存到本地。
            </div>
          )}

          {/* 多选操作栏 */}
          {selectMode && links.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', background: '#fef9c3', borderRadius: 6, border: '1px solid #fde68a' }}>
              <label style={{ fontSize: 13, color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={selectedIds.size===links.length} onChange={e => setSelectedIds(e.target.checked?new Set(links.map(l=>l.id)):new Set())} style={{ cursor: 'pointer' }} />
                全选
              </label>
              <span style={{ fontSize: 13, color: '#6b7280' }}>已选 {selectedIds.size} 项</span>
              <button
                onClick={() => { if (selectedIds.size===0) return; if (confirm(`确定删除选中的 ${selectedIds.size} 条链接？`)) { setLinks(prev => prev.filter(l => !selectedIds.has(l.id))); setSelectedIds(new Set()); setSelectMode(false); } }}
                disabled={selectedIds.size===0}
                style={{ marginLeft: 'auto', padding: '4px 14px', background: selectedIds.size>0?'#ef4444':'#d1d5db', color: 'white', border: 'none', borderRadius: 4, cursor: selectedIds.size>0?'pointer':'not-allowed', fontSize: 13 }}
              >删除选中</button>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
            {links.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                暂无保存的链接，粘贴链接开始
              </div>
            ) : (
              links.map(link => (
                <div key={link.id}>
                <div onClick={() => selectMode ? (() => { const ns=new Set(selectedIds); ns.has(link.id)?ns.delete(link.id):ns.add(link.id); setSelectedIds(ns); })() : enterReading(link)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                  background: selectMode&&selectedIds.has(link.id)?'#dbeafe':'white', transition: 'background .15s',
                }} onMouseEnter={e => { if(!selectMode) e.currentTarget.style.background='#f9fafb'; }} onMouseLeave={e => { if(!selectMode) e.currentTarget.style.background='white'; }}>
                  {selectMode && (
                    <input type="checkbox" checked={selectedIds.has(link.id)} onClick={e=>e.stopPropagation()} onChange={e => { const ns=new Set(selectedIds); e.target.checked?ns.add(link.id):ns.delete(link.id); setSelectedIds(ns); }} style={{ flexShrink: 0, cursor: 'pointer' }} />
                  )}
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                    background: KIND_COLOR[link.kind], flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: KIND_COLOR[link.kind], fontWeight: 600, flexShrink: 0 }}>
                    {KIND_LABEL[link.kind]}
                  </span>
                  <span style={{ flex: 1, fontSize: 14, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.title}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                    {fmtTime(link.createdAt)}
                  </span>
                  {!selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setLinks(prev => prev.filter(l => l.id !== link.id)); }}
                      title="删除此链接"
                      style={{
                        flexShrink: 0, width: 24, height: 24, lineHeight: '20px',
                        background: 'transparent', border: 'none', borderRadius: 4,
                        cursor: 'pointer', fontSize: 16, color: '#9ca3af',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color='#ef4444', e.currentTarget.style.background='#fee2e2')}
                      onMouseLeave={e => (e.currentTarget.style.color='#9ca3af', e.currentTarget.style.background='transparent')}
                    >✕</button>
                  )}

                </div>
                {/* 问题3：批注/想法摘要 + 可折叠详情 */}
                {(link.annotations.length > 0 || link.ideas.length > 0) && (
                  <div style={{ padding: '4px 14px 6px 30px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                    <button
                      onClick={e => { e.stopPropagation(); const ns = new Set(expandedIds); ns.has(link.id) ? ns.delete(link.id) : ns.add(link.id); setExpandedIds(ns); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6b7280', padding: 0 }}
                    >
                      📝 {link.annotations.length}条批注 · 💡 {link.ideas.length}条想法 {expandedIds.has(link.id) ? '▼' : '▶'}
                    </button>
                    {expandedIds.has(link.id) && (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#4b5563', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {link.annotations.map(a => (
                          <div key={a.id} style={{ padding: '2px 6px', background: 'white', borderRadius: 3, border: '1px solid #e5e7eb' }}>
                            📝 {a.highlightRef ? <mark style={{ textDecoration: 'underline', textDecorationColor: '#f59e0b', background: 'transparent' }}>{a.highlightRef}</mark> : null}{a.highlightRef ? '：' : ''}{a.text}
                          </div>
                        ))}
                        {link.ideas.map(i => (
                          <div key={i.id} style={{ padding: '2px 6px', background: 'white', borderRadius: 3, border: '1px solid #e5e7eb' }}>💡 {i.text}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ====== 阅读视图 ====== */}
      {readingId !== null && readingLink && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>

          {/* 返回按钮 + 重新加载 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'white', padding: '4px 0' }}>
            <button onClick={() => { setReadingId(null); setLoading(false); setImgCache({}); failedSet.current.clear(); }} style={{
              padding: '4px 14px', background: 'none', border: '1px solid #d1d5db',
              borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#6b7280',
            }}>← 回到列表</button>
            <button onClick={async () => {
              if (!readingLink || loading) return;
              setLoading(true);
              setImgCache({});
              failedSet.current.clear();
              try {
                const html = await invoke<string>('fetch_url', { url: readingLink.url });
                const { author, textContent, htmlContent } = processFetchedHtml(html, readingLink.url);
                setLinks(prev => prev.map(l => l.id === readingLink.id ? { ...l, author, textContent: textContent.substring(0, 8000), htmlContent, loaded: true, htmlTruncated: false } : l));
              } catch (e) { log.error('重新加载失败', { error: String(e) }); }
              setLoading(false);
            }} style={{
              padding: '4px 14px', background: loading ? '#d1d5db' : '#3b82f6', color: 'white', border: 'none',
              borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
            }}>{loading ? '加载中...' : '🔄 重新加载'}</button>
          </div>

          {/* 左右分栏 */}
          <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>
            {/* 左侧：阅读区 */}
            <div style={{ flex: 2, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, background: 'white', fontSize: 15, lineHeight: 1.8, color: '#1f2937' }} onMouseUp={handleMouseUp}>
              {loading ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>加载中...</div>
              ) : (
                <>
                  <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#111827' }}>{readingLink.title}</h3>
                  {readingLink.author ? <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{readingLink.author} · {fmtTime(readingLink.createdAt)}</div> : null}
                  {readingLink.htmlContent ? (
                    <div
                      ref={articleRef}
                      className="article-content"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(applyHighlights(applyImgCache(readingLink.htmlContent), readingLink.highlights), { FORBID_TAGS: ['iframe','object','embed','form'], FORBID_ATTR: ['onerror','onload','onclick'] }) }}
                      style={{ wordBreak: 'break-word', overflow: 'hidden' }}
                      onClick={(e) => {
                        // 事件委托：点击 mark 标签取消高亮
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'MARK' && target.hasAttribute('data-hl-type')) {
                          const text = target.getAttribute('data-hl-text') || '';
                          const type = target.getAttribute('data-hl-type') as HighlightType;
                          removeHighlight(readingLink.id, { text, type });
                        }
                      }}
                    />
                  ) : (
                    <div>
                      {/* 修复10：内容过大被截断时提示用户重新加载 */}
                      {readingLink.htmlTruncated && (
                        <div style={{ padding: 12, marginBottom: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6, color: '#92400e', fontSize: 13 }}>
                          ⚠️ 该文章内容过大，已从本地存储中清除。请点击上方「重新加载」重新抓取。
                        </div>
                      )}
                      {renderMarked(readingLink.textContent, readingLink.highlights, (hl) => removeHighlight(readingLink.id, hl))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 右侧：批注+想法 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, position: 'sticky', top: 0, alignSelf: 'flex-start', maxHeight: '100%', overflow: 'auto' }}>
              {/* 批注 */}
              <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>📝 批注</div>
                <textarea
                  value={annText[readingLink.id]||''}
                  onChange={e=>setAnnText(prev=>({...prev,[readingLink.id]:e.target.value}))}
                  placeholder="选中文字画线后在此写批注..."
                  style={{ width:'100%',minHeight:60,resize:'vertical',border:'1px solid #d1d5db',borderRadius:6,padding:8,fontSize:13,fontFamily:'inherit' }}
                />
                <button onClick={()=>saveAnnotation(readingLink.id)} disabled={!(annText[readingLink.id]?.trim())} style={{
                  padding:'4px 12px',background:annText[readingLink.id]?.trim()?'#3b82f6':'#d1d5db',color:'white',border:'none',borderRadius:4,cursor:annText[readingLink.id]?.trim()?'pointer':'not-allowed',fontSize:12,alignSelf:'flex-end'
                }}>保存批注</button>
                {readingLink.annotations.map(a => (
                  <div key={a.id} style={{ fontSize: 12, color: '#4b5563', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                    {a.highlightRef ? <mark style={{textDecoration:'underline',textDecorationColor:'#f59e0b',background:'transparent'}}>{a.highlightRef}</mark> : null}
                    {a.highlightRef ? '：' : ''}{a.text}
                  </div>
                ))}
              </div>
              {/* 新想法 */}
              <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>💡 新想法</div>
                <textarea
                  value={ideaText[readingLink.id]||''}
                  onChange={e=>setIdeaText(prev=>({...prev,[readingLink.id]:e.target.value}))}
                  placeholder="记录由此产生的新想法..."
                  style={{ width:'100%',minHeight:60,resize:'vertical',border:'1px solid #d1d5db',borderRadius:6,padding:8,fontSize:13,fontFamily:'inherit' }}
                />
                <button onClick={()=>saveIdea(readingLink.id)} disabled={!(ideaText[readingLink.id]?.trim())} style={{
                  padding:'4px 12px',background:ideaText[readingLink.id]?.trim()?'#10b981':'#d1d5db',color:'white',border:'none',borderRadius:4,cursor:ideaText[readingLink.id]?.trim()?'pointer':'not-allowed',fontSize:12,alignSelf:'flex-end'
                }}>保存想法</button>
                {readingLink.ideas.map(i => (
                  <div key={i.id} style={{ fontSize: 12, color: '#4b5563', padding: '4px 8px', background: 'white', borderRadius: 4, border: '1px solid #e5e7eb' }}>💭 {i.text}</div>
                ))}
              </div>
              {/* AI 对话：基于文章内容回答问题 */}
              <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>🤖 AI 问答（基于本文内容）</div>
                {/* 对话历史 */}
                {(aiMessages[readingLink.id] || []).length > 0 && (
                  <div ref={aiScrollRef} style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(aiMessages[readingLink.id] || []).map((msg, idx) => (
                      <div key={idx} style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 13, lineHeight: 1.6,
                        background: msg.role === 'user' ? '#dbeafe' : '#f0fdf4',
                        border: `1px solid ${msg.role === 'user' ? '#93c5fd' : '#86efac'}`,
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '92%',
                        wordBreak: 'break-word',
                      }}>
                        <div style={{ fontSize: 10, color: msg.role === 'user' ? '#1e40af' : '#166534', fontWeight: 600, marginBottom: 2 }}>
                          {msg.role === 'user' ? '你' : 'AI'}
                        </div>
                        <div style={{ color: '#1f2937' }}>{msg.content}</div>
                      </div>
                    ))}
                    {aiLoading[readingLink.id] && (
                      <div style={{ padding: '6px 10px', borderRadius: 6, fontSize: 13, background: '#f0fdf4', border: '1px solid #86efac', alignSelf: 'flex-start', maxWidth: '92%' }}>
                        <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, marginBottom: 2 }}>AI</div>
                        <div style={{ color: '#6b7280' }}>思考中...</div>
                      </div>
                    )}
                  </div>
                )}
                {/* 输入框 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={aiInput[readingLink.id] || ''}
                    onChange={e => setAiInput(prev => ({ ...prev, [readingLink.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiAsk(readingLink.id); } }}
                    placeholder="问个问题，如：xxx是什么意思？"
                    disabled={aiLoading[readingLink.id]}
                    style={{ flex: 1, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button
                    onClick={() => handleAiAsk(readingLink.id)}
                    disabled={aiLoading[readingLink.id] || !(aiInput[readingLink.id]?.trim())}
                    style={{
                      padding: '6px 14px', background: aiLoading[readingLink.id] || !(aiInput[readingLink.id]?.trim()) ? '#d1d5db' : '#8b5cf6',
                      color: 'white', border: 'none', borderRadius: 6, cursor: aiLoading[readingLink.id] || !(aiInput[readingLink.id]?.trim()) ? 'not-allowed' : 'pointer',
                      fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap',
                    }}
                  >{aiLoading[readingLink.id] ? '...' : '提问'}</button>
                </div>
                {/* 清空对话按钮 */}
                {(aiMessages[readingLink.id] || []).length > 0 && !aiLoading[readingLink.id] && (
                  <button
                    onClick={() => setAiMessages(prev => { const n = { ...prev }; delete n[readingLink.id]; return n; })}
                    style={{ alignSelf: 'flex-end', padding: '2px 8px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#9ca3af' }}
                  >清空对话</button>
                )}
              </div>
            </div>
          </div>

          {/* 问题5：选中文字后的浮动标记工具条 */}
          {floatToolbar && (
            <div style={{
              position: 'fixed', left: floatToolbar.x, top: floatToolbar.y,
              transform: 'translate(-50%, -100%)',
              display: 'flex', gap: 4, background: 'white',
              border: '1px solid #d1d5db', borderRadius: 6, padding: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 100,
            }}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }} // 防止点击按钮时选区丢失并阻止冒泡
            >
              <button onClick={() => addHighlight(floatToolbar.text, 'underline')} title="下划线" style={{ padding: '4px 8px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#92400e' }}>U</button>
              <button onClick={() => addHighlight(floatToolbar.text, 'red')} title="标红" style={{ padding: '4px 8px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>R</button>
              <button onClick={() => addHighlight(floatToolbar.text, 'strikethrough')} title="划线" style={{ padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#6b7280', textDecoration: 'line-through' }}>S</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

