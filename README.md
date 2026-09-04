# LLM Wiki — AI 驱动的个人知识研究系统

> 一个将 **阅读 → 研究 → 知识图谱 → 创作** 打通的全链路桌面应用，让知识不再是孤岛。

## ✨ 项目亮点

### 1. 🧠 Research 全链路：从想法到证伪的自动探索

输入一个想法，系统自动完成 **问题发现 → 方法论展开 → 学术搜索 → 自我证伪 → 再探索** 的完整研究循环（最多 5 轮），每轮结果同步到星空图谱形成可视化知识星座。

- **问题发现引擎**：LLM 从自然语言中提取值得研究的问题，自动分类（概念性/实证性/方法论/矛盾点）
- **方法论引擎**：按苏格拉底追问、五问法、第一性原理展开探索，生成子问题和假设
- **证伪引擎**：对每个假设进行自我证伪，发现薄弱环节后自动进入下一轮探索
- **AMiner 学术搜索**：7 个 AMiner Open Skill 集成——论文搜索、学者搜索、每日推荐、引文校验、PDF 上传核验等，搜索结果自动融入探索流程

### 2. 🌟 星空知识图谱：用星座隐喻可视化知识结构

不是传统的节点-边图谱，而是用 **星座/星系** 的天文隐喻来组织知识：

- 每个问题/想法是一颗 **恒星**（中心星），子问题是 **行星**，关系是 **星座连线**
- 星系类型：question / sub-question / hypothesis / evidence / conclusion / idea
- Research 区探索结果自动生成星座节点，星空图谱实时联动
- 持久化到 localStorage，跨标签页共享状态

### 3. 📝 Read 区：左右分栏阅读 + 画线批注 + 想法捕捉

- 粘贴微信公众号 / GitHub / 任意网页链接，Rust 后端抓取绕过 CORS
- **左右分栏布局**：左侧阅读正文（支持选中文字高亮画线），右侧批注 + 新想法
- 画线文字可再次点击取消，批注和想法自动保存
- 链接列表 → 点击进入阅读页面 → 返回列表，交互流畅

### 4. 📊 WPS 助手：更懂你的 PPT/文章创作

不是简单的"生成 PPT"，而是 **学习你的风格 → 匹配模板 → 检索知识 → 生成 → 反思评估 → 导出** 的完整流水线：

- **风格学习**：从你满意的模板中分析配色、字体、排版偏好，逐步建立风格画像
- **模板管理**：分类存放满意的模板文章/PPT，按场景智能推荐
- **PPT 生成 + 反思评估**：生成后自动从 Content/Design/Coherence 三维度评分，<80 分自动迭代改进
- **PPT 导出**：使用 pptxgenjs 生成真实 .pptx 文件，莫兰迪配色方案，一键导出到本地
- **文章写作辅助**：基于模板 + 偏好 + 知识库，调用 WPS 完成文档创作

### 5. 🔄 Agent 夜间自动更新

每晚凌晨 2 点自动执行知识库更新：

- 调用 AMiner 获取最新论文推荐
- 与现有知识库比对，发现新知识/新连接
- 用 LLM 生成更新建议，保存更新日志
- UI 显示上次更新时间和状态

### 6. 💬 AI 对话：LaTeX 公式 + 主备 API 自动切换

- **主备 API 链**：SenseNova (DeepSeek V4 Flash) → Agnes AI (Agnes 2.5 Flash)，主 API 失败自动切换备用
- **LaTeX 公式渲染**：行内 `$...$` 和块级 `$$...$$`，用 KaTeX 精确渲染
- **System Prompt 工程**：专业名词作解释、核心详细说明、来龙去脉讲清楚、生动形象、搭配公式说明
- 所有 LLM 请求通过 Rust 后端转发，绕过浏览器 CORS

### 7. 📖 知识库：拖拽上传 + 多格式解析

- 拖拽文件到知识库区域，自动复制到 `knowledge-materials/` 目录
- 支持 PDF / DOCX / Markdown / 纯文本解析
- 文件列表按修改时间排序，点击可内嵌预览（10MB 以内文本文件）
- 存储空间软限制提示（1GB）

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│                  Tauri 2.x 桌面壳               │
│  ┌─────────────────────────────────────────┐    │
│  │         Rust 后端 (src-tauri/)          │    │
│  │  • fetch_url — 网页抓取（SSRF 防护）     │    │
│  │  • llm_chat — LLM API 转发              │    │
│  │  • aminer_request — AMiner JWT 签名转发  │    │
│  │  • aminer_upload_pdf — PDF 引文校验上传  │    │
│  │  • write_binary_file — PPT 导出          │    │
│  │  • 内置 HTTP 服务器 (127.0.0.1:18080)    │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │      React 19 前端 (src/)               │    │
│  │  • Zustand 5 状态管理 + persist 持久化   │    │
│  │  • React.lazy + ErrorBoundary 容错加载   │    │
│  │  • KaTeX 公式 / Marked Markdown / DOMPurify│   │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**关键技术选型：**

| 层 | 技术 | 版本 | 选型理由 |
|---|---|---|---|
| 桌面框架 | Tauri | 2.x | Rust 后端安全 + 小体积 exe (15MB) |
| 前端框架 | React | 19.0 | 最新并发特性 + Suspense |
| 状态管理 | Zustand | 5.0 | 轻量、persist 中间件、无样板代码 |
| 构建工具 | Vite | 5.4 | 快速 HMR + 生产构建 |
| 测试框架 | Vitest | 2.1 | 与 Vite 零配置集成 |
| 代码规范 | ESLint 9 + Prettier | latest | Flat Config + Husky pre-commit |
| 学术 API | AMiner Open Platform | 7 Skills | 论文搜索/引文校验/每日推荐 |
| LLM API | DeepSeek V4 Flash + Agnes 2.5 | — | 主备自动切换 |

## 🔒 安全设计

- **SSRF 防护**：所有后端 HTTP 请求验证 URL，禁止内网/本地/私有地址
- **路径穿越防护**：所有文件操作验证路径在数据目录内，拒绝 `..` 和绝对路径
- **命令注入防护**：`open_file` 命令验证路径不含 cmd 元字符
- **API Key 隔离**：AMiner API Key 仅在 Rust 后端使用，前端不接触敏感凭证
- **JWT 后端签名**：AMiner JWT 在 Rust 后端生成，前端只调用 `invoke('aminer_request')`

## 📁 项目结构

```
src/
├── components/
│   ├── read/          # Read 区：链接接收、批注、想法捕捉
│   ├── research/      # Research 区：实验报告、探索时间线
│   ├── graph/         # 星空图谱可视化
│   ├── wps/           # WPS 助手：PPT/文章/模板
│   ├── common/        # ErrorBoundary 等通用组件
│   └── sources/       # 知识库源视图
├── lib/
│   ├── research/      # 问题发现、方法论、证伪引擎
│   ├── aminer/        # AMiner 7 Skill 适配器
│   ├── agent/         # 思维链捕捉、偏好学习、夜间更新
│   ├── wps/           # PPT 生成、文章写作、风格学习
│   ├── read/          # 微信/GitHub 解析器、网页抓取
│   ├── parsers/       # PDF/DOCX 解析器
│   ├── api/           # LLM 客户端（主备切换）
│   └── graph/         # 星空布局、星座算法
├── stores/            # Zustand stores（7 个领域 store）
├── types/             # TypeScript 类型定义
└── App.tsx            # 主入口（6 标签页 + 动态加载）

src-tauri/
├── src/
│   ├── lib.rs         # Rust 后端命令（fetch/llm/aminer/file）
│   ├── main.rs        # Tauri 入口
│   └── wps_integration.rs  # WPS COM 调用
├── Cargo.toml         # Rust 依赖
└── tauri.conf.json    # Tauri 配置
```

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri:dev

# 生产构建
npm run tauri:build

# 运行测试
npm test

# 代码检查
npm run lint && npm run typecheck
```

## 📊 项目数据

- **代码量**：90,000+ 行（240 个文件）
- **测试**：1,047 个测试用例
- **exe 体积**：15 MB（Tauri 2.x）
- **前端构建产物**：2.7 MB
- **AMiner Skills**：7 个学术搜索能力
- **LLM API**：2 个（主备自动切换）

## 📄 License

MIT