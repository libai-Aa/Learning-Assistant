/**
 * WPS 桥接层单元测试
 *
 * 测试策略：
 *  - 不依赖真实 Tauri 环境与真实 WPS 安装
 *  - 通过 `injectTauriInvoke` 注入 mock invoke，模拟后端响应
 *  - 验证桥接层的语义转换、状态管理、错误包装、操作历史等"前端职责"
 *  - 不测试 Rust 后端（后端有自己的 #[cfg(test)] 单元测试）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetWPSBridge,
  injectTauriInvoke,
  getWPSBridge,
  WPSBridgeImpl,
} from '../wps/wps-bridge';
import {
  WPSError,
  inferDocumentType,
  generateDocumentId,
  DOCUMENT_TYPE_TO_APP,
  DOCUMENT_TYPE_TO_EXTENSION,
  DOCUMENT_TYPE_DEFAULT_NAME,
  DEFAULT_WPS_BRIDGE_CONFIG,
} from '../../types/wps';
import type {
  WPSInstallation,
  WPSDocument,
  WPSDocumentType,
  WPSContentChange,
} from '../../types/wps';

// ============ 类型定义测试 ============

describe('WPS 类型定义', () => {
  describe('inferDocumentType', () => {
    it('应该识别 PPT/PPTX 为 ppt', () => {
      expect(inferDocumentType('demo.ppt')).toBe('ppt');
      expect(inferDocumentType('demo.pptx')).toBe('ppt');
      expect(inferDocumentType('D:\\docs\\demo.PPTX')).toBe('ppt');
    });

    it('应该识别 DOC/DOCX/WPS 为 word', () => {
      expect(inferDocumentType('demo.doc')).toBe('word');
      expect(inferDocumentType('demo.docx')).toBe('word');
      expect(inferDocumentType('demo.wps')).toBe('word');
    });

    it('应该识别 PDF 为 pdf', () => {
      expect(inferDocumentType('demo.pdf')).toBe('pdf');
    });

    it('应该识别 XLS/XLSX/ET 为 excel', () => {
      expect(inferDocumentType('demo.xls')).toBe('excel');
      expect(inferDocumentType('demo.xlsx')).toBe('excel');
      expect(inferDocumentType('demo.et')).toBe('excel');
    });

    it('对未知扩展名返回 null', () => {
      expect(inferDocumentType('demo.txt')).toBeNull();
      expect(inferDocumentType('demo')).toBeNull();
      expect(inferDocumentType('')).toBeNull();
    });
  });

  describe('generateDocumentId', () => {
    it('应该生成 wps_ 前缀的 ID', () => {
      const id = generateDocumentId();
      expect(id).toMatch(/^wps_[a-z0-9]+_[a-z0-9]{4}$/);
    });

    it('应该生成不同的 ID', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDocumentId());
      }
      // 100 次调用应几乎肯定全部不同
      expect(ids.size).toBeGreaterThan(95);
    });
  });

  describe('常量映射', () => {
    it('DOCUMENT_TYPE_TO_APP 应覆盖所有类型', () => {
      expect(DOCUMENT_TYPE_TO_APP.ppt).toBe('wpp');
      expect(DOCUMENT_TYPE_TO_APP.word).toBe('wps');
      expect(DOCUMENT_TYPE_TO_APP.pdf).toBe('wpspdf');
      expect(DOCUMENT_TYPE_TO_APP.excel).toBe('et');
    });

    it('DOCUMENT_TYPE_TO_EXTENSION 应覆盖所有类型', () => {
      expect(DOCUMENT_TYPE_TO_EXTENSION.ppt).toBe('pptx');
      expect(DOCUMENT_TYPE_TO_EXTENSION.word).toBe('docx');
      expect(DOCUMENT_TYPE_TO_EXTENSION.pdf).toBe('pdf');
      expect(DOCUMENT_TYPE_TO_EXTENSION.excel).toBe('xlsx');
    });

    it('DOCUMENT_TYPE_DEFAULT_NAME 应覆盖所有类型', () => {
      expect(DOCUMENT_TYPE_DEFAULT_NAME.ppt).toContain('.pptx');
      expect(DOCUMENT_TYPE_DEFAULT_NAME.word).toContain('.docx');
      expect(DOCUMENT_TYPE_DEFAULT_NAME.pdf).toContain('.pdf');
      expect(DOCUMENT_TYPE_DEFAULT_NAME.excel).toContain('.xlsx');
    });
  });

  describe('DEFAULT_WPS_BRIDGE_CONFIG', () => {
    it('应该有合理默认值', () => {
      expect(DEFAULT_WPS_BRIDGE_CONFIG.enabled).toBe(true);
      expect(DEFAULT_WPS_BRIDGE_CONFIG.timeoutMs).toBeGreaterThan(0);
      expect(DEFAULT_WPS_BRIDGE_CONFIG.useCOM).toBe(true);
      expect(DEFAULT_WPS_BRIDGE_CONFIG.useCLI).toBe(true);
    });
  });

  describe('WPSError', () => {
    it('应该正确构造错误', () => {
      const err = new WPSError('WPS_NOT_INSTALLED', 'WPS 未安装');
      expect(err.name).toBe('WPSError');
      expect(err.code).toBe('WPS_NOT_INSTALLED');
      expect(err.message).toBe('WPS 未安装');
      expect(err instanceof Error).toBe(true);
    });

    it('应该支持 documentId 与 cause', () => {
      const cause = new Error('原始错误');
      const err = new WPSError('COM_ERROR', 'COM 调用失败', {
        documentId: 'doc-1',
        cause,
      });
      expect(err.documentId).toBe('doc-1');
      expect(err.cause).toBe(cause);
    });

    it('toJSON 应返回结构化对象', () => {
      const err = new WPSError('TIMEOUT', '超时', { documentId: 'd1' });
      const json = err.toJSON();
      expect(json).toMatchObject({
        name: 'WPSError',
        code: 'TIMEOUT',
        message: '超时',
        documentId: 'd1',
      });
    });
  });
});

// ============ 桥接层测试 ============

describe('WPSBridgeImpl', () => {
  let bridge: WPSBridgeImpl;

  beforeEach(() => {
    // 每个测试用例都重置桥接层，避免单例污染
    injectTauriInvoke(undefined);
    bridge = resetWPSBridge({ debug: false });
  });

  afterEach(() => {
    injectTauriInvoke(undefined);
  });

  describe('无 Tauri 环境降级', () => {
    it('isInstalled 应返回未安装（mock 模式）', async () => {
      const result = await bridge.isInstalled();
      expect(result.installed).toBe(false);
    });

    it('startWPS 在未安装时应抛 WPSError', async () => {
      await expect(bridge.startWPS('wps')).rejects.toMatchObject({
        code: 'WPS_NOT_INSTALLED',
      });
    });

    it('openDocument 在未安装时应抛 WPSError', async () => {
      await expect(bridge.openDocument('D:\\demo.pptx')).rejects.toMatchObject({
        code: 'WPS_NOT_INSTALLED',
      });
    });

    it('createDocument 在未安装时应抛 WPSError', async () => {
      await expect(bridge.createDocument('ppt')).rejects.toMatchObject({
        code: 'WPS_NOT_INSTALLED',
      });
    });

    it('openDocument 对未知格式应抛 INVALID_FORMAT', async () => {
      // 先注入一个"已安装"的 mock，让检测通过格式校验
      injectTauriInvoke(async (cmd) => {
        if (cmd === 'wps_is_installed') {
          return { installed: true, executablePath: 'wps.exe' } as WPSInstallation;
        }
        return undefined;
      });
      bridge = resetWPSBridge({ debug: false });
      await expect(bridge.openDocument('D:\\demo.xyz')).rejects.toMatchObject({
        code: 'INVALID_FORMAT',
      });
    });
  });

  describe('有 Tauri 环境但 WPS 未安装', () => {
    beforeEach(() => {
      injectTauriInvoke(async (cmd) => {
        if (cmd === 'wps_is_installed') {
          return { installed: false } as WPSInstallation;
        }
        return undefined;
      });
      bridge = resetWPSBridge({ debug: false });
    });

    it('isInstalled 应返回未安装', async () => {
      const result = await bridge.isInstalled();
      expect(result.installed).toBe(false);
    });

    it('openDocument 应抛 WPS_NOT_INSTALLED', async () => {
      await expect(bridge.openDocument('D:\\demo.pptx')).rejects.toMatchObject({
        code: 'WPS_NOT_INSTALLED',
      });
    });

    it('createDocument 应抛 WPS_NOT_INSTALLED', async () => {
      await expect(bridge.createDocument('word')).rejects.toMatchObject({
        code: 'WPS_NOT_INSTALLED',
      });
    });
  });

  describe('有 Tauri 环境且 WPS 已安装', () => {
    // 模拟后端命令
    const mockInvoke = vi.fn(async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
      switch (command) {
        case 'wps_is_installed':
          return {
            installed: true,
            executablePath: 'C:\\WPS\\wps.exe',
            version: '11.0',
            detectedBy: 'path',
          } as WPSInstallation;
        case 'wps_start':
        case 'wps_quit':
          return true;
        case 'wps_open_document': {
          const path = (args?.path as string) || '';
          const docId = (args?.docId as string) || '';
          const name = path.split(/[\\/]/).pop() || path;
          return {
            id: docId,
            type: inferDocumentType(path),
            path,
            name,
            isOpen: true,
            lastModified: new Date().toISOString(),
            isDirty: false,
          } as WPSDocument;
        }
        case 'wps_create_document': {
          const type = args?.type as WPSDocumentType;
          const docId = args?.docId as string;
          const name = args?.name as string;
          return {
            id: docId,
            type,
            path: '',
            name,
            isOpen: true,
            lastModified: new Date().toISOString(),
            isDirty: true,
          } as WPSDocument;
        }
        case 'wps_save_document':
        case 'wps_save_as':
        case 'wps_close_document':
        case 'wps_edit_content':
          return undefined;
        case 'wps_read_document':
          return {
            documentId: args?.docId,
            type: args?.type,
            text: 'mock content',
          };
        case 'wps_export_document':
          return `${args?.path}.${args?.format}`;
        case 'wps_execute_macro':
          return { ok: true, macro: args?.macro };
        default:
          return undefined;
      }
    });

    beforeEach(() => {
      mockInvoke.mockClear();
      injectTauriInvoke(mockInvoke);
      bridge = resetWPSBridge({ debug: false });
    });

    it('isInstalled 应返回已安装', async () => {
      const result = await bridge.isInstalled();
      expect(result.installed).toBe(true);
      expect(result.executablePath).toBe('C:\\WPS\\wps.exe');
    });

    it('isInstalled 应使用缓存（多次调用只触发一次后端）', async () => {
      await bridge.isInstalled();
      await bridge.isInstalled();
      await bridge.isInstalled();
      const installedCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'wps_is_installed');
      expect(installedCalls.length).toBe(1);
    });

    it('invalidateInstallationCache 应清除缓存', async () => {
      await bridge.isInstalled();
      bridge.invalidateInstallationCache();
      await bridge.isInstalled();
      const installedCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'wps_is_installed');
      expect(installedCalls.length).toBe(2);
    });

    it('startWPS 应成功', async () => {
      await expect(bridge.startWPS('wps')).resolves.toBe(true);
    });

    it('quitWPS 应成功', async () => {
      await expect(bridge.quitWPS('wps')).resolves.toBe(true);
    });

    it('openDocument 应返回文档句柄', async () => {
      const doc = await bridge.openDocument('D:\\docs\\demo.pptx');
      expect(doc.type).toBe('ppt');
      expect(doc.name).toBe('demo.pptx');
      expect(doc.isOpen).toBe(true);
      expect(doc.id).toMatch(/^wps_/);
    });

    it('openDocument 重复打开同一路径应复用句柄', async () => {
      const doc1 = await bridge.openDocument('D:\\docs\\demo.pptx');
      const doc2 = await bridge.openDocument('D:\\docs\\demo.pptx');
      expect(doc2.id).toBe(doc1.id);
    });

    it('createDocument 应返回新文档', async () => {
      const doc = await bridge.createDocument('ppt', '我的演示.pptx');
      expect(doc.type).toBe('ppt');
      expect(doc.name).toBe('我的演示.pptx');
      expect(doc.path).toBe('');
      expect(doc.isDirty).toBe(true);
    });

    it('createDocument 不传 name 时使用默认名', async () => {
      const doc = await bridge.createDocument('word');
      expect(doc.name).toBe(DOCUMENT_TYPE_DEFAULT_NAME.word);
    });

    it('readDocument 应返回内容', async () => {
      const doc = await bridge.createDocument('word');
      const content = await bridge.readDocument(doc.id);
      expect(content.documentId).toBe(doc.id);
      expect(content.text).toBe('mock content');
    });

    it('readDocument 对未打开文档应抛错', async () => {
      await expect(bridge.readDocument('non-existent-id')).rejects.toMatchObject({
        code: 'DOC_NOT_OPEN',
      });
    });

    it('editContent 应成功并标记 dirty', async () => {
      const doc = await bridge.createDocument('word');
      const changes: WPSContentChange[] = [
        { type: 'text', target: 'paragraph:1', data: { text: '新内容' } },
      ];
      await bridge.editContent(doc.id, changes);
      // 再次列出应能看到 isDirty=true（通过 listOpenDocuments）
      const open = await bridge.listOpenDocuments();
      const found = open.find((d) => d.id === doc.id);
      expect(found?.isDirty).toBe(true);
    });

    it('saveDocument 应清除 dirty 标记', async () => {
      // 先打开一个有路径的文档
      const doc = await bridge.openDocument('D:\\docs\\demo.docx');
      await bridge.saveDocument(doc.id);
      const open = await bridge.listOpenDocuments();
      const found = open.find((d) => d.id === doc.id);
      expect(found?.isDirty).toBe(false);
    });

    it('saveDocument 对未保存到磁盘的新文档应抛错', async () => {
      const doc = await bridge.createDocument('word');
      await expect(bridge.saveDocument(doc.id)).rejects.toMatchObject({
        code: 'DOC_NOT_FOUND',
      });
    });

    it('saveAs 应更新文档路径与名称', async () => {
      const doc = await bridge.createDocument('word');
      await bridge.saveAs(doc.id, 'D:\\saved\\new.docx');
      const open = await bridge.listOpenDocuments();
      const found = open.find((d) => d.id === doc.id);
      expect(found?.path).toBe('D:\\saved\\new.docx');
      expect(found?.name).toBe('new.docx');
    });

    it('exportDocument 应返回导出路径', async () => {
      const doc = await bridge.openDocument('D:\\docs\\demo.pptx');
      const exportPath = await bridge.exportDocument(doc.id, 'pdf');
      expect(exportPath).toContain('pdf');
    });

    it('closeDocument 应从打开列表移除', async () => {
      const doc = await bridge.createDocument('word');
      await bridge.closeDocument(doc.id);
      const open = await bridge.listOpenDocuments();
      expect(open.find((d) => d.id === doc.id)).toBeUndefined();
    });

    it('closeDocument 对不存在的 ID 应静默成功', async () => {
      await expect(bridge.closeDocument('non-existent')).resolves.toBeUndefined();
    });

    it('executeMacro 应返回结果', async () => {
      const doc = await bridge.createDocument('ppt');
      const result = await bridge.executeMacro(doc.id, 'Application.Alert("hi")');
      expect(result).toMatchObject({ ok: true });
    });

    it('listOpenDocuments 应返回所有打开文档', async () => {
      const d1 = await bridge.createDocument('word');
      const d2 = await bridge.createDocument('ppt');
      const open = await bridge.listOpenDocuments();
      const ids = open.map((d) => d.id);
      expect(ids).toContain(d1.id);
      expect(ids).toContain(d2.id);
    });
  });

  describe('操作历史记录', () => {
    beforeEach(() => {
      injectTauriInvoke(async (command, args) => {
        if (command === 'wps_is_installed') {
          return { installed: true } as WPSInstallation;
        }
        if (command === 'wps_create_document') {
          return {
            id: args?.docId,
            type: args?.type,
            path: '',
            name: args?.name,
            isOpen: true,
            lastModified: new Date().toISOString(),
            isDirty: true,
          };
        }
        return undefined;
      });
      bridge = resetWPSBridge({ debug: false });
    });

    it('成功操作应记入历史', async () => {
      await bridge.isInstalled();
      const history = await bridge.getOperationHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].success).toBe(true);
    });

    it('失败操作也应记入历史', async () => {
      // 触发一个失败操作：readDocument 未打开文档
      await expect(bridge.readDocument('no-such-doc')).rejects.toBeDefined();
      const history = await bridge.getOperationHistory();
      const lastOp = history[history.length - 1];
      expect(lastOp.success).toBe(false);
      expect(lastOp.error).toBeDefined();
    });

    it('clearHistory 应清空历史', async () => {
      await bridge.isInstalled();
      bridge.clearHistory();
      const history = await bridge.getOperationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('配置', () => {
    it('getConfig 应返回只读配置', () => {
      const b = new WPSBridgeImpl({ timeoutMs: 5000, debug: true });
      const cfg = b.getConfig();
      expect(cfg.timeoutMs).toBe(5000);
      expect(cfg.debug).toBe(true);
    });

    it('getWPSBridge 单例应稳定', () => {
      const a = getWPSBridge();
      const b = getWPSBridge();
      expect(a).toBe(b);
    });

    it('resetWPSBridge 应创建新实例', () => {
      const a = getWPSBridge();
      const b = resetWPSBridge();
      expect(a).not.toBe(b);
    });
  });

  describe('静态方法', () => {
    it('getAppForType 应返回对应 WPS 应用', () => {
      expect(WPSBridgeImpl.getAppForType('ppt')).toBe('wpp');
      expect(WPSBridgeImpl.getAppForType('word')).toBe('wps');
      expect(WPSBridgeImpl.getAppForType('pdf')).toBe('wpspdf');
      expect(WPSBridgeImpl.getAppForType('excel')).toBe('et');
    });
  });
});