# 代码规范（严格模式）

> 适用项目：Tauri 2.x + React 19 + TypeScript 5.5(strict) + Zustand 5 + Vitest 2.1
> 核心目标：消除 useEffect 依赖漏写、函数职责过大、状态分散耦合三大痛点
> 强制级别：**MUST** = 必须遵守；**SHOULD** = 强烈建议；**MAY** = 可选

---

## 目录

1. [命名约定](#1-命名约定)
2. [类型安全](#2-类型安全)
3. [函数单一职责](#3-函数单一职责)
4. [组件规范](#4-组件规范)
5. [自定义 Hook 抽取](#5-自定义-hook-抽取)
6. [useEffect 依赖管理（重点）](#6-useeffect-依赖管理重点)
7. [状态管理分层](#7-状态管理分层)

---

## 1. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ReadingPanel`、`FloatToolbar` |
| 函数 / 方法 | camelCase | `enterReading`、`loadImageCache` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`、`API_BASE_URL` |
| 类型 / 接口 | PascalCase | `ReadingState`、`ImageCacheEntry` |
| 文件名 | kebab-case（与项目现状一致） | `annotation-store.ts`、`float-toolbar.tsx` |
| Hook 文件 | use- 前缀 kebab-case | `use-image-cache.ts`、`use-highlight.ts` |
| 测试文件 | 源名 + `.test` | `annotation-store.test.ts` |
| Zustand store | 名词 + `-store.ts` | `wiki-store.ts`、`idea-store.ts` |
| 布尔变量 / 状态 | is/has/can/should 前缀 | `isLoading`、`hasError`、`canRetry` |

### ✅ 正例

```typescript
// 文件：src/components/read/reading-panel.tsx
const MAX_RETRY_COUNT = 3;                    // 常量 UPPER_SNAKE
const API_BASE_URL = '/api/wiki';             // 常量 UPPER_SNAKE

interface ReadingState {                      // 类型 PascalCase
  isLoading: boolean;                         // 布尔 is 前缀
  content: string;
  hasError: boolean;                          // 布尔 has 前缀
}

export function ReadingPanel(): JSX.Element { // 组件 PascalCase
  const [isLoading, setIsLoading] = useState(false);
  return <div>{isLoading ? '加载中' : '完成'}</div>;
}

async function loadImageCache(url: string): Promise<ReadingState> {  // 函数 camelCase
  // ...
}
```

### ❌ 反例

```typescript
// ❌ 文件名用了 PascalCase，与项目 kebab-case 约定不符
// 文件：src/components/read/ReadingPanel.tsx

const max_retry = 3;                          // ❌ 常量未 UPPER_SNAKE
const apiBaseUrl = '/api/wiki';               // ❌ 常量未 UPPER_SNAKE

interface readingState {                      // ❌ 类型首字母小写
  loading: boolean;                           // ❌ 布尔缺 is/has 前缀，语义模糊
  content: string;
}

export function readingPanel(): JSX.Element { // ❌ 组件首字母小写，JSX 调用会报错
  const [loading, setLoading] = useState(false);
  return <div>{loading ? '加载中' : '完成'}</div>;
}
```

---

## 2. 类型安全

### 2.1 禁止 `any`

`any` 会关闭类型检查，使编译期错误推迟到运行期。必须用 `unknown` + 类型守卫替代。

#### ✅ 正例

```typescript
// 用 unknown + 类型守卫收窄类型
function parseApiResponse(raw: unknown): ReadingState {
  if (!isObject(raw)) throw new TypeError('响应不是对象');
  if (typeof raw.content !== 'string') throw new TypeError('content 必须是字符串');
  if (typeof raw.isLoading !== 'boolean') throw new TypeError('isLoading 必须是布尔');
  return { content: raw.content, isLoading: raw.isLoading, hasError: false };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
```

#### ❌ 反例

```typescript
// ❌ any 关闭类型检查，raw.content 拼错也不报错
function parseApiResponse(raw: any): any {
  return { content: raw.conent, isLoading: raw.isLoading };  // ❌ conent 拼错无提示
}
```

### 2.2 禁止 `@ts-ignore` / `@ts-nocheck`

#### ✅ 正例

```typescript
// 用类型断言 + 注释说明为什么安全
const el = document.getElementById('editor') as HTMLTextAreaElement; // 已确认挂载点存在
```

#### ❌ 反例

```typescript
// @ts-ignore: 不知道为什么报错，先忽略         // ❌ 隐藏问题，后续无人敢删
const result = someUntypedApi.doSomething();
```

### 2.3 所有函数显式标注返回类型

#### ✅ 正例

```typescript
function formatTime(ms: number): string {       // 显式返回 string
  return new Date(ms).toISOString();
}
async function fetchWiki(id: string): Promise<ReadingState> {  // 显式 Promise<T>
  // ...
}
```

#### ❌ 反例

```typescript
function formatTime(ms: number) {               // ❌ 返回类型靠推断，重构时易破坏调用方
  return new Date(ms).toISOString();
}
```

### 2.4 启用 strict 工具链（项目已配置，禁止关闭）

```jsonc
// tsconfig.json —— 以下项必须为 true，禁止改成 false
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 3. 函数单一职责

### 3.1 硬性指标

| 指标 | 阈值 | 触发即需重构 |
|------|------|---------------|
| 单函数行数 | ≤ 40 行（不含空行/注释） | MUST |
| 参数个数 | ≤ 4 个；超过用对象参数 | MUST |
| 嵌套层级 | ≤ 3 层（if/for/try） | MUST |
| 圈复杂度 | ≤ 10 | SHOULD |

### 3.2 `enterReading` 拆分示例（项目实际痛点）

原函数做 6 件事：清状态 → 设 loading → 拉数据 → 缓存图片 → 算高亮 → 进阅读态。改一处坏一处。

#### ❌ 反例（职责过大，6 件事挤在一起）

```typescript
// 文件：src/stores/wiki-store.ts
async function enterReading(articleId: string) {
  set({ loading: true, error: null, content: '' });              // 1. 清状态+设loading
  try {
    const raw = await api.fetchArticle(articleId);               // 2. 拉数据
    const html = parseMarkdown(raw.markdown);                    // 3. 解析
    const withCache = await preloadImages(html);                 // 4. 缓存图片
    const highlighted = highlightCode(withCache);                // 5. 高亮
    imgCache.set(articleId, extractImgUrls(withCache));          // 6. 写缓存+进阅读态
    set({ loading: false, content: highlighted, mode: 'reading' });
  } catch (e) {
    set({ loading: false, error: String(e) });
  }
}
```

#### ✅ 正例（拆分为单一职责小函数 + 编排器）

```typescript
// 文件：src/stores/wiki-store.ts
// 每个函数只做一件事，可独立测试、独立替换

function beginLoading(): Partial<WikiState> {
  return { loading: true, error: null, content: '' };
}

async function fetchAndParse(articleId: string): Promise<string> {
  const raw = await api.fetchArticle(articleId);
  return parseMarkdown(raw.markdown);
}

async function preloadAndCache(html: string, articleId: string): Promise<string> {
  const withCache = await preloadImages(html);
  imgCache.set(articleId, extractImgUrls(withCache));
  return withCache;
}

function readingSuccess(html: string): Partial<WikiState> {
  return { loading: false, content: highlightCode(html), mode: 'reading' };
}

function readingFailure(e: unknown): Partial<WikiState> {
  return { loading: false, error: e instanceof Error ? e.message : String(e) };
}

// 编排器：只负责串联流程，不实现细节
async function enterReading(articleId: string): Promise<void> {
  set(beginLoading());
  try {
    const html = await fetchAndParse(articleId);
    const cached = await preloadAndCache(html, articleId);
    set(readingSuccess(cached));
  } catch (e) {
    set(readingFailure(e));
  }
}
```

### 3.3 参数超过 4 个时用对象参数

#### ✅ 正例

```typescript
interface RenderOpts { html: string; theme: Theme; fontSize: number; cache: ImgCache; }
function renderContent(opts: RenderOpts): string { /* ... */ }
```

#### ❌ 反例

```typescript
function renderContent(html: string, theme: Theme, fontSize: number, cache: ImgCache, x: number, y: number): string { /* ... */ }
```

---

## 4. 组件规范

### 4.1 硬性指标

| 指标 | 阈值 |
|------|------|
| 单文件行数 | ≤ 300 行；超过 MUST 拆分 |
| 单组件 useState 数 | ≤ 3 个；超过 MUST 抽 Hook |
| 内联样式 | 禁止 `style={{...}}` 字面量；提取到常量或 CSS Module |
| 副作用 | 副作用必须置于 `useEffect`，禁止渲染期执行 |

> ⚠️ 当前 `src/App.tsx` 约 117KB，严重超标，必须按本规范拆分。

### 4.2 容器组件 + 展示组件分离

- **容器组件**：负责数据获取、状态订阅、事件分发，不写样式。
- **展示组件**：纯函数式，只接收 props 渲染 UI，不直接访问 store。

#### ✅ 正例

```typescript
// 文件：src/components/read/reading-container.tsx —— 容器：只管数据与状态
export function ReadingContainer({ articleId }: { articleId: string }): JSX.Element {
  const { content, isLoading, error } = useWikiStore();
  useEffect(() => { enterReading(articleId); }, [articleId]);
  return <ReadingView content={content} isLoading={isLoading} error={error} />;
}

// 文件：src/components/read/reading-view.tsx —— 展示：纯渲染，可独立测试
interface ReadingViewProps { content: string; isLoading: boolean; error: string | null; }
export function ReadingView({ content, isLoading, error }: ReadingViewProps): JSX.Element {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  return <article className="reading" dangerouslySetInnerHTML={{ __html: content }} />;
}
```

#### ❌ 反例

```typescript
// ❌ 容器与展示混在一起，无法独立测试 UI
export function Reading({ articleId }: { articleId: string }): JSX.Element {
  const { content, loading, error } = useWikiStore();
  useEffect(() => { enterReading(articleId); }, [articleId]);
  // 200 行 JSX 与状态逻辑交织
  return (
    <div style={{ padding: 16, background: '#fff', borderRadius: 8 }}>  {/* ❌ 内联样式 */}
      {loading ? <div style={{ color: 'red' }}>加载中</div> : <article dangerouslySetInnerHTML={{ __html: content }} />}
    </div>
  );
}
```

### 4.3 内联样式提取

#### ✅ 正例

```typescript
// 提取为常量或使用 CSS Module
const spinnerStyle = { width: 24, height: 24 } as const;
return <Spinner style={spinnerStyle} />;

// 或更推荐：reading.module.css
// .reading { padding: 16px; background: #fff; border-radius: 8px; }
import styles from './reading.module.css';
return <article className={styles.reading} />;
```

---

## 5. 自定义 Hook 抽取

### 5.1 抽取时机

- 组件内 `useState` ≥ 3 个 → MUST 抽 Hook。
- 同一段状态 + 副作用逻辑在 ≥ 2 个组件重复 → MUST 抽 Hook。
- Hook 命名：`use` + 名词/动名词，如 `useImageCache`、`useHighlight`、`useArticleContent`。
- 返回值用**对象解构**，禁止位置参数返回（避免调用方记错顺序）。

### 5.2 `useImageCache` 示例

#### ✅ 正例

```typescript
// 文件：src/components/read/use-image-cache.ts
interface UseImageCacheResult {
  cachedUrls: Map<string, string>;
  isLoading: boolean;
  preload: (urls: string[]) => Promise<void>;
}

export function useImageCache(articleId: string): UseImageCacheResult {
  const [cachedUrls, setCachedUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const preload = useCallback(async (urls: string[]) => {
    setIsLoading(true);
    try {
      const entries = await Promise.all(urls.map(async (u) => [u, await toObjectUrl(u)] as const));
      setCachedUrls(new Map(entries));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { setCachedUrls(new Map()); }, [articleId]);  // 切文章清缓存
  return { cachedUrls, isLoading, preload };
}

// 调用方：对象解构，字段名即文档
function ReadingView({ articleId }: { articleId: string }) {
  const { cachedUrls, isLoading, preload } = useImageCache(articleId);
  // ...
}
```

#### ❌ 反例

```typescript
// ❌ 3 个 useState 散在组件里，且返回元组顺序难记
function ReadingView({ articleId }: { articleId: string }) {
  const [cachedUrls, setCachedUrls] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ... 50 行缓存逻辑混在组件里
}

// ❌ 返回元组，调用方易写错顺序
function useBad() { return [urls, loading, preload] as const; }
const [loading, urls, preload] = useBad();  // 顺序写反，运行期才暴露
```

### 5.3 `useHighlight` 示例

```typescript
// 文件：src/components/read/use-highlight.ts
interface UseHighlightResult { html: string; rehighlight: () => void; }

export function useHighlight(rawHtml: string, theme: Theme): UseHighlightResult {
  const [html, setHtml] = useState('');
  useEffect(() => { setHtml(highlightCode(rawHtml, theme)); }, [rawHtml, theme]);
  const rehighlight = useCallback(() => setHtml(highlightCode(rawHtml, theme)), [rawHtml, theme]);
  return { html, rehighlight };
}
```

---

## 6. useEffect 依赖管理（重点）

> 项目已发生因依赖漏写导致图片不显示的事故：改了 `loading` 但依赖数组没加 `loading`，回调读到旧值。

### 6.1 强制规则

1. **MUST**：依赖数组必须包含所有在 effect 内被读取的响应式值（props、state、派生值）。
2. **MUST**：禁止用空依赖数组 `[]` 模拟 `componentDidMount`（除非 effect 内确实不读任何响应式值）。
3. **MUST**：禁止用 `eslint-disable react-hooks/exhaustive-deps` 绕过检查；如确需省略，必须在注释中说明理由。
4. **SHOULD**：依赖项过多时，说明 effect 职责过大，应拆分 effect 或抽 Hook。
5. **MUST**：依赖项是对象/数组/函数时，用 `useMemo`/`useCallback` 稳定引用，避免无限重渲染。

### 6.2 正反示例：图片加载依赖 `loading`

#### ❌ 反例（漏写 `loading`，回调读到旧值，图片不显示）

```typescript
function ImageLayer({ urls, loading }: { urls: string[]; loading: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // ❌ 读取了 loading，但依赖数组只有 urls
    // 当 loading 从 true→false 时 effect 不重跑，visible 仍是旧值
    if (!loading) setVisible(true);
  }, [urls]);
  return <>{visible && urls.map((u) => <img key={u} src={u} />)}</>;
}
```

#### ✅ 正例（补全依赖）

```typescript
function ImageLayer({ urls, loading }: { urls: string[]; loading: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!loading) setVisible(true);
  }, [urls, loading]);  // ✅ 所有响应式值入依赖
  return <>{visible && urls.map((u) => <img key={u} src={u} />)}</>;
}
```

### 6.3 正反示例：禁止空依赖数组

#### ❌ 反例

```typescript
function Bad({ articleId }: { articleId: string }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    // ❌ 读了 articleId 却用 []，articleId 变化时不重新拉取
    fetch(`/api/${articleId}`).then(setData);
  }, []);
  return <pre>{JSON.stringify(data)}</pre>;
}
```

#### ✅ 正例

```typescript
function Good({ articleId }: { articleId: string }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;                          // 处理竞态
    fetch(`/api/${articleId}`).then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [articleId]);                                  // ✅ 依赖 articleId
  return <pre>{JSON.stringify(data)}</pre>;
}
```

### 6.4 对象/函数依赖需稳定引用

#### ✅ 正例

```typescript
function Good({ filter, onLoaded }: Props) {
  const stableFilter = useMemo(() => filter, [filter.id]);   // 稳定引用
  const stableOnLoaded = useCallback(onLoaded, []);           // 稳定引用
  useEffect(() => { load(stableFilter).then(stableOnLoaded); }, [stableFilter, stableOnLoaded]);
}
```

### 6.5 ESLint 强制配置

```jsonc
// .eslintrc —— 必须开启，CI 中违反即失败
{
  "rules": {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error"
  }
}
```

---

## 7. 状态管理分层

按作用域与生命周期，将状态分到四层，禁止跨层混用。

| 层 | 工具 | 适用场景 | 反模式 |
|----|------|----------|--------|
| 临时局部状态 | `useState` / `useReducer` | 表单输入、展开折叠、临时 UI 标志 | 把跨组件共享的 state 放 useState |
| 跨组件共享状态 | Zustand store | `imgCache`、`floatToolbar`、`loading` 等多组件读写 | 用 Context + useState 模拟全局 store |
| 派生状态 | `useMemo` / selector | 由已有 state 计算而来，不独立存储 | 把可计算的值再存一份 state |
| 异步状态 | 三态模式（loading/error/data） | 数据获取 | 用单一 `data` 字段兼表达加载/错误 |

### 7.1 派生状态用 `useMemo`，不要复制成 state

#### ✅ 正例

```typescript
const { articles, keyword } = useWikiStore();
const filtered = useMemo(                                    // 派生：由 articles+keyword 计算
  () => articles.filter((a) => a.title.includes(keyword)),
  [articles, keyword],
);
```

#### ❌ 反例

```typescript
const { articles, keyword } = useWikiStore();
const [filtered, setFiltered] = useState(articles);          // ❌ 复制成独立 state
useEffect(() => { setFiltered(articles.filter(...)); }, [articles, keyword]);
// 多一份 state、多一个 effect、多一次重渲染，且易漏依赖
```

### 7.2 异步状态用三态模式，禁止用单字段兼表达

#### ✅ 正例

```typescript
interface AsyncState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T | null;
  error: string | null;
}

// 使用：状态互斥，UI 分支清晰
function ArticleView({ state }: { state: AsyncState<Article> }) {
  switch (state.status) {
    case 'idle':    return <Empty />;
    case 'loading': return <Spinner />;
    case 'error':   return <ErrorBanner message={state.error!} />;
    case 'success': return <Article data={state.data!} />;
  }
}
```

#### ❌ 反例

```typescript
// ❌ 用 data===null 兼表达"加载中"，无法区分"加载中"与"加载完但确实为空"
interface BadState { data: Article | null; }
function ArticleView({ data }: { data: Article | null }) {
  if (data === null) return <Spinner />;   // 空数据也会显示 Spinner，语义错乱
  return <Article data={data} />;
}
```

### 7.3 Zustand selector 防止全量重渲染

#### ✅ 正例

```typescript
// 只订阅需要的字段，避免无关字段变化触发重渲染
const isLoading = useWikiStore((s) => s.loading);
const content   = useWikiStore((s) => s.content);
```

#### ❌ 反例

```typescript
// ❌ 订阅整个 store，任意字段变化都重渲染
const store = useWikiStore();
return <div>{store.loading} {store.content}</div>;
```

### 7.4 状态依赖关系必须显式注释

当多个状态相互影响时（如 `imgCache` / `floatToolbar` / `loading`），在 store 顶部用注释画出依赖图，避免隐式耦合。

```typescript
/**
 * 状态依赖图：
 *   loading ──┬──▶ imgCache.preload()
 *              └──▶ floatToolbar.visible (loading 中隐藏)
 *   articleId ──▶ loading ──▶ imgCache.clear()
 */
export const useWikiStore = create<WikiState>((set, get) => ({ /* ... */ }));
```

---

## 附录：CI 强制检查清单

| 检查项 | 工具 | 失败动作 |
|--------|------|----------|
| 类型检查 | `tsc --noEmit` | CI 失败 |
| ESLint hooks 规则 | `eslint --rule react-hooks/exhaustive-deps:error` | CI 失败 |
| 单文件行数 ≤ 300 | 自定义 lint 脚本 | 警告并标记需重构 |
| 单函数行数 ≤ 40 | 自定义 lint 脚本 | 警告并标记需重构 |
| 禁止 `any` / `@ts-ignore` | ESLint `no-explicit-any`、`ban-ts-comment` | CI 失败 |

---

> 本规范由代码规范文档工程师维护，违反 MUST 级规则的 PR 不得合入。