/**
 * GitHub blog 链接解析器
 *
 * 支持的链接形式：
 * 1. 仓库 README：https://github.com/user/repo
 * 2. GitHub Pages 博客：https://user.github.io/ 或 https://user.github.io/repo/
 * 3. 博客文章：https://user.github.io/repo/posts/xxx
 * 4. 仓库内文件：https://github.com/user/repo/blob/master/README.md
 *
 * 实现策略：
 * - github.com/user/repo：调用 GitHub API 获取 README（base64 编码）
 * - github.com/user/repo/blob/<branch>/<path>：调用 GitHub API 获取文件内容
 * - user.github.io：直接抓取网页，用 Readability 提取
 *
 * GitHub API 无需 token 即可使用，但有速率限制（未认证 60 次/小时/IP）。
 */

import { Readability } from '@mozilla/readability';
import { invoke } from '@tauri-apps/api/core';

/** GitHub 链接类型 */
export type GitHubLinkType = 'repo-readme' | 'github-pages' | 'blog-post' | 'file';

/** GitHub 文章解析结果 */
export interface GitHubArticle {
  /** 标题 */
  title: string;
  /** 正文 HTML 或 Markdown */
  content: string;
  /** 纯文本 */
  textContent: string;
  /** 仓库作者 */
  author: string;
  /** 仓库名 */
  repoName: string;
  /** 原始 URL */
  url: string;
  /** 链接类型 */
  type: GitHubLinkType;
}

/** 解析返回的统一封装 */
export interface GitHubParseResult {
  success: boolean;
  data?: GitHubArticle;
  error?: string;
}

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT = 30000;

/** GitHub API 基址 */
const GITHUB_API = 'https://api.github.com';

/**
 * GitHub 链接解析器
 */
export class GitHubParser {
  /**
   * 判断 URL 是否为 GitHub 链接
   * 兼容 github.com 与 *.github.io
   */
  static isGitHubUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      return (
        u.hostname === 'github.com' || u.hostname.endsWith('.github.io')
      );
    } catch {
      return false;
    }
  }

  /**
   * 解析 GitHub 链接
   * @param url GitHub 链接
   * @param timeout 超时毫秒，默认 30000
   */
  static async parse(
    url: string,
    timeout: number = DEFAULT_TIMEOUT
  ): Promise<GitHubParseResult> {
    if (!GitHubParser.isGitHubUrl(url)) {
      return { success: false, error: '不是 GitHub 链接' };
    }

    const u = new URL(url);

    // 1) user.github.io 形式：直接抓取网页
    if (u.hostname.endsWith('.github.io')) {
      return GitHubParser.parseGitHubPages(url, timeout);
    }

    // 2) github.com 形式
    const segments = u.pathname.split('/').filter(Boolean);
    // segments 形如 [user, repo] 或 [user, repo, blob, branch, ...path]
    if (segments.length < 2) {
      return { success: false, error: 'GitHub 链接缺少 user/repo' };
    }

    const [user, repo, kind, branch, ...pathParts] = segments;

    // 2a) 文件链接：github.com/user/repo/blob/<branch>/<path>
    if (kind === 'blob' && branch && pathParts.length > 0) {
      const filePath = pathParts.join('/');
      return GitHubParser.parseFile(user, repo, branch, filePath, url, timeout);
    }

    // 2b) 仓库主页：获取 README
    if (!kind) {
      return GitHubParser.parseRepoReadme(user, repo, url, timeout);
    }

    // 其它形式（如 tree/commit/issues）暂不支持，回退为网页抓取
    return GitHubParser.parseGitHubPages(url, timeout);
  }

  /**
   * 解析仓库 README
   * 调用 GET /repos/{owner}/{repo}/readme
   * 返回 { content: base64, encoding, name, path, ... }
   */
  private static async parseRepoReadme(
    user: string,
    repo: string,
    url: string,
    timeout: number
  ): Promise<GitHubParseResult> {
    const api = `${GITHUB_API}/repos/${user}/${repo}/readme`;
    const result = await GitHubParser.fetchJson<{
      content: string;
      encoding: string;
      name: string;
    }>(api, timeout);

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const { content: b64, encoding, name } = result.data;
    let markdown = '';
    try {
      if (encoding === 'base64') {
        markdown = GitHubParser.decodeBase64Utf8(b64);
      } else {
        markdown = b64;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `README 解码失败: ${msg}` };
    }

    const data: GitHubArticle = {
      title: `${user}/${repo} - ${name}`,
      content: markdown,
      textContent: markdown,
      author: user,
      repoName: repo,
      url,
      type: 'repo-readme',
    };
    return { success: true, data };
  }

  /**
   * 解析仓库内文件
   * 调用 GET /repos/{owner}/{repo}/contents/{path}?ref={branch}
   * 返回 { content: base64, encoding, name, path, ... }
   */
  private static async parseFile(
    user: string,
    repo: string,
    branch: string,
    filePath: string,
    url: string,
    timeout: number
  ): Promise<GitHubParseResult> {
    const api = `${GITHUB_API}/repos/${user}/${repo}/contents/${encodeURIComponent(
      filePath
    )}?ref=${encodeURIComponent(branch)}`;
    const result = await GitHubParser.fetchJson<{
      content: string;
      encoding: string;
      name: string;
    }>(api, timeout);

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    const { content: b64, encoding } = result.data;
    let text = '';
    try {
      if (encoding === 'base64') {
        text = GitHubParser.decodeBase64Utf8(b64);
      } else {
        text = b64;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `文件解码失败: ${msg}` };
    }

    const data: GitHubArticle = {
      title: `${user}/${repo}/${filePath}`,
      content: text,
      textContent: text,
      author: user,
      repoName: repo,
      url,
      type: 'file',
    };
    return { success: true, data };
  }

  /**
   * 解析 GitHub Pages / 博客文章
   * 直接抓取网页，用 Readability 提取正文
   */
  private static async parseGitHubPages(
    url: string,
    timeout: number
  ): Promise<GitHubParseResult> {
    const fetchResult = await GitHubParser.fetchHtml(url, timeout);
    if (!fetchResult.ok) {
      return { success: false, error: fetchResult.error };
    }

    try {
      const doc = new DOMParser().parseFromString(fetchResult.html, 'text/html');
      const reader = new Readability(doc);
      const article = reader.parse();

      if (!article) {
        return { success: false, error: 'Readability 未能提取正文' };
      }

      const u = new URL(url);
      // user.github.io -> user
      const author = u.hostname.endsWith('.github.io')
        ? u.hostname.replace('.github.io', '')
        : u.hostname;
      // 路径首段视为 repo 名（根路径时为空）
      const segs = u.pathname.split('/').filter(Boolean);
      const repoName = segs[0] || '';
      // 是否为博客文章：路径含 posts/ 或 /posts/ 类似片段
      const isPost = segs.some((s) => s.toLowerCase() === 'posts');

      const data: GitHubArticle = {
        title: article.title || doc.title || '',
        content: article.content || '',
        textContent: article.textContent || '',
        author,
        repoName,
        url,
        type: isPost ? 'blog-post' : 'github-pages',
      };
      return { success: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: `HTML 解析失败: ${msg}` };
    }
  }

  /**
   * 抓取 HTML 文本
   * 返回判别联合类型，便于调用处类型收窄
   */
  private static async fetchHtml(
    url: string,
    _timeout: number
  ): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
    try {
      const html = await invoke<string>('fetch_url', { url });
      if (!html || html.length === 0) {
        return { ok: false, error: '返回内容为空' };
      }
      return { ok: true, html };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `请求失败: ${msg}` };
    }
  }

  /**
   * 抓取 JSON（GitHub API）
   * 返回判别联合类型，便于调用处类型收窄
   */
  private static async fetchJson<T>(
    url: string,
    timeout: number
  ): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github+json',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        credentials: 'omit',
        mode: 'cors',
      });
      if (!resp.ok) {
        return {
          ok: false,
          error: `GitHub API 错误: ${resp.status} ${resp.statusText}`,
        };
      }
      const data = (await resp.json()) as T;
      return { ok: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (controller.signal.aborted) {
        return { ok: false, error: `请求超时: ${timeout}ms` };
      }
      return { ok: false, error: `请求失败: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 解码 base64 字符串为 UTF-8 文本
   * GitHub API 返回的 base64 可能含换行符，需先去除
   */
  private static decodeBase64Utf8(b64: string): string {
    const cleaned = b64.replace(/\s/g, '');
    const binary = atob(cleaned);
    // 处理多字节 UTF-8 字符
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
}