/**
 * Wiki图谱构建测试
 */

import { describe, it, expect } from 'vitest';
import { WikiGraphBuilder, buildWikiGraph } from '../wiki-graph';
import type { RawGraphNode, RawGraphEdge } from '../wiki-graph';
import { NodeType, EdgeType } from '../../types/graph';

describe('WikiGraphBuilder', () => {
  let rawData: { nodes: RawGraphNode[]; edges: RawGraphEdge[] };

  beforeEach(() => {
    rawData = {
      nodes: [
        {
          id: 'problem-1',
          label: '研究问题1',
          type: 'problem',
          tags: ['问题', '研究'],
          importance: 'high',
          urgency: 'urgent',
        },
        {
          id: 'idea-1',
          label: '想法1',
          type: 'idea',
          tags: ['想法'],
          importance: 'medium',
          urgency: 'normal',
        },
        {
          id: 'doc-1',
          label: '文档1',
          type: 'document',
          tags: ['文档'],
          importance: 'low',
          urgency: 'not-urgent',
        },
      ],
      edges: [
        {
          source: 'problem-1',
          target: 'idea-1',
          type: 'derivation',
        },
        {
          source: 'idea-1',
          target: 'doc-1',
          type: 'reference',
        },
      ],
    };
  });

  describe('build', () => {
    it('应该构建完整的图谱', () => {
      const builder = new WikiGraphBuilder();
      const result = builder.build(rawData);

      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(2);
      expect(result.constellations.length).toBeGreaterThan(0);
      expect(result.galaxies.length).toBeGreaterThan(0);
      expect(result.layout).toBeDefined();
    });

    it('应该正确转换节点类型', () => {
      const builder = new WikiGraphBuilder();
      const result = builder.build(rawData);

      const problemNode = result.nodes.find(n => n.id === 'problem-1');
      const ideaNode = result.nodes.find(n => n.id === 'idea-1');
      const docNode = result.nodes.find(n => n.id === 'doc-1');

      expect(problemNode?.nodeType).toBe(NodeType.Problem);
      expect(ideaNode?.nodeType).toBe(NodeType.Idea);
      expect(docNode?.nodeType).toBe(NodeType.Document);
    });

    it('应该正确转换边类型', () => {
      const builder = new WikiGraphBuilder();
      const result = builder.build(rawData);

      const edge1 = result.edges.find(e => e.source === 'problem-1');
      const edge2 = result.edges.find(e => e.source === 'idea-1');

      expect(edge1?.edgeType).toBe(EdgeType.Derivation);
      expect(edge2?.edgeType).toBe(EdgeType.Reference);
    });

    it('应该保留节点元数据', () => {
      const builder = new WikiGraphBuilder();
      const result = builder.build(rawData);

      const node = result.nodes.find(n => n.id === 'problem-1');

      expect(node?.importance).toBe('high');
      expect(node?.urgency).toBe('urgent');
      expect(node?.labels).toContain('问题');
      expect(node?.labels).toContain('研究');
    });
  });
});

describe('buildWikiGraph', () => {
  it('应该构建图谱并返回结果', () => {
    const rawData = {
      nodes: [
        { id: 'node-1', label: 'Node 1', type: 'document' },
        { id: 'node-2', label: 'Node 2', type: 'document' },
      ],
      edges: [
        { source: 'node-1', target: 'node-2', type: 'reference' },
      ],
    };

    const result = buildWikiGraph(rawData);

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.constellations.length).toBeGreaterThanOrEqual(0);
  });

  it('空数据应该正常处理', () => {
    const result = buildWikiGraph({ nodes: [], edges: [] });

    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
    expect(result.constellations.length).toBe(0);
  });

  it('单节点应该正常处理', () => {
    const rawData = {
      nodes: [{ id: 'single-node', label: 'Single', type: 'document' }],
      edges: [],
    };

    const result = buildWikiGraph(rawData);

    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });
});

describe('节点类型推断', () => {
  it('应该根据标签推断节点类型', () => {
    const rawData = {
      nodes: [
        {
          id: 'node-1',
          label: 'Node 1',
          tags: ['问题'],
        },
        {
          id: 'node-2',
          label: 'Node 2',
          tags: ['想法'],
        },
        {
          id: 'node-3',
          label: 'Node 3',
          tags: ['研究'],
        },
      ],
      edges: [],
    };

    const result = buildWikiGraph(rawData);

    expect(result.nodes[0].nodeType).toBe(NodeType.Problem);
    expect(result.nodes[1].nodeType).toBe(NodeType.Idea);
    expect(result.nodes[2].nodeType).toBe(NodeType.Research);
  });

  it('未知类型应该默认为文档', () => {
    const rawData = {
      nodes: [
        {
          id: 'node-1',
          label: 'Node 1',
          type: 'unknown',
        },
      ],
      edges: [],
    };

    const result = buildWikiGraph(rawData);

    expect(result.nodes[0].nodeType).toBe(NodeType.Document);
  });
});

describe('边类型推断', () => {
  it('应该根据类型推断边类型', () => {
    const rawData = {
      nodes: [
        { id: 'node-1', label: 'Node 1' },
        { id: 'node-2', label: 'Node 2' },
        { id: 'node-3', label: 'Node 3' },
        { id: 'node-4', label: 'Node 4' },
      ],
      edges: [
        { source: 'node-1', target: 'node-2', type: 'falsification' },
        { source: 'node-2', target: 'node-3', type: 'derivation' },
        { source: 'node-3', target: 'node-4', type: 'annotation' },
      ],
    };

    const result = buildWikiGraph(rawData);

    expect(result.edges[0].edgeType).toBe(EdgeType.Falsification);
    expect(result.edges[1].edgeType).toBe(EdgeType.Derivation);
    expect(result.edges[2].edgeType).toBe(EdgeType.Annotation);
  });

  it('未知类型应该默认为引用', () => {
    const rawData = {
      nodes: [
        { id: 'node-1', label: 'Node 1' },
        { id: 'node-2', label: 'Node 2' },
      ],
      edges: [
        { source: 'node-1', target: 'node-2', type: 'unknown' },
      ],
    };

    const result = buildWikiGraph(rawData);

    expect(result.edges[0].edgeType).toBe(EdgeType.Reference);
  });
});

describe('性能测试', () => {
  it('100个节点应该在合理时间内完成', () => {
    const rawData = {
      nodes: Array.from({ length: 100 }, (_, i) => ({
        id: `node-${i}`,
        label: `Node ${i}`,
        type: 'document',
      })),
      edges: Array.from({ length: 99 }, (_, i) => ({
        source: `node-${i}`,
        target: `node-${i + 1}`,
        type: 'reference',
      })),
    };

    const startTime = Date.now();
    const result = buildWikiGraph(rawData);
    const endTime = Date.now();

    expect(result.nodes.length).toBe(100);
    expect(result.edges.length).toBe(99);
    expect(endTime - startTime).toBeLessThan(5000); // 5秒内完成
  });
});