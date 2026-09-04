# 测试规范

> 适用项目：Vitest 2.1 + React 19 + Zustand 5
> 核心目标：消除"每次修改靠手动验证"的痛点，建立组件级测试网
> 测试目录约定（与 `vitest.config.ts` 一致）：
> - `src/lib/**/__tests__/*.test.ts`
> - `src/stores/__tests__/*.test.ts`
> - 组件测试：`src/components/**/__tests__/*.test.tsx`（需新增到 `include`）

---

## 目录

1. [测试分层](#1-测试分层)
2. [命名约定](#2-命名约定)
3. [覆盖率要求](#3-覆盖率要求)
4. [关键路径必须覆盖](#4-关键路径必须覆盖)
5. [Mock 规范](#5-mock-规范)
6. [AAA 模式](#6-aaa-模式)

---

## 1. 测试分层

| 层 | 目标 | 位置 | 运行环境 | 耗时预期 |
|----|------|------|----------|----------|
| 单元测试 | 纯函数 / 工具 / 解析器 | `src/lib/**/__tests__` | node | < 1s/文件 |
| Hook 测试 | 自定义 Hook 的状态转移 | `src/components/**/__tests__` | jsdom | < 1s/文件 |
| 组件测试 | 单组件渲染与交互 | `src/components/**/__tests__` | jsdom | < 2s/文件 |
| 集成测试 | 多组件 + store + API 联动 | `src/__tests__/integration` | jsdom | < 5s/文件 |
| E2E | 关键用户旅程（可选） | `e2e/` | 真实浏览器 | 单独流水线 |

### 分层原则

- **MUST**：上层测试不得重复下层已覆盖的逻辑，避免金字塔倒置。
- **MUST**：单元测试不依赖 React；Hook/组件测试不发起真实网络请求。
- **SHOULD**：集成测试数量 < 组件测试数量 < 单元测试数量（正金字塔）。

### ✅ 正例

```typescript
// 单元测试：纯函数，无 React
// 文件：src/lib/parsers/__tests__/parse-markdown.test.ts
import { parseMarkdown } from '../parse-markdown';
it('将 # 转为 h1', () => {
  expect(parseMarkdown('# 标题')).toContain('<h1>标题</h1>');
});
```

### ❌ 反例

```typescript
// ❌ 把整页渲染塞进单元测试，依赖 React + store + API
// 文件：src/lib/parsers/__tests__/parse-markdown.test.ts
import { render } from '@testing-library/react';
it('解析', () => {
  render(<App />);  // ❌ 单元测试不应渲染整个 App
});
```

---

## 2. 命名约定

| 对象 | 规则 | 示例 |
|------|------|------|
| 测试文件 | 源名 + `.test.ts(x)` | `annotation-store.test.ts`、`reading-view.test.tsx` |
| `describe` | 被测组件/函数名（PascalCase） | `describe('ReadingView', ...)` |
| `it` | 行为描述，"做某事时，应得到某结果" | `it('loading 为 true 时显示 Spinner', ...)` |
| 变量名 | `actual` / `expected` 或业务名 | 禁止 `a`、`b`、`result2` |

### ✅ 正例

```typescript
// 文件：src/components/read/__tests__/reading-view.test.tsx
describe('ReadingView', () => {
  it('loading 为 true 时显示 Spinner', () => {
    const { getByTestId } = render(<ReadingView content="" isLoading={true} error={null} />);
    expect(getByTestId('spinner')).toBeInTheDocument();
  });

  it('error 非空时显示错误横幅并包含错误信息', () => {
    const { getByText } = render(<ReadingView content="" isLoading={false} error="网络超时" />);
    expect(getByText('网络超时')).toBeInTheDocument();
  });
});
```

### ❌ 反例

```typescript
// ❌ describe 用文件名、it 用"测试1"、变量名无意义
describe('reading-view.test', () => {
  it('测试1', () => {
    const a = render(<ReadingView content="" isLoading={true} error={null} />);
    expect(a.queryByTestId('spinner')).toBeTruthy();  // ❌ 用 truthy 而非 toBeInTheDocument
  });
});
```

---

## 3. 覆盖率要求

| 模块类型 | 行覆盖率 | 分支覆盖率 | 函数覆盖率 |
|----------|----------|------------|------------|
| 工具 / 解析器（`src/lib`） | ≥ 90% | ≥ 85% | ≥ 90% |
| 自定义 Hook | ≥ 85% | ≥ 80% | ≥ 85% |
| Zustand store | ≥ 85% | ≥ 80% | ≥ 85% |
| 组件（`src/components`） | ≥ 70% | ≥ 60% | ≥ 70% |
| 集成测试 | 关键路径 100% | — | — |

### 配置（在 `vitest.config.ts` 中强制）

```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['src/lib/**/*.ts', 'src/stores/**/*.ts', 'src/components/**/*.{ts,tsx}'],
  exclude: ['**/__tests__/**', '**/*.test.*', '**/index.ts'],
  thresholds: {
    lines: 80,
    branches: 75,
    functions: 80,
    perFile: true,        // 每个文件单独卡阈值，防止被平均
  },
},
```

### CI 强制

```bash
# 覆盖率不达标即 CI 失败
vitest run --coverage --coverage.thresholds.lines=80
```

---

## 4. 关键路径必须覆盖

以下路径**MUST** 100% 覆盖成功 + 失败两个分支：

### 4.1 数据获取（成功 + 失败）

#### ✅ 正例

```typescript
describe('fetchArticle', () => {
  it('接口正常时返回解析后的文章', async () => {
    vi.mocked(api.fetchArticle).mockResolvedValue({ markdown: '# 标题' });
    const result = await fetchArticle('id-1');
    expect(result.content).toContain('<h1>标题</h1>');
  });

  it('接口 500 时抛出带状态码的错误', async () => {
    vi.mocked(api.fetchArticle).mockRejectedValue(new Error('HTTP 500'));
    await expect(fetchArticle('id-1')).rejects.toThrow('HTTP 500');
  });

  it('接口超时时重试 3 次后失败', async () => {
    vi.mocked(api.fetchArticle).mockRejectedValue(new Error('timeout'));
    await expect(fetchArticle('id-1')).rejects.toThrow('timeout');
    expect(api.fetchArticle).toHaveBeenCalledTimes(3);   // 验证重试次数
  });
});
```

### 4.2 状态转换（三态机）

```typescript
describe('article 状态机', () => {
  it('idle → loading → success', () => {
    const store = useArticleStore.getState();
    expect(store.status).toBe('idle');
    store.beginLoading();
    expect(useArticleStore.getState().status).toBe('loading');
    store.success({ content: 'x' });
    expect(useArticleStore.getState().status).toBe('success');
  });

  it('loading → error 时 error 字段被填充且 data 为 null', () => {
    const store = useArticleStore.getState();
    store.beginLoading();
    store.fail('网络错误');
    const s = useArticleStore.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBe('网络错误');
    expect(s.data).toBeNull();
  });
});
```

### 4.3 用户交互

```typescript
it('点击重试按钮重新触发 fetchArticle', async () => {
  vi.mocked(api.fetchArticle).mockRejectedValueOnce(new Error('fail'));
  const { getByRole } = render(<ReadingContainer articleId="id-1" />);
  await waitFor(() => getByRole('button', { name: '重试' }));
  await userEvent.click(getByRole('button', { name: '重试' }));
  expect(api.fetchArticle).toHaveBeenCalledTimes(2);
});
```

### 4.4 边界条件

```typescript
describe('parseMarkdown 边界', () => {
  it('空字符串返回空字符串', () => expect(parseMarkdown('')).toBe(''));
  it('null 抛 TypeError',     () => expect(() => parseMarkdown(null as unknown as string)).toThrow(TypeError));
  it('超长输入（10MB）不栈溢出', () => {
    const huge = '# ' + 'a'.repeat(10 * 1024 * 1024);
    expect(() => parseMarkdown(huge)).not.toThrow();
  });
});
```

---

## 5. Mock 规范

### 5.1 只 Mock 外部依赖

| 允许 Mock | 禁止 Mock |
|-----------|-----------|
| `fetch` / Tauri invoke / 第三方 API | 被测函数本身 |
| 文件系统 / 时间 / 随机 | 被测模块的内部纯函数 |
| 外部 store（仅集成测试） | 当前测试的 store |

### 5.2 `vi.mock()` 用法

#### ✅ 正例

```typescript
// 文件顶部 mock 整个模块
vi.mock('@/lib/api', () => ({
  fetchArticle: vi.fn(),
  saveAnnotation: vi.fn(),
}));

import { fetchArticle } from '@/lib/api';  // 导入的是 mock 版本

beforeEach(() => {
  vi.clearAllMocks();          // ✅ 每个用例前清空调用记录与返回值
});

afterEach(() => {
  vi.restoreAllMocks();        // ✅ 还原 spy
});
```

#### ❌ 反例

```typescript
// ❌ 在用例内 mock 被测函数本身
it('测试', () => {
  vi.mock('@/lib/parse', () => ({ parseMarkdown: () => '<h1>x</h1>' }));
  // 此时测的是 mock，不是真实逻辑
});
```

### 5.3 `vi.clearAllMocks()` 必须置于 `beforeEach`

```typescript
beforeEach(() => {
  vi.clearAllMocks();           // 清 call history + mockReturnValue，但保留实现
  // vi.resetAllMocks();        // 更严格：还清实现，需重新 mockResolvedValue
});
```

### 5.4 时间 Mock

```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('1 秒后触发回调', () => {
  const cb = vi.fn();
  setInterval(cb, 1000);
  vi.advanceTimersByTime(1000);
  expect(cb).toHaveBeenCalledTimes(1);
});
```

---

## 6. AAA 模式

每个用例必须按 **Arrange / Act / Assert** 三段式书写，段间空行分隔。

### ✅ 正例

```typescript
it('loading 由 true 转 false 时显示内容', () => {
  // Arrange
  const props = { content: '<p>正文</p>', isLoading: false, error: null };

  // Act
  const { getByText } = render(<ReadingView {...props} />);

  // Assert
  expect(getByText('正文')).toBeInTheDocument();
});
```

### ❌ 反例

```typescript
// ❌ Arrange/Act/Assert 混在一起，断言穿插在渲染中
it('显示内容', () => {
  const { getByText } = render(<ReadingView content="<p>正文</p>" isLoading={false} error={null} />);
  expect(getByText('正文')).toBeInTheDocument();
  const { getByText: g2 } = render(<ReadingView content="<p>改</p>" isLoading={false} error={null} />);
  expect(g2('改')).toBeInTheDocument();   // ❌ 一个用例两轮 Act，应拆成两个 it
});
```

### 单一断言原则

- **SHOULD**：每个 `it` 只断言一个行为（可有多条 `expect` 验证同一行为的不同侧面）。
- **MUST**：禁止一个 `it` 验证多个不相关行为，拆成多个 `it`。

---

## 附录：组件测试模板

```typescript
// 文件：src/components/read/__tests__/reading-view.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReadingView } from '../reading-view';

describe('ReadingView', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('loading 为 true 时显示 Spinner', () => {
    render(<ReadingView content="" isLoading={true} error={null} />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('error 非空时显示错误横幅与重试按钮', () => {
    render(<ReadingView content="" isLoading={false} error="超时" />);
    expect(screen.getByText('超时')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('正常态渲染 content', () => {
    render(<ReadingView content="<p>正文</p>" isLoading={false} error={null} />);
    expect(screen.getByText('正文')).toBeInTheDocument();
  });
});
```

---

> 本规范由代码规范文档工程师维护，覆盖率不达标的 PR 不得合入。