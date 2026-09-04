/**
 * AnnotationStore 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAnnotationStore } from '../../stores/annotation-store';
import { AnnotationType, HighlightColor } from '../../types/annotation';

// Mock Zustand persist，避免测试时触达 localStorage
vi.mock('zustand/middleware', () => ({
  persist: (config: any) => config,
}));

describe('AnnotationStore', () => {
  // 在每个测试前重置 store
  beforeEach(() => {
    useAnnotationStore.setState({ annotations: [] });
  });

  describe('addAnnotation', () => {
    it('应创建新标注并返回其 ID', () => {
      const store = useAnnotationStore.getState();

      const id = store.addAnnotation({
        knowledgeId: 'knowledge_1',
        type: 'note',
        content: '这是一条批注',
      });

      expect(id).toBeDefined();
      expect(id).toMatch(/^annotation_/);

      const all = store.getAllAnnotations();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe('这是一条批注');
      expect(all[0].type).toBe('note');
      expect(all[0].createdBy).toBe('user');
    });

    it('应支持带可选字段的标注创建', () => {
      const store = useAnnotationStore.getState();

      const id = store.addAnnotation({
        knowledgeId: 'knowledge_1',
        type: 'highlight',
        content: '高亮文本',
        highlightColor: 'green',
        tags: ['重要', '待复习'],
      });

      const annotation = store.getAnnotation(id);
      expect(annotation).toBeDefined();
      expect(annotation?.highlightColor).toBe('green');
      expect(annotation?.tags).toEqual(['重要', '待复习']);
    });

    it('未提供 tags 时应默认为空数组', () => {
      const store = useAnnotationStore.getState();

      const id = store.addAnnotation({
        knowledgeId: 'knowledge_1',
        type: 'note',
        content: '无标签批注',
      });

      const annotation = store.getAnnotation(id);
      expect(annotation?.tags).toEqual([]);
    });
  });

  describe('getAnnotation', () => {
    it('应返回 undefined 当 ID 不存在', () => {
      const store = useAnnotationStore.getState();

      expect(store.getAnnotation('non_existent')).toBeUndefined();
    });

    it('应返回对应 ID 的标注', () => {
      const store = useAnnotationStore.getState();

      const id = store.addAnnotation({
        knowledgeId: 'knowledge_1',
        type: 'note',
        content: '测试批注',
      });

      const annotation = store.getAnnotation(id);
      expect(annotation?.id).toBe(id);
      expect(annotation?.content).toBe('测试批注');
    });
  });

  describe('getAllAnnotations', () => {
    it('无标注时应返回空数组', () => {
      expect(useAnnotationStore.getState().getAllAnnotations()).toEqual([]);
    });

    it('应返回所有标注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'B' });

      expect(store.getAllAnnotations()).toHaveLength(2);
    });
  });

  describe('updateAnnotation', () => {
    it('应更新标注内容', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: '原始内容',
      });

      const ok = store.updateAnnotation(id, { content: '更新内容' });

      expect(ok).toBe(true);
      expect(store.getAnnotation(id)?.content).toBe('更新内容');
    });

    it('应更新高亮颜色', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'highlight',
        content: '高亮',
        highlightColor: 'yellow',
      });

      store.updateAnnotation(id, { highlightColor: 'blue' });

      expect(store.getAnnotation(id)?.highlightColor).toBe('blue');
    });

    it('应更新标签', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: '测试',
        tags: ['a'],
      });

      store.updateAnnotation(id, { tags: ['a', 'b'] });

      expect(store.getAnnotation(id)?.tags).toEqual(['a', 'b']);
    });

    it('应更新 updatedAt 时间戳', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: '测试',
      });
      const original = store.getAnnotation(id)!;

      // 确保时间推进
      return new Promise((resolve) => {
        setTimeout(() => {
          store.updateAnnotation(id, { content: '更新' });
          const updated = store.getAnnotation(id)!;
          expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
            new Date(original.updatedAt).getTime()
          );
          resolve(undefined);
        }, 5);
      });
    });

    it('不存在 ID 应返回 false', () => {
      const store = useAnnotationStore.getState();
      expect(store.updateAnnotation('non_existent', { content: 'x' })).toBe(false);
    });
  });

  describe('deleteAnnotation', () => {
    it('应删除指定标注', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: '待删除',
      });

      expect(store.deleteAnnotation(id)).toBe(true);
      expect(store.getAllAnnotations()).toHaveLength(0);
    });

    it('不存在 ID 应返回 false', () => {
      const store = useAnnotationStore.getState();
      expect(store.deleteAnnotation('non_existent')).toBe(false);
    });
  });

  describe('deleteAnnotations (批量删除)', () => {
    it('应批量删除标注并返回删除数量', () => {
      const store = useAnnotationStore.getState();
      const id1 = store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      const id2 = store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'B' });
      const id3 = store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'C' });

      const deleted = store.deleteAnnotations([id1, id2]);

      expect(deleted).toBe(2);
      expect(store.getAllAnnotations()).toHaveLength(1);
      expect(store.getAnnotation(id3)).toBeDefined();
    });

    it('不存在的 ID 应返回 0', () => {
      const store = useAnnotationStore.getState();
      expect(store.deleteAnnotations(['no_1', 'no_2'])).toBe(0);
    });
  });

  describe('getAnnotationsByKnowledge', () => {
    it('应返回指定知识条目的标注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'note', content: 'B' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: 'C' });

      const result = store.getAnnotationsByKnowledge('k1');
      expect(result).toHaveLength(2);
      expect(result.every((a) => a.knowledgeId === 'k1')).toBe(true);
    });

    it('不存在该知识时应返回空数组', () => {
      const store = useAnnotationStore.getState();
      expect(store.getAnnotationsByKnowledge('non_existent')).toEqual([]);
    });
  });

  describe('getAnnotationsByType', () => {
    it('应返回指定类型的标注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: '批注' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: '高亮' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: '高亮2' });

      expect(store.getAnnotationsByType('note')).toHaveLength(1);
      expect(store.getAnnotationsByType('highlight')).toHaveLength(2);
      expect(store.getAnnotationsByType('idea')).toHaveLength(0);
    });
  });

  describe('getAnnotationsByFilter', () => {
    beforeEach(() => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({
        knowledgeId: 'k1',
        type: 'highlight',
        content: '高亮1',
        highlightColor: 'yellow',
        tags: ['重要'],
      });
      store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: '批注1',
        tags: ['待复习'],
      });
      store.addAnnotation({
        knowledgeId: 'k2',
        type: 'highlight',
        content: '高亮2',
        highlightColor: 'blue',
        tags: ['重要'],
      });
    });

    it('应按 knowledgeId 过滤', () => {
      const store = useAnnotationStore.getState();
      expect(store.getAnnotationsByFilter({ knowledgeId: 'k1' })).toHaveLength(2);
    });

    it('应按 type 过滤', () => {
      const store = useAnnotationStore.getState();
      expect(store.getAnnotationsByFilter({ type: 'highlight' })).toHaveLength(2);
      expect(store.getAnnotationsByFilter({ type: 'note' })).toHaveLength(1);
    });

    it('应按 highlightColor 过滤', () => {
      const store = useAnnotationStore.getState();
      expect(store.getAnnotationsByFilter({ highlightColor: 'yellow' })).toHaveLength(1);
      expect(store.getAnnotationsByFilter({ highlightColor: 'blue' })).toHaveLength(1);
    });

    it('应按 tag 过滤', () => {
      const store = useAnnotationStore.getState();
      expect(store.getAnnotationsByFilter({ tag: '重要' })).toHaveLength(2);
      expect(store.getAnnotationsByFilter({ tag: '待复习' })).toHaveLength(1);
    });

    it('应支持组合过滤', () => {
      const store = useAnnotationStore.getState();
      const result = store.getAnnotationsByFilter({
        knowledgeId: 'k1',
        type: 'highlight',
      });
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('高亮1');
    });
  });

  describe('getHighlights', () => {
    it('应返回所有高亮标注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: '批注' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: '高亮1' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'highlight', content: '高亮2' });

      expect(store.getHighlights()).toHaveLength(2);
    });

    it('应支持按 knowledgeId 过滤高亮', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'highlight', content: 'B' });

      expect(store.getHighlights('k1')).toHaveLength(1);
    });
  });

  describe('setHighlightColor', () => {
    it('应更新高亮颜色', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: 'highlight',
        content: '高亮',
        highlightColor: 'yellow',
      });

      expect(store.setHighlightColor(id, 'pink')).toBe(true);
      expect(store.getAnnotation(id)?.highlightColor).toBe('pink');
    });

    it('不存在 ID 应返回 false', () => {
      const store = useAnnotationStore.getState();
      expect(store.setHighlightColor('non_existent', 'pink')).toBe(false);
    });
  });

  describe('getNotes', () => {
    it('应返回所有批注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'highlight', content: 'B' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'note', content: 'C' });

      expect(store.getNotes()).toHaveLength(2);
    });

    it('应支持按 knowledgeId 过滤批注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'note', content: 'B' });

      expect(store.getNotes('k1')).toHaveLength(1);
    });
  });

  describe('addNote (便捷方法)', () => {
    it('应创建类型为 note 的标注', () => {
      const store = useAnnotationStore.getState();
      const id = store.addNote('k1', '便捷批注', ['标签1']);

      const annotation = store.getAnnotation(id);
      expect(annotation?.type).toBe('note');
      expect(annotation?.content).toBe('便捷批注');
      expect(annotation?.tags).toEqual(['标签1']);
    });
  });

  describe('addHighlight (便捷方法)', () => {
    it('应创建类型为 highlight 的标注，默认黄色', () => {
      const store = useAnnotationStore.getState();
      const id = store.addHighlight('k1', '高亮文本');

      const annotation = store.getAnnotation(id);
      expect(annotation?.type).toBe('highlight');
      expect(annotation?.content).toBe('高亮文本');
      expect(annotation?.highlightColor).toBe('yellow');
    });

    it('应支持自定义颜色和位置', () => {
      const store = useAnnotationStore.getState();
      const id = store.addHighlight('k1', '高亮文本', 'green', {
        startOffset: 10,
        endOffset: 20,
      });

      const annotation = store.getAnnotation(id);
      expect(annotation?.highlightColor).toBe('green');
      expect(annotation?.position).toBeDefined();
      expect(annotation?.position?.startOffset).toBe(10);
      expect(annotation?.position?.endOffset).toBe(20);
      expect(annotation?.position?.textFragment).toBe('高亮文本');
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({
        knowledgeId: 'k1',
        type: 'highlight',
        content: 'A',
        highlightColor: 'yellow',
      });
      store.addAnnotation({
        knowledgeId: 'k1',
        type: 'note',
        content: 'B',
      });
      store.addAnnotation({
        knowledgeId: 'k2',
        type: 'highlight',
        content: 'C',
        highlightColor: 'blue',
      });
    });

    it('应返回总数', () => {
      const stats = useAnnotationStore.getState().getStats();
      expect(stats.total).toBe(3);
    });

    it('应按类型统计', () => {
      const stats = useAnnotationStore.getState().getStats();
      expect(stats.byType.highlight).toBe(2);
      expect(stats.byType.note).toBe(1);
      expect(stats.byType.idea).toBe(0);
    });

    it('应按颜色统计', () => {
      const stats = useAnnotationStore.getState().getStats();
      expect(stats.byColor.yellow).toBe(1);
      expect(stats.byColor.blue).toBe(1);
    });

    it('应按知识条目统计', () => {
      const stats = useAnnotationStore.getState().getStats();
      expect(stats.byKnowledge['k1']).toBe(2);
      expect(stats.byKnowledge['k2']).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('应清空所有标注', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'B' });

      store.clearAll();

      expect(store.getAllAnnotations()).toHaveLength(0);
    });
  });

  describe('clearByKnowledge', () => {
    it('应清空指定知识的标注并返回删除数量', () => {
      const store = useAnnotationStore.getState();
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'A' });
      store.addAnnotation({ knowledgeId: 'k1', type: 'note', content: 'B' });
      store.addAnnotation({ knowledgeId: 'k2', type: 'note', content: 'C' });

      const deleted = store.clearByKnowledge('k1');

      expect(deleted).toBe(2);
      expect(store.getAllAnnotations()).toHaveLength(1);
      expect(store.getAnnotationsByKnowledge('k1')).toHaveLength(0);
    });

    it('不存在该知识时应返回 0', () => {
      const store = useAnnotationStore.getState();
      expect(store.clearByKnowledge('non_existent')).toBe(0);
    });
  });

  describe('setLoading / setError', () => {
    it('应设置加载状态', () => {
      const store = useAnnotationStore.getState();
      store.setLoading(true);
      expect(useAnnotationStore.getState().isLoading).toBe(true);

      store.setLoading(false);
      expect(useAnnotationStore.getState().isLoading).toBe(false);
    });

    it('应设置错误信息', () => {
      const store = useAnnotationStore.getState();
      store.setError('加载失败');
      expect(useAnnotationStore.getState().error).toBe('加载失败');

      store.setError(null);
      expect(useAnnotationStore.getState().error).toBeNull();
    });
  });

  describe('类型常量兼容性', () => {
    it('应正确使用 AnnotationType 常量', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: AnnotationType.HIGHLIGHT,
        content: '常量高亮',
      });

      const annotation = store.getAnnotation(id);
      expect(annotation?.type).toBe(AnnotationType.HIGHLIGHT);
      expect(annotation?.type).toBe('highlight');
    });

    it('应正确使用 HighlightColor 常量', () => {
      const store = useAnnotationStore.getState();
      const id = store.addAnnotation({
        knowledgeId: 'k1',
        type: AnnotationType.HIGHLIGHT,
        content: '常量颜色',
        highlightColor: HighlightColor.PURPLE,
      });

      const annotation = store.getAnnotation(id);
      expect(annotation?.highlightColor).toBe(HighlightColor.PURPLE);
      expect(annotation?.highlightColor).toBe('purple');
    });
  });
});