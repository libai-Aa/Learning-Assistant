/**
 * WPS Office 桥接层（前端 TypeScript 侧）
 *
 * 设计思路（说人话）：
 *  这个文件是"AI ↔ WPS"的中间人。AI 想让 WPS 干活（开文档、做 PPT、写文章），
 *  不直接去碰 WPS，而是先告诉桥接层，桥接层再通过 Tauri 的 invoke 把命令
 *  送到 Rust 后端，Rust 后端再用 COM/命令行真正去操控 WPS。
 *
 *  为什么要分两层？
 *    - 前端（这里）：负责"语义"，比如把"我要做一个 PPT"翻译成结构化参数，
 *      维护文档列表、操作历史、错误包装，方便 AI 调用。
 *    - 后端（Rust）：负责"执行"，真正去调 Windows COM / 启动进程 / 读写文件。
 *
 *  如果运行环境没有 Tauri（比如纯 Web 或单元测试），桥接层会自动降级到
 *  "Mock 模式"，返回模拟数据，保证不抛异常、不阻塞 AI 流程。
 *
 * 物理原理类比：
 *  桥接层就像"翻译官"——AI 说一种话，WPS 听另一种话，中间需要一个人把
 *  意图准确翻译过去，并把 WPS 的反馈再翻译回来。翻译官还要记账（操作历史），
 *  这样下次遇到类似需求，可以参考用户上次满意的模板，逐步"更懂你"。
 */

import type {
  WPSBridge,
  WPSBridgeConfig,
  WPSContentChange,
  WPSDocument,
  WPSDocumentContent,
  WPSDocumentType,
  WPSExportFormat,
  WPSInstallation,
  WPSOperation,
  WPSAppName,
} from '../../types/wps';
import {
  DEFAULT_WPS_BRIDGE_CONFIG,
  DOCUMENT_TYPE_DEFAULT_NAME,
  DOCUMENT_TYPE_TO_APP,
  WPSError,
  generateDocumentId,
  inferDocumentType,
} from '../../types/wps';

/**
 * Tauri invoke 函数签名
 * 在 Tauri 环境下由 `@tauri-apps/api` 提供；非 Tauri 环境下为 undefined
 */
type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/**
 * 桥接层内部状态
 */
interface BridgeState {
  /** 当前打开的文档（按 ID 索引） */
  openDocuments: Map<string, WPSDocument>;
  /** 操作历史（最近 N 条） */
  operationHistory: WPSOperation[];
  /** 历史记录上限 */
  historyLimit: number;
  /** 安装信息缓存 */
  installationCache?: WPSInstallation;
  /** 安装信息缓存时间戳 */
  installationCacheAt?: number;
  /** 安装信息缓存有效期（毫秒） */
  installationCacheTtlMs: number;
}

/**
 * 默认历史记录上限
 */
const DEFAULT_HISTORY_LIMIT = 200;

/**
 * 默认安装信息缓存有效期：5 分钟
 */
const INSTALLATION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 安全获取 Tauri invoke
 * 不存在时返回 undefined，调用方据此降级
 */
function getTauriInvoke(): TauriInvoke | undefined {
  // 优先使用显式注入的 invoke（便于测试与定制）
  if (typeof globalThis !== 'undefined' && (globalThis as { __wpsTauriInvoke?: TauriInvoke }).__wpsTauriInvoke) {
    return (globalThis as { __wpsTauriInvoke?: TauriInvoke }).__wpsTauriInvoke;
  }
  // Tauri 环境下 window.__TAURI__.invoke 存在
  if (typeof window !== 'undefined') {
    const tauri = (window as { __TAURI__?: { invoke?: TauriInvoke } }).__TAURI__;
    if (tauri?.invoke) {
      return tauri.invoke;
    }
  }
  return undefined;
}

/**
 * 带超时的 Promise 包装
 * 防止 WPS 卡死导致 AI 永久等待
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new WPSError('TIMEOUT', `操作超时: ${operation} (${timeoutMs}ms)`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * 把任意错误包装成 WPSError
 */
function wrapError(err: unknown, defaultCode: WPSError['code'], documentId?: string): WPSError {
  if (err instanceof WPSError) {
    return err;
  }
  const message = err instanceof Error ? err.message : String(err);
  return new WPSError(defaultCode, message, { documentId, cause: err });
}

/**
 * 从文件路径提取文件名
 */
function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * WPS 桥接层实现
 *
 * 这是导出给 AI / 上层业务使用的统一入口。
 * 通过 `getWPSBridge()` 获取单例，避免重复初始化。
 */
export class WPSBridgeImpl implements WPSBridge {
  private readonly config: WPSBridgeConfig;
  private readonly state: BridgeState;
  private readonly invoke: TauriInvoke | undefined;

  constructor(config: Partial<WPSBridgeConfig> = {}) {
    this.config = { ...DEFAULT_WPS_BRIDGE_CONFIG, ...config };
    this.invoke = getTauriInvoke();
    this.state = {
      openDocuments: new Map(),
      operationHistory: [],
      historyLimit: DEFAULT_HISTORY_LIMIT,
      installationCacheTtlMs: INSTALLATION_CACHE_TTL_MS,
    };

    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.debug('[WPSBridge] 初始化完成, tauri可用=', !!this.invoke, 'config=', this.config);
    }
  }

  /**
   * 日志输出（仅 debug 模式）
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.config.debug) {
      // eslint-disable-next-line no-console
      console.debug(`[WPSBridge] ${message}`, ...args);
    }
  }

  /**
   * 记录操作历史
   */
  private recordOperation(op: WPSOperation): void {
    this.state.operationHistory.push(op);
    if (this.state.operationHistory.length > this.state.historyLimit) {
      // 超出上限时丢弃最旧记录
      this.state.operationHistory.shift();
    }
  }

  /**
   * 构造操作记录的辅助方法
   */
  private async runOperation<T>(
    type: WPSOperation['type'],
    params: Record<string, unknown>,
    fn: () => Promise<T>,
    documentId?: string
  ): Promise<T> {
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();
    try {
      const result = await fn();
      this.recordOperation({
        type,
        documentId,
        params,
        result,
        timestamp,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (err) {
      const wpsErr = wrapError(err, 'UNKNOWN', documentId);
      this.recordOperation({
        type,
        documentId,
        params,
        timestamp,
        success: false,
        error: wpsErr.message,
        durationMs: Date.now() - startedAt,
      });
      throw wpsErr;
    }
  }

  /**
   * 调用 Tauri Command（带降级与超时）
   *
   * 说人话：先看有没有 Tauri，没有就走 mock；有就调后端命令，超时直接报错。
   */
  private async invokeCommand<T>(
    command: string,
    args: Record<string, unknown> = {},
    mockValue: T
  ): Promise<T> {
    if (!this.invoke) {
      this.log(`无 Tauri 环境，降级 mock: ${command}`);
      return mockValue;
    }
    this.log(`调用 Tauri 命令: ${command}`, args);
    const raw = await withTimeout(
      this.invoke(command, args) as Promise<T>,
      this.config.timeoutMs,
      command
    );
    return raw;
  }

  // ============ 接口实现 ============

  /**
   * 检测 WPS 是否安装
   * 5 分钟内重复检测会使用缓存，避免频繁读注册表
   */
  async isInstalled(): Promise<WPSInstallation> {
    const now = Date.now();
    if (
      this.state.installationCache &&
      this.state.installationCacheAt &&
      now - this.state.installationCacheAt < this.state.installationCacheTtlMs
    ) {
      this.log('使用安装信息缓存');
      return this.state.installationCache;
    }

    const installation = await this.runOperation(
      'read',
      {},
      () =>
        this.invokeCommand<WPSInstallation>(
          'wps_is_installed',
          {},
          { installed: false, detectedBy: 'path' }
        ),
      undefined
    );

    this.state.installationCache = installation;
    this.state.installationCacheAt = now;
    return installation;
  }

  /**
   * 启动 WPS 应用
   */
  async startWPS(app: WPSAppName = 'wps'): Promise<boolean> {
    return this.runOperation(
      'open',
      { app },
      async () => {
        const installation = await this.isInstalled();
        if (!installation.installed) {
          throw new WPSError('WPS_NOT_INSTALLED', 'WPS Office 未安装，无法启动');
        }
        return this.invokeCommand<boolean>('wps_start', { app }, true);
      }
    );
  }

  /**
   * 退出 WPS 应用
   */
  async quitWPS(app: WPSAppName = 'wps'): Promise<boolean> {
    return this.runOperation(
      'close',
      { app },
      () => this.invokeCommand<boolean>('wps_quit', { app }, true)
    );
  }

  /**
   * 打开已有文档
   */
  async openDocument(path: string): Promise<WPSDocument> {
    return this.runOperation<WPSDocument>(
      'open',
      { path },
      async () => {
        const type = inferDocumentType(path);
        if (!type) {
          throw new WPSError('INVALID_FORMAT', `无法识别的文档类型: ${path}`);
        }

        // 重复打开检查：如果已经在打开列表中，直接返回
        for (const doc of this.state.openDocuments.values()) {
          if (doc.path === path && doc.isOpen) {
            this.log('文档已打开，复用句柄', doc.id);
            return doc;
          }
        }

        const installation = await this.isInstalled();
        if (!installation.installed) {
          throw new WPSError('WPS_NOT_INSTALLED', 'WPS Office 未安装，无法打开文档');
        }

        const docId = generateDocumentId();
        const remoteDoc = await this.invokeCommand<Partial<WPSDocument>>(
          'wps_open_document',
          { path, docId },
          {
            id: docId,
            type,
            path,
            name: basename(path),
            isOpen: true,
            lastModified: new Date().toISOString(),
          }
        );

        const doc: WPSDocument = {
          id: remoteDoc.id ?? docId,
          type: remoteDoc.type ?? type,
          path: remoteDoc.path ?? path,
          name: remoteDoc.name ?? basename(path),
          isOpen: remoteDoc.isOpen ?? true,
          lastModified: remoteDoc.lastModified ?? new Date().toISOString(),
          handle: remoteDoc.handle,
          isDirty: remoteDoc.isDirty ?? false,
        };

        this.state.openDocuments.set(doc.id, doc);
        return doc;
      }
    );
  }

  /**
   * 新建文档
   */
  async createDocument(type: WPSDocumentType, name?: string): Promise<WPSDocument> {
    return this.runOperation<WPSDocument>(
      'create',
      { type, name },
      async () => {
        const installation = await this.isInstalled();
        if (!installation.installed) {
          throw new WPSError('WPS_NOT_INSTALLED', 'WPS Office 未安装，无法新建文档');
        }

        const docId = generateDocumentId();
        const docName = name ?? DOCUMENT_TYPE_DEFAULT_NAME[type];
        const remoteDoc = await this.invokeCommand<Partial<WPSDocument>>(
          'wps_create_document',
          { type, docId, name: docName },
          {
            id: docId,
            type,
            path: '',
            name: docName,
            isOpen: true,
            lastModified: new Date().toISOString(),
            isDirty: true,
          }
        );

        const doc: WPSDocument = {
          id: remoteDoc.id ?? docId,
          type: remoteDoc.type ?? type,
          path: remoteDoc.path ?? '',
          name: remoteDoc.name ?? docName,
          isOpen: remoteDoc.isOpen ?? true,
          lastModified: remoteDoc.lastModified ?? new Date().toISOString(),
          handle: remoteDoc.handle,
          isDirty: remoteDoc.isDirty ?? true,
        };

        this.state.openDocuments.set(doc.id, doc);
        return doc;
      }
    );
  }

  /**
   * 读取文档内容（供 AI 消费）
   */
  async readDocument(docId: string): Promise<WPSDocumentContent> {
    return this.runOperation<WPSDocumentContent>(
      'read',
      { docId },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        return this.invokeCommand<WPSDocumentContent>(
          'wps_read_document',
          { docId, path: doc.path, type: doc.type },
          {
            documentId: docId,
            type: doc.type,
            text: '',
          }
        );
      },
      docId
    );
  }

  /**
   * 编辑文档内容
   */
  async editContent(docId: string, changes: WPSContentChange[]): Promise<void> {
    return this.runOperation<void>(
      'edit',
      { docId, changes },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        await this.invokeCommand<void>(
          'wps_edit_content',
          { docId, path: doc.path, type: doc.type, changes },
          undefined
        );
        doc.isDirty = true;
        doc.lastModified = new Date().toISOString();
      },
      docId
    );
  }

  /**
   * 保存文档
   */
  async saveDocument(docId: string): Promise<void> {
    return this.runOperation<void>(
      'save',
      { docId },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        if (!doc.path) {
          throw new WPSError('DOC_NOT_FOUND', `文档尚未保存到磁盘，请使用 saveAs: ${docId}`, {
            documentId: docId,
          });
        }
        await this.invokeCommand<void>(
          'wps_save_document',
          { docId, path: doc.path },
          undefined
        );
        doc.isDirty = false;
        doc.lastModified = new Date().toISOString();
      },
      docId
    );
  }

  /**
   * 另存为
   */
  async saveAs(docId: string, path: string): Promise<void> {
    return this.runOperation<void>(
      'save',
      { docId, path },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        await this.invokeCommand<void>(
          'wps_save_as',
          { docId, sourcePath: doc.path, targetPath: path },
          undefined
        );
        doc.path = path;
        doc.name = basename(path);
        doc.isDirty = false;
        doc.lastModified = new Date().toISOString();
      },
      docId
    );
  }

  /**
   * 导出为指定格式
   * @returns 导出文件路径
   */
  async exportDocument(
    docId: string,
    format: WPSExportFormat,
    params: Record<string, unknown> = {}
  ): Promise<string> {
    return this.runOperation<string>(
      'export',
      { docId, format, params },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        if (!doc.path) {
          throw new WPSError('DOC_NOT_FOUND', `文档尚未保存，无法导出: ${docId}`, {
            documentId: docId,
          });
        }
        const exportPath = await this.invokeCommand<string>(
          'wps_export_document',
          { docId, path: doc.path, format, params },
          `${doc.path}.${format}`
        );
        return exportPath;
      },
      docId
    );
  }

  /**
   * 关闭文档
   * @param save 是否在关闭前保存
   */
  async closeDocument(docId: string, save = false): Promise<void> {
    return this.runOperation<void>(
      'close',
      { docId, save },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc) {
          this.log(`文档不存在于打开列表，跳过关闭: ${docId}`);
          return;
        }
        if (!doc.isOpen) {
          this.log(`文档已关闭: ${docId}`);
          return;
        }
        await this.invokeCommand<void>(
          'wps_close_document',
          { docId, path: doc.path, save },
          undefined
        );
        doc.isOpen = false;
        this.state.openDocuments.delete(docId);
      },
      docId
    );
  }

  /**
   * 执行 WPS 宏/自动化脚本
   *
   * 用途：当结构化 editContent 不够用时，可以直接传一段 WPS VBA / JS 宏，
   * 让 WPS 自己执行更复杂的操作（比如批量改版式、套用模板）。
   */
  async executeMacro(docId: string, macro: string, args: unknown[] = []): Promise<unknown> {
    return this.runOperation<unknown>(
      'macro',
      { docId, macro, args },
      async () => {
        const doc = this.state.openDocuments.get(docId);
        if (!doc || !doc.isOpen) {
          throw new WPSError('DOC_NOT_OPEN', `文档未打开: ${docId}`, { documentId: docId });
        }
        return this.invokeCommand<unknown>(
          'wps_execute_macro',
          { docId, path: doc.path, macro, args },
          undefined
        );
      },
      docId
    );
  }

  /**
   * 获取当前打开的所有文档
   */
  async listOpenDocuments(): Promise<WPSDocument[]> {
    return Array.from(this.state.openDocuments.values()).filter((d) => d.isOpen);
  }

  /**
   * 获取操作历史记录
   */
  async getOperationHistory(): Promise<WPSOperation[]> {
    return [...this.state.operationHistory];
  }

  /**
   * 清空操作历史（用于测试或隐私清理）
   */
  clearHistory(): void {
    this.state.operationHistory = [];
  }

  /**
   * 清除安装信息缓存（强制下次重新检测）
   */
  invalidateInstallationCache(): void {
    this.state.installationCache = undefined;
    this.state.installationCacheAt = undefined;
  }

  /**
   * 获取当前配置（只读视图）
   */
  getConfig(): Readonly<WPSBridgeConfig> {
    return { ...this.config };
  }

  /**
   * 根据文档类型获取对应的 WPS 应用模块
   */
  static getAppForType(type: WPSDocumentType): WPSAppName {
    return DOCUMENT_TYPE_TO_APP[type];
  }
}

// ============ 单例管理 ============

let bridgeSingleton: WPSBridgeImpl | null = null;

/**
 * 获取 WPS 桥接层单例
 *
 * 推荐用法：
 * ```ts
 * import { getWPSBridge } from '@/lib/wps/wps-bridge';
 * const bridge = getWPSBridge();
 * if ((await bridge.isInstalled()).installed) {
 *   const doc = await bridge.openDocument('D:\\demo.pptx');
 * }
 * ```
 */
export function getWPSBridge(config?: Partial<WPSBridgeConfig>): WPSBridgeImpl {
  if (!bridgeSingleton) {
    bridgeSingleton = new WPSBridgeImpl(config);
  }
  return bridgeSingleton;
}

/**
 * 重置桥接层单例（主要用于测试）
 */
export function resetWPSBridge(config?: Partial<WPSBridgeConfig>): WPSBridgeImpl {
  bridgeSingleton = new WPSBridgeImpl(config);
  return bridgeSingleton;
}

/**
 * 为测试/定制注入 Tauri invoke
 * 在没有真实 Tauri 环境时，可用此函数注入 mock invoke
 */
export function injectTauriInvoke(invoke: TauriInvoke | undefined): void {
  (globalThis as { __wpsTauriInvoke?: TauriInvoke }).__wpsTauriInvoke = invoke;
}