/**
 * TemplateStore 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTemplateStore } from '../../stores/template-store';
import { TemplateCategory, DocumentType } from '../../types/template';

// Mock Zustand persist（与项目其他 store 测试一致）
vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
}));

describe('TemplateStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useTemplateStore.setState({
      templates: [],
      selectedId: null,
      filter: {},
      sortOptions: { sortBy: 'createdAt', sortOrder: 'desc' },
      searchQuery: '',
      viewMode: 'grid',
      selectedIds: [],
      isLoading: false,
      error: null,
    });
    // 同步重置管理器
    useTemplateStore.getState().clearAll();
  });

  describe('addTemplate / getTemplate / getAllTemplates', () => {
    it('应创建并读取模板', () => {
      const store = useTemplateStore.getState();
      const id = store.addTemplate({
        name: '测试模板',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/test.docx',
      });

      expect(id).toMatch(/^tpl_/);
      const tpl = store.getTemplate(id);
      expect(tpl).toBeDefined();
      expect(tpl?.name).toBe('测试模板');
      expect(store.getAllTemplates()).toHaveLength(1);
    });

    it('addFromCurrentDocument 应便捷创建', () => {
      const store = useTemplateStore.getState();
      const id = store.addFromCurrentDocument('当前', DocumentType.PPT, '/cur.pptx', {
        category: TemplateCategory.PRESENTATION,
      });
      const tpl = store.getTemplate(id)!;
      expect(tpl.category).toBe(TemplateCategory.PRESENTATION);
      expect(tpl.source).toBe('user_upload');
    });
  });

  describe('updateTemplate / deleteTemplate / deleteTemplates', () => {
    it('应更新模板', () => {
      const store = useTemplateStore.getState();
      const id = store.addTemplate({
        name: '原名',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      expect(store.updateTemplate(id, { name: '新名' })).toBe(true);
      expect(store.getTemplate(id)?.name).toBe('新名');
    });

    it('应删除模板并清理选中状态', () => {
      const store = useTemplateStore.getState();
      const id = store.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      store.setSelected(id);
      store.toggleSelected(id);

      expect(store.deleteTemplate(id)).toBe(true);
      expect(store.getTemplate(id)).toBeUndefined();
      expect(useTemplateStore.getState().selectedId).toBeNull();
      expect(useTemplateStore.getState().selectedIds).not.toContain(id);
    });

    it('应批量删除', () => {
      const store = useTemplateStore.getState();
      const id1 = store.addTemplate({
        name: 'T1',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t1.docx',
      });
      const id2 = store.addTemplate({
        name: 'T2',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t2.docx',
      });
      const deleted = store.deleteTemplates([id1, id2]);
      expect(deleted).toBe(2);
      expect(store.getAllTemplates()).toHaveLength(0);
    });
  });

  describe('incrementUsage / setRating / setNotes', () => {
    it('应记录使用、评分、备注', () => {
      const store = useTemplateStore.getState();
      const id = store.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      store.incrementUsage(id);
      store.incrementUsage(id);
      store.setRating(id, 5);
      store.setNotes(id, '很好用');

      const tpl = store.getTemplate(id)!;
      expect(tpl.usageCount).toBe(2);
      expect(tpl.userRating).toBe(5);
      expect(tpl.notes).toBe('很好用');
    });
  });

  describe('查询', () => {
    beforeEach(() => {
      const store = useTemplateStore.getState();
      store.addTemplate({
        name: '学术模板',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/a.docx',
        tags: ['论文'],
        useCases: ['学术写作'],
      });
      store.addTemplate({
        name: '商务模板',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['汇报'],
        useCases: ['工作汇报'],
      });
    });

    it('getByCategory 应按分类查询', () => {
      const store = useTemplateStore.getState();
      expect(store.getByCategory(TemplateCategory.ACADEMIC)).toHaveLength(1);
      expect(store.getByCategory(TemplateCategory.BUSINESS)).toHaveLength(1);
    });

    it('query 应支持复合过滤', () => {
      const store = useTemplateStore.getState();
      const results = store.query({
        category: TemplateCategory.ACADEMIC,
        type: DocumentType.WORD,
      });
      expect(results).toHaveLength(1);
    });

    it('search 应按关键词搜索', () => {
      const store = useTemplateStore.getState();
      expect(store.search('学术')).toHaveLength(1);
      expect(store.search('商务')).toHaveLength(1);
      expect(store.search('不存在')).toHaveLength(0);
    });
  });

  describe('recommend', () => {
    it('应推荐相似模板', () => {
      const store = useTemplateStore.getState();
      const id1 = store.addTemplate({
        name: 'A',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/a.pptx',
        tags: ['汇报'],
        useCases: ['工作汇报'],
      });
      store.addTemplate({
        name: 'B',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['汇报'],
        useCases: ['工作汇报'],
      });

      const recs = store.recommend(id1);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].template.name).toBe('B');
    });
  });

  describe('getStats', () => {
    it('应正确统计', () => {
      const store = useTemplateStore.getState();
      store.addTemplate({
        name: 'A',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/a.docx',
        tags: ['论文'],
      });
      store.addTemplate({
        name: 'B',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['论文'],
      });

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.tagFrequency['论文']).toBe(2);
    });
  });

  describe('UI 状态', () => {
    it('应管理选中、筛选、排序、视图模式', () => {
      const store = useTemplateStore.getState();
      const id = store.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });

      store.setSelected(id);
      expect(useTemplateStore.getState().selectedId).toBe(id);

      store.setFilter({ category: TemplateCategory.ACADEMIC });
      expect(useTemplateStore.getState().filter.category).toBe(TemplateCategory.ACADEMIC);

      store.patchFilter({ type: DocumentType.WORD });
      expect(useTemplateStore.getState().filter.type).toBe(DocumentType.WORD);

      store.resetFilter();
      expect(useTemplateStore.getState().filter).toEqual({});
      expect(useTemplateStore.getState().searchQuery).toBe('');

      store.setSortOptions({ sortBy: 'name', sortOrder: 'asc' });
      expect(useTemplateStore.getState().sortOptions.sortBy).toBe('name');

      store.setSearchQuery('测试');
      expect(useTemplateStore.getState().searchQuery).toBe('测试');

      store.setViewMode('list');
      expect(useTemplateStore.getState().viewMode).toBe('list');
    });

    it('应管理批量选择', () => {
      const store = useTemplateStore.getState();
      const id1 = store.addTemplate({
        name: 'T1',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t1.docx',
      });
      const id2 = store.addTemplate({
        name: 'T2',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t2.docx',
      });

      store.toggleSelected(id1);
      expect(useTemplateStore.getState().selectedIds).toContain(id1);

      store.toggleSelected(id1);
      expect(useTemplateStore.getState().selectedIds).not.toContain(id1);

      store.selectMany([id1, id2]);
      expect(useTemplateStore.getState().selectedIds).toHaveLength(2);

      store.clearSelection();
      expect(useTemplateStore.getState().selectedIds).toHaveLength(0);
    });

    it('selectAllVisible 应选中所有可见模板', () => {
      const store = useTemplateStore.getState();
      store.addTemplate({
        name: 'T1',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t1.docx',
      });
      store.addTemplate({
        name: 'T2',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t2.docx',
      });

      store.selectAllVisible();
      expect(useTemplateStore.getState().selectedIds).toHaveLength(2);
    });
  });

  describe('moveTemplate', () => {
    it('应支持拖拽排序', () => {
      const store = useTemplateStore.getState();
      const id1 = store.addTemplate({
        name: 'T1',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t1.docx',
      });
      const id2 = store.addTemplate({
        name: 'T2',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t2.docx',
      });

      // 将 T1 移到末尾
      store.moveTemplate(id1, 1);
      const list = useTemplateStore.getState().templates;
      expect(list[0].id).toBe(id2);
      expect(list[1].id).toBe(id1);
    });
  });

  describe('clearAll', () => {
    it('应清空所有', () => {
      const store = useTemplateStore.getState();
      store.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      store.clearAll();
      expect(store.getAllTemplates()).toHaveLength(0);
    });
  });
});