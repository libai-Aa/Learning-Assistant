/**
 * TemplateManager 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TemplateManager,
  generateTemplateId,
  clampRating,
  jaccardSimilarity,
  inferVisualDensity,
  extractStyleFeatures,
  computeSimilarity,
  filterTemplates,
  sortTemplates,
  computeTemplateStats,
  searchTemplateText,
} from '../wps/template-manager';
import { TemplateCategory, DocumentType, VisualDensity } from '../../types/template';

describe('template-manager 工具函数', () => {
  describe('generateTemplateId', () => {
    it('应生成 tpl_ 前缀的唯一 ID', () => {
      const id1 = generateTemplateId();
      const id2 = generateTemplateId();
      expect(id1).toMatch(/^tpl_/);
      expect(id2).toMatch(/^tpl_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('clampRating', () => {
    it('应将评分限制在 1-5 范围', () => {
      expect(clampRating(0)).toBe(1);
      expect(clampRating(1)).toBe(1);
      expect(clampRating(3)).toBe(3);
      expect(clampRating(5)).toBe(5);
      expect(clampRating(10)).toBe(5);
      expect(clampRating(-1)).toBe(1);
    });

    it('应四舍五入浮点评分', () => {
      expect(clampRating(2.4)).toBe(2);
      expect(clampRating(2.6)).toBe(3);
      expect(clampRating(4.5)).toBe(5);
    });
  });

  describe('jaccardSimilarity', () => {
    it('完全相同集合应返回 1', () => {
      expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    });

    it('完全不相交应返回 0', () => {
      expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    it('部分重叠应返回正确比例', () => {
      // 交集 1，并集 3
      expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    });

    it('两个空集应返回 0', () => {
      expect(jaccardSimilarity([], [])).toBe(0);
    });

    it('应忽略大小写与首尾空格', () => {
      expect(jaccardSimilarity(['Hello'], ['hello'])).toBe(1);
      expect(jaccardSimilarity(['  a  '], ['a'])).toBe(1);
    });
  });

  describe('inferVisualDensity', () => {
    it('每页 < 80 字应为稀疏', () => {
      expect(inferVisualDensity(50)).toBe(VisualDensity.SPARSE);
    });

    it('每页 80-200 字应为中等', () => {
      expect(inferVisualDensity(100)).toBe(VisualDensity.MEDIUM);
      expect(inferVisualDensity(200)).toBe(VisualDensity.MEDIUM);
    });

    it('每页 > 200 字应为密集', () => {
      expect(inferVisualDensity(300)).toBe(VisualDensity.DENSE);
    });

    it('未提供字数应返回 undefined', () => {
      expect(inferVisualDensity(undefined)).toBeUndefined();
      expect(inferVisualDensity(0)).toBeUndefined();
    });
  });

  describe('extractStyleFeatures', () => {
    it('应从文本中提取颜色与字体', () => {
      const result = extractStyleFeatures({
        type: 'ppt',
        colors: ['#1a56db', '#ffffff'],
        fonts: ['思源黑体'],
        avgWordsPerPage: 50,
      });
      expect(result.styleFeatures.colorScheme).toEqual(['#1a56db', '#ffffff']);
      expect(result.styleFeatures.fontFamily).toEqual(['思源黑体']);
      expect(result.styleFeatures.visualDensity).toBe(VisualDensity.SPARSE);
    });

    it('应从文本推断使用场景', () => {
      const result = extractStyleFeatures({
        type: 'word',
        textContent: '本季度KPI完成情况汇报，月度数据总结',
      });
      expect(result.inferredUseCases).toContain('工作汇报');
    });

    it('应从文本推断适合主题', () => {
      const result = extractStyleFeatures({
        type: 'word',
        textContent: '本系统的技术架构设计，包括工程实现方案',
      });
      expect(result.inferredSuitableFor).toContain('技术工程');
    });

    it('应从文本推断分类', () => {
      const result = extractStyleFeatures({
        type: 'word',
        textContent: '本研究通过实验验证假设，引用相关论文',
      });
      expect(result.inferredCategory).toBe(TemplateCategory.ACADEMIC);
    });

    it('应推断正式语气', () => {
      const result = extractStyleFeatures({
        type: 'word',
        textContent: '综上所述，因此研究表明该方案有效',
      });
      expect(result.styleFeatures.toneStyle).toBe('formal');
    });

    it('应推断 problem-solution 结构', () => {
      const result = extractStyleFeatures({
        type: 'word',
        textContent: '当前问题与痛点分析，提出解决方案',
      });
      expect(result.styleFeatures.structurePattern).toBe('problem-solution');
    });

    it('空输入应返回空特征', () => {
      const result = extractStyleFeatures({ type: 'word' });
      expect(result.styleFeatures.colorScheme).toBeUndefined();
      expect(result.inferredUseCases).toEqual([]);
    });
  });
});

describe('TemplateManager 类', () => {
  let manager: TemplateManager;

  beforeEach(() => {
    manager = new TemplateManager();
  });

  describe('addTemplate / getTemplate', () => {
    it('应创建模板并返回 ID', () => {
      const id = manager.addTemplate({
        name: '测试模板',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/test/template.docx',
      });

      expect(id).toMatch(/^tpl_/);
      const tpl = manager.getTemplate(id);
      expect(tpl).toBeDefined();
      expect(tpl?.name).toBe('测试模板');
      expect(tpl?.usageCount).toBe(0);
      expect(tpl?.source).toBe('user_upload');
      expect(tpl?.tags).toEqual([]);
    });

    it('应支持完整字段', () => {
      const id = manager.addTemplate({
        name: '完整模板',
        type: DocumentType.PPT,
        category: TemplateCategory.REPORT,
        filePath: '/test.pptx',
        tags: ['季度', '汇报'],
        useCases: ['季度汇报'],
        suitableFor: ['数据分析'],
        notes: '很好用',
        source: 'generated',
        styleFeatures: {
          colorScheme: ['#1a56db'],
          visualDensity: VisualDensity.MEDIUM,
        },
      });

      const tpl = manager.getTemplate(id)!;
      expect(tpl.tags).toEqual(['季度', '汇报']);
      expect(tpl.useCases).toEqual(['季度汇报']);
      expect(tpl.source).toBe('generated');
      expect(tpl.notes).toBe('很好用');
      expect(tpl.styleFeatures.colorScheme).toEqual(['#1a56db']);
    });
  });

  describe('addFromCurrentDocument', () => {
    it('应从当前文档创建模板', () => {
      const id = manager.addFromCurrentDocument(
        '当前文档',
        DocumentType.WORD,
        '/current.docx',
        { category: TemplateCategory.DOCUMENT, tags: ['临时'] }
      );
      const tpl = manager.getTemplate(id)!;
      expect(tpl.name).toBe('当前文档');
      expect(tpl.category).toBe(TemplateCategory.DOCUMENT);
      expect(tpl.source).toBe('user_upload');
    });
  });

  describe('updateTemplate', () => {
    it('应更新模板字段', () => {
      const id = manager.addTemplate({
        name: '原名',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/test.docx',
      });

      const ok = manager.updateTemplate(id, { name: '新名', tags: ['新标签'] });
      expect(ok).toBe(true);

      const tpl = manager.getTemplate(id)!;
      expect(tpl.name).toBe('新名');
      expect(tpl.tags).toEqual(['新标签']);
    });

    it('更新不存在模板应返回 false', () => {
      expect(manager.updateTemplate('non_existent', { name: 'x' })).toBe(false);
    });

    it('应校验评分范围', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      manager.updateTemplate(id, { userRating: 99 });
      expect(manager.getTemplate(id)?.userRating).toBe(5);
    });
  });

  describe('deleteTemplate / deleteTemplates', () => {
    it('应删除单个模板', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      expect(manager.deleteTemplate(id)).toBe(true);
      expect(manager.getTemplate(id)).toBeUndefined();
    });

    it('应批量删除', () => {
      const id1 = manager.addTemplate({
        name: 'T1',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t1.docx',
      });
      const id2 = manager.addTemplate({
        name: 'T2',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t2.docx',
      });
      const deleted = manager.deleteTemplates([id1, id2, 'non_existent']);
      expect(deleted).toBe(2);
      expect(manager.getAllTemplates()).toHaveLength(0);
    });
  });

  describe('incrementUsage / setRating / setNotes', () => {
    it('应递增使用次数', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      manager.incrementUsage(id);
      manager.incrementUsage(id);
      expect(manager.getTemplate(id)?.usageCount).toBe(2);
    });

    it('应设置评分与备注', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      manager.setRating(id, 4);
      manager.setNotes(id, '我的备注');
      const tpl = manager.getTemplate(id)!;
      expect(tpl.userRating).toBe(4);
      expect(tpl.notes).toBe('我的备注');
    });
  });

  describe('查询', () => {
    beforeEach(() => {
      manager.addTemplate({
        name: '学术模板',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/a.docx',
        tags: ['论文'],
        useCases: ['学术写作'],
      });
      manager.addTemplate({
        name: '商务模板',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['汇报'],
        useCases: ['工作汇报'],
      });
    });

    it('getByCategory 应按分类查询', () => {
      expect(manager.getByCategory(TemplateCategory.ACADEMIC)).toHaveLength(1);
      expect(manager.getByCategory(TemplateCategory.BUSINESS)).toHaveLength(1);
      expect(manager.getByCategory(TemplateCategory.CREATIVE)).toHaveLength(0);
    });

    it('getByTag 应按标签查询', () => {
      expect(manager.getByTag('论文')).toHaveLength(1);
      expect(manager.getByTag('汇报')).toHaveLength(1);
      expect(manager.getByTag('不存在')).toHaveLength(0);
    });

    it('getByUseCase 应按场景查询', () => {
      expect(manager.getByUseCase('学术写作')).toHaveLength(1);
      expect(manager.getByUseCase('工作汇报')).toHaveLength(1);
    });

    it('query 应支持复合过滤', () => {
      const results = manager.query({
        category: TemplateCategory.ACADEMIC,
        type: DocumentType.WORD,
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('学术模板');
    });
  });

  describe('search', () => {
    it('应按关键词搜索', () => {
      manager.addTemplate({
        name: '季度汇报模板',
        type: DocumentType.PPT,
        category: TemplateCategory.REPORT,
        filePath: '/q.pptx',
        tags: ['季度'],
      });
      manager.addTemplate({
        name: '学术论文',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/a.docx',
      });

      const results = manager.search('季度');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('季度汇报模板');
    });

    it('空查询应返回空数组', () => {
      expect(manager.search('')).toHaveLength(0);
      expect(manager.search('   ')).toHaveLength(0);
    });
  });

  describe('recommend', () => {
    it('应推荐相似模板', () => {
      const id1 = manager.addTemplate({
        name: '模板A',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/a.pptx',
        tags: ['汇报', '季度'],
        useCases: ['工作汇报'],
        suitableFor: ['数据分析'],
      });
      manager.addTemplate({
        name: '模板B（相似）',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['汇报', '月度'],
        useCases: ['工作汇报'],
        suitableFor: ['数据分析'],
      });
      manager.addTemplate({
        name: '模板C（不相似）',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/c.docx',
        tags: ['论文'],
        useCases: ['学术写作'],
      });

      const recs = manager.recommend(id1, 5, 0.1);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].template.name).toBe('模板B（相似）');
      expect(recs[0].score).toBeGreaterThan(0);
      expect(recs[0].reasons.length).toBeGreaterThan(0);
    });

    it('不应推荐自己', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      const recs = manager.recommend(id);
      expect(recs.find((r) => r.template.id === id)).toBeUndefined();
    });

    it('不存在的目标应返回空', () => {
      expect(manager.recommend('non_existent')).toEqual([]);
    });
  });

  describe('recommendByScenario', () => {
    it('应基于场景推荐', () => {
      manager.addTemplate({
        name: '工作汇报模板',
        type: DocumentType.PPT,
        category: TemplateCategory.REPORT,
        filePath: '/r.pptx',
        useCases: ['工作汇报'],
      });

      const recs = manager.recommendByScenario({
        useCases: ['工作汇报'],
        category: TemplateCategory.REPORT,
      });
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].template.name).toBe('工作汇报模板');
    });
  });

  describe('getStats', () => {
    it('应正确统计', () => {
      manager.addTemplate({
        name: 'A',
        type: DocumentType.WORD,
        category: TemplateCategory.ACADEMIC,
        filePath: '/a.docx',
        tags: ['论文', '研究'],
      });
      manager.addTemplate({
        name: 'B',
        type: DocumentType.PPT,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.pptx',
        tags: ['论文'],
      });

      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.byCategory.academic).toBe(1);
      expect(stats.byCategory.business).toBe(1);
      expect(stats.byType.word).toBe(1);
      expect(stats.byType.ppt).toBe(1);
      expect(stats.tagFrequency['论文']).toBe(2);
      expect(stats.tagFrequency['研究']).toBe(1);
    });
  });

  describe('load / dump / clear', () => {
    it('应正确加载与导出', () => {
      const id = manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      const dumped = manager.dump();
      expect(dumped).toHaveLength(1);

      const newManager = new TemplateManager();
      newManager.load(dumped);
      expect(newManager.getTemplate(id)).toBeDefined();
    });

    it('clear 应清空所有', () => {
      manager.addTemplate({
        name: 'T',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/t.docx',
      });
      manager.clear();
      expect(manager.getAllTemplates()).toHaveLength(0);
    });
  });

  describe('getAllTags / getAllUseCases', () => {
    it('应返回去重后的标签与场景', () => {
      manager.addTemplate({
        name: 'A',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/a.docx',
        tags: ['汇报', '季度'],
        useCases: ['工作汇报'],
      });
      manager.addTemplate({
        name: 'B',
        type: DocumentType.WORD,
        category: TemplateCategory.BUSINESS,
        filePath: '/b.docx',
        tags: ['汇报'],
        useCases: ['工作汇报', '月度汇报'],
      });

      expect(manager.getAllTags().sort()).toEqual(['季度', '汇报']);
      expect(manager.getAllUseCases().sort()).toEqual(['工作汇报', '月度汇报']);
    });
  });
});

describe('纯函数：filterTemplates / sortTemplates / computeTemplateStats / searchTemplateText / computeSimilarity', () => {
  const makeTemplate = (overrides: Partial<import('../../../types/template').DocumentTemplate> & { id: string }) => {
    return {
      id: overrides.id,
      name: overrides.name || 'T',
      type: overrides.type || DocumentType.WORD,
      category: overrides.category || TemplateCategory.BUSINESS,
      tags: overrides.tags || [],
      filePath: overrides.filePath || '/t.docx',
      styleFeatures: overrides.styleFeatures || {},
      useCases: overrides.useCases || [],
      suitableFor: overrides.suitableFor || [],
      createdAt: overrides.createdAt || '2024-01-01T00:00:00.000Z',
      updatedAt: overrides.updatedAt || '2024-01-01T00:00:00.000Z',
      usageCount: overrides.usageCount ?? 0,
      userRating: overrides.userRating,
      notes: overrides.notes,
      source: overrides.source || 'user_upload',
      originalPath: overrides.originalPath,
    } as import('../../../types/template').DocumentTemplate;
  };

  it('filterTemplates 应支持 minRating', () => {
    const list = [
      makeTemplate({ id: '1', userRating: 3 }),
      makeTemplate({ id: '2', userRating: 5 }),
      makeTemplate({ id: '3' }),
    ];
    const filtered = filterTemplates(list, { minRating: 4 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');
  });

  it('sortTemplates 应按 usageCount 降序', () => {
    const list = [
      makeTemplate({ id: '1', usageCount: 1 }),
      makeTemplate({ id: '2', usageCount: 5 }),
      makeTemplate({ id: '3', usageCount: 3 }),
    ];
    const sorted = sortTemplates(list, { sortBy: 'usageCount', sortOrder: 'desc' });
    expect(sorted.map((t) => t.id)).toEqual(['2', '3', '1']);
  });

  it('computeTemplateStats 应计算平均评分', () => {
    const list = [
      makeTemplate({ id: '1', userRating: 4 }),
      makeTemplate({ id: '2', userRating: 2 }),
    ];
    const stats = computeTemplateStats(list);
    expect(stats.averageRating).toBe(3);
    expect(stats.totalUsageCount).toBe(0);
  });

  it('searchTemplateText 应返回命中字段', () => {
    const tpl = makeTemplate({ id: '1', name: '季度汇报', tags: ['汇报'] });
    const hits = searchTemplateText(tpl, '汇报');
    expect(hits).toContain('name');
    expect(hits).toContain('tags');
  });

  it('computeSimilarity 完全相同特征应返回较高分数', () => {
    const a = makeTemplate({
      id: 'a',
      category: TemplateCategory.BUSINESS,
      tags: ['汇报'],
      useCases: ['工作汇报'],
      suitableFor: ['数据分析'],
    });
    const b = makeTemplate({
      id: 'b',
      category: TemplateCategory.BUSINESS,
      tags: ['汇报'],
      useCases: ['工作汇报'],
      suitableFor: ['数据分析'],
    });
    expect(computeSimilarity(a, b)).toBeGreaterThan(0.8);
  });

  it('computeSimilarity 完全不同应返回较低分数', () => {
    const a = makeTemplate({
      id: 'a',
      category: TemplateCategory.ACADEMIC,
      type: DocumentType.WORD,
      tags: [],
      useCases: [],
      suitableFor: [],
    });
    const b = makeTemplate({
      id: 'b',
      category: TemplateCategory.BUSINESS,
      type: DocumentType.PPT,
      tags: [],
      useCases: [],
      suitableFor: [],
    });
    expect(computeSimilarity(a, b)).toBe(0);
  });
});