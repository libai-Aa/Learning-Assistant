# Debug 标准操作流程（SOP）

> 适用项目：Tauri 2.x + React 19 + TypeScript + Zustand
> 核心目标：消除"出错只能 console.log 猜测"的痛点，建立可追溯的排查流程
> 强制级别：**MUST** = 必须遵守；**SHOULD** = 强烈建议

---

## 目录

1. [Error Boundary 使用规范](#1-error-boundary-使用规范)
2. [日志分级](#2-日志分级)
3. [排查流程 SOP](#3-排查流程-sop)
4. [变更影响分析模板](#4-变更影响分析模板)
5. [常见 Bug 模式库](#5-常见-bug-模式库)

---

## 1. Error Boundary 使用规范

### 1.1 强制规则

- **MUST**：每个路由级组件必须用 `ErrorBoundary` 包裹。
- **MUST**：错误边界必须展示友好错误信息 + 重试按钮，禁止白屏。
- **MUST**：捕获的错误必须记录到 `logger.error`（带堆栈与路由信息）。
- **MUST**：错误边界自身禁止抛错，`fallback` 必须是纯静态 UI。

### 1.2 ✅ 正例

```typescript
// 文件：src/components/common/error-boundary.tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

interface Props { children: ReactNode; routeName: string; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('React 渲染错误', {
      route: this.props.routeName,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ error: null });   // 清状态触发重渲染
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="error-fallback">
          <h2>页面出错了</h2>
          <p>{this.state.error.message}</p>
          <button onClick={this.handleRetry}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// 使用：路由级包裹
export function ReadingRoute(): JSX.Element {
  return (
    <ErrorBoundary routeName="reading">
      <ReadingContainer articleId={articleId} />
    </ErrorBoundary>
  );
}
```

### 1.3 ❌ 反例

```typescript
// ❌ 无 ErrorBoundary，组件抛错即白屏
export function ReadingRoute(): JSX.Element {
  return <ReadingContainer articleId={articleId} />;
}

// ❌ fallback 里又调用了可能抛错的组件
componentDidCatch(error: Error) {
  return <BrokenComponent />;   // ErrorBoundary 自身抛错会向上冒泡到白屏
}
```

---

## 2. 日志分级

### 2.1 级别定义

| 级别 | 用途 | 示例 |
|------|------|------|
| `debug` | 开发期细节，生产关闭 | 函数入参、中间变量 |
| `info` | 关键业务节点 | 文章加载完成、缓存命中 |
| `warn` | 可疑但可恢复 | 重试、降级、依赖项缺失 |
| `error` | 需立即关注 | 接口失败、Error Boundary 捕获 |

### 2.2 强制规则

- **MUST**：禁止在生产代码中使用 `console.log` / `console.debug`。
- **MUST**：所有日志必须走 `logger`，禁止直接 `console.error`。
- **MUST**：`error` 级别必须带 `context` 对象与堆栈。
- **MUST**：禁止日志泄露用户敏感信息（token、密码、完整 cookie）。

### 2.3 `logger.ts` 模板

```typescript
// 文件：src/lib/utils/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
  stack?: string;
  route?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10, info: 20, warn: 30, error: 40,
};

const currentLevel: LogLevel = import.meta.env.PROD ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;
  const tag = `[${level.toUpperCase()}] ${new Date().toISOString()} ${message}`;
  switch (level) {
    case 'debug': console.debug(tag, context ?? ''); break;
    case 'info':  console.info(tag,  context ?? ''); break;
    case 'warn':  console.warn(tag,  context ?? ''); break;
    case 'error': console.error(tag, context ?? ''); break;
  }
  // 生产环境可在此转发到 Tauri 后端或远程日志服务
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn',  msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
```

### 2.4 ✅ 正例

```typescript
async function enterReading(articleId: string): Promise<void> {
  logger.debug('enterReading 开始', { articleId });
  try {
    const html = await fetchAndParse(articleId);
    logger.info('文章加载完成', { articleId, length: html.length });
  } catch (e) {
    logger.error('文章加载失败', {
      articleId,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw e;
  }
}
```

### 2.5 ❌ 反例

```typescript
// ❌ 直接 console.log，生产环境无法关闭、无法分级、无上下文
async function enterReading(articleId: string) {
  console.log('start', articleId);
  try {
    return await fetchAndParse(articleId);
  } catch (e) {
    console.log('err', e);            // ❌ error 被当成 log 打印
  }
}
```

---

## 3. 排查流程 SOP

每个 Bug 必须按以下 7 步闭环执行，并在 PR 描述中记录。

```
复现 → 定位 → 分析 → 修复 → 验证 → 回归 → 记录
```

| 步骤 | 动作 | 产出 | MUST 工具 |
|------|------|------|-----------|
| 1. 复现 | 写最小复现用例，稳定触发 | failing test | Vitest |
| 2. 定位 | 用 `logger` + 浏览器 DevTools 锁定出错位置 | 错误堆栈 + 触发路径 | logger / DevTools |
| 3. 分析 | 用"变更影响分析模板"评估波及范围 | 影响清单 | 本文档 §4 |
| 4. 修复 | 按规范改代码，单一职责，补类型 | patch | tsc / eslint |
| 5. 验证 | 复现用例转绿 + 新增针对性用例 | passing test | Vitest |
| 6. 回归 | 跑全量测试 + 手动验证关联路径 | 全绿报告 | `vitest run --coverage` |
| 7. 记录 | 在 PR 描述写根因 + 模式库编号 | PR 描述 | 本文档 §5 |

### 3.1 ✅ 正例（PR 描述模板）

```markdown
## Bug 修复：图片不显示

### 1. 复现
- 用例：`reading-view.test.tsx > loading 转 false 时图片应显示`
- 触发条件：`loading` 从 true→false，但 `useEffect` 依赖数组漏写 `loading`

### 2. 定位
- `logger.error` 堆栈指向 `ImageLayer` 的 effect，`visible` 仍为旧值 false

### 3. 分析（影响清单）
- 调用者：`ReadingContainer`（无变化）
- state 消费者：`ImageLayer`（已修复依赖）
- 测试更新：新增 1 个用例覆盖 loading 状态切换

### 4. 修复
- `useEffect(..., [urls])` → `useEffect(..., [urls, loading])`

### 5. 验证
- 新增用例通过

### 6. 回归
- `vitest run --coverage` 全绿，覆盖率未下降

### 7. 记录
- 模式库编号：#B01 useEffect 依赖漏写
```

### 3.2 ❌ 反例

```text
// ❌ 直接改代码，无复现、无测试、无根因记录
"图片不显示，已加 loading 到依赖，好了"
```

---

## 4. 变更影响分析模板

修改任何非 trivial 代码前，**MUST** 完成下表。模板直接复制到 PR 描述。

```markdown
## 变更影响分析

### 修改对象
- 文件：`src/stores/wiki-store.ts`
- 函数/组件：`enterReading`
- 变更类型：[ ]新增 [x]修改 [ ]删除

### 1. 函数调用者（谁会受影响）
- [ ] `ReadingContainer`（src/components/read/reading-container.tsx）
- [ ] `useArticleContent` Hook
- 检查项：调用签名是否变化？返回值是否兼容？

### 2. State 消费者（订阅了相关 state 的组件）
- [ ] `ReadingView` 订阅 `content`、`loading`
- [ ] `FloatToolbar` 订阅 `loading`
- 检查项：state 形状是否变化？selector 是否仍有效？

### 3. 接口依赖（API / Tauri invoke / 第三方）
- [ ] `api.fetchArticle` 返回结构
- 检查项：请求/响应类型是否变化？错误处理是否覆盖？

### 4. useEffect 依赖
- [ ] effect 内读取的响应式值是否全部入依赖数组？
- [ ] 是否引入新的对象/函数依赖？是否需 useMemo/useCallback 稳定引用？

### 5. 测试更新
- [ ] 现有用例是否仍通过？
- [ ] 是否需新增用例覆盖本次变更分支？
- [ ] 覆盖率是否下降？

### 6. 回归范围
- [ ] 直接调用方
- [ ] 间接订阅方
- [ ] 关键用户旅程（阅读→标注→保存）
```

### ✅ 正例（填写示例）

```markdown
### 1. 函数调用者
- [x] ReadingContainer：调用签名未变，返回值兼容 ✅
- [x] useArticleContent：内部拆分但对外 API 不变 ✅

### 4. useEffect 依赖
- [x] ImageLayer 的 effect 已补 loading ✅
- [ ] FloatToolbar 的 effect 引入 loading，需确认是否需 useCallback
```

---

## 5. 常见 Bug 模式库

每条记录编号、根因、检测方法、修复模式。新增 Bug 归档至此，便于团队复用。

### #B01 useEffect 依赖漏写

| 项 | 内容 |
|----|------|
| 现象 | 改了某 state 但 UI 不更新，或偶发性"读到旧值" |
| 根因 | effect 内读取了响应式值，但依赖数组未包含 |
| 检测 | ESLint `react-hooks/exhaustive-deps: error`；写测试覆盖状态切换 |
| 修复 | 把所有响应式值加入依赖数组；若依赖过多则拆分 effect 或抽 Hook |
| 项目案例 | `ImageLayer` 漏写 `loading`，图片不显示 |

```typescript
// ❌ 反例
useEffect(() => { if (!loading) setVisible(true); }, [urls]);
// ✅ 修复
useEffect(() => { if (!loading) setVisible(true); }, [urls, loading]);
```

---

### #B02 DOM 重建导致选区丢失

| 项 | 内容 |
|----|------|
| 现象 | 用户选中文字后，选区（Selection）突然消失，高亮失效 |
| 根因 | 父组件重渲染时 `key` 变化或 `dangerouslySetInnerHTML` 内容替换，导致 DOM 节点被销毁重建，Selection 失去锚点 |
| 检测 | 在 `selectionchange` 事件中 `logger.debug` 记录选区根节点；对比渲染前后节点引用是否一致 |
| 修复 | ① 稳定 `key`，不随数据变化而变；② 用 `useMemo` 稳定 HTML 字符串；③ 选区操作前判断 `anchorNode.isConnected` |

```typescript
// ❌ 反例：每次 content 变化都换 key，DOM 重建
return <article key={content} dangerouslySetInnerHTML={{ __html: content }} />;

// ✅ 修复：key 稳定，仅 articleId 变化时才重建
return <article key={articleId} dangerouslySetInnerHTML={{ __html: content }} />;
```

---

### #B03 竞态条件（Race Condition）

| 项 | 内容 |
|----|------|
| 现象 | 快速连续切换文章后，页面显示的是旧文章内容 |
| 根因 | 先发的请求后返回，覆盖了新数据 |
| 检测 | 并发测试：连续触发两次切换，断言最终内容为后一次 |
| 修复 | 用 `cancelled` 标志位或 `AbortController` 在 cleanup 中取消旧请求 |

```typescript
// ❌ 反例
useEffect(() => {
  fetchArticle(articleId).then(setData);   // 旧请求可能后返回并覆盖
}, [articleId]);

// ✅ 修复
useEffect(() => {
  let cancelled = false;
  fetchArticle(articleId).then((d) => { if (!cancelled) setData(d); });
  return () => { cancelled = true; };
}, [articleId]);

// ✅ 更优：AbortController
useEffect(() => {
  const ac = new AbortController();
  fetchArticle(articleId, { signal: ac.signal }).then(setData).catch(() => {});
  return () => ac.abort();
}, [articleId]);
```

---

### #B04 HTML 实体编码不匹配

| 项 | 内容 |
|----|------|
| 现象 | 高亮/标注保存后再读回，文本出现 `&amp;`、`&#39;` 或乱码 |
| 根因 | 解析端用 `&` 还原，但保存端用 `&amp;` 转义；或 `marked` 与 `DOMPurify` 编码策略不一致 |
| 检测 | 往返测试：`decode(encode(x)) === x`；用例覆盖含 `&`、`<`、`"`、`'`、中文的文本 |
| 修复 | 统一在单一层做编解码（建议保存原始字符串，渲染时统一 `DOMPurify.sanitize`）；禁止多层各自转义 |

```typescript
// ❌ 反例：解析端解码、保存端又转义，往返不一致
function decode(s: string) { return s.replace(/&amp;/g, '&'); }
function encode(s: string) { return s.replace(/&/g, '&amp;'); }
// decode(encode("a & b")) === "a & b" ✅，但 decode(encode("a &amp; b")) !== "a &amp; b" ❌

// ✅ 修复：保存原始字符串，渲染时统一 sanitize
function saveAnnotation(text: string): void {
  store.set({ text });                       // 原样保存
}
function renderAnnotation(text: string): string {
  return DOMPurify.sanitize(text);           // 单一出口统一处理
}
```

---

### #B05 Zustand selector 返回新引用导致无限重渲染

| 项 | 内容 |
|----|------|
| 现象 | 组件持续重渲染，CPU 占满 |
| 根因 | selector 每次返回新对象/数组引用，Zustand 默认 `Object.is` 判等失败 |
| 检测 | React DevTools Profiler 看组件渲染次数；`useStore` 第二参传 `shallow` 后是否消失 |
| 修复 | 用 `shallow` 比较器，或拆成多个原子 selector |

```typescript
// ❌ 反例
const { loading, content } = useWikiStore((s) => ({ loading: s.loading, content: s.content }));
// 每次都返回新对象 → 无限重渲染

// ✅ 修复 1：shallow 比较
import { useShallow } from 'zustand/react/shallow';
const { loading, content } = useWikiStore(useShallow((s) => ({ loading: s.loading, content: s.content })));

// ✅ 修复 2：拆成原子 selector
const loading = useWikiStore((s) => s.loading);
const content = useWikiStore((s) => s.content);
```

---

## 附录：Debug 工具箱

| 工具 | 用途 | 触发方式 |
|------|------|----------|
| `logger` | 分级日志 | 代码内置 |
| React DevTools Profiler | 定位重渲染源 | 浏览器扩展 |
| Vitest UI | 单测调试 | `vitest --ui` |
| Tauri DevTools | 检查 invoke 调用 | `tauri dev` + DevTools |
| `retrieveLogRanges` | 大日志按关键词提取 | 见工具说明 |

---

> 本 SOP 由代码规范文档工程师维护。任何线上 Bug 修复 PR 必须引用本文档的步骤与模式编号。