/**
 * 星空布局算法测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StarfieldLayout } from '../starry-sky';
import type { ExtendedGraphNode, ExtendedGraphEdge } from '../../../types/graph';
import { NodeType, EdgeType } from '../../../types/graph';

describe('StarfieldLayout', () => {
  let nodes: ExtendedGraphNode[];
  let edges: ExtendedGraphEdge[];

  beforeEach(() => {
    // 测试数据
    nodes = [
      {
        id: 'node-1',
        label: 'Node 1',
        nodeType: NodeType.Document,
        importance: 'high',
        urgency: 'urgent',
        x: 100,
        y: 100,
      },
      {
        id: 'node-2',
        label: 'Node 2',
        nodeType: NodeType.Idea,
        importance: 'medium',
        urgency: 'normal',
        x: 200,
        y: 100,
      },
      {
        id: 'node-3',
        label: 'Node 3',
        nodeType: NodeType.Problem,
        importance: 'high',
        urgency: 'urgent',
        x: 150,
        y: 200,
      },
      {
        id: 'node-4',
        label: 'Node 4',
        nodeType: NodeType.Annotation,
        importance: 'low',
        urgency: 'not-urgent',
      },
    ];

    edges = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        edgeType: EdgeType.Reference,
      },
      {
        id: 'edge-2',
        source: 'node-2',
        target: 'node-3',
        edgeType: EdgeType.Derivation,
      },
      {
        id: 'edge-3',
        source: 'node-3',
        target: 'node-4',
        edgeType: EdgeType.Falsification,
      },
    ];
  });

  describe('initialize', () => {
    it('应该正确初始化节点和边', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(10);
      expect(result.nodePositions.size).toBe(4);
      expect(result.constellations.length).toBeGreaterThan(0);
    });

    it('应该为每个节点生成位置', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(10);
      for (const node of nodes) {
        const pos = result.nodePositions.get(node.id);
        expect(pos).toBeDefined();
        expect(pos!.x).toBeDefined();
        expect(pos!.y).toBeDefined();
      }
    });

    it('应该保持已有节点位置', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(10);
      const node1Pos = result.nodePositions.get('node-1');
      // 节点1已有初始位置，应该保持附近
      expect(node1Pos!.x).toBeGreaterThan(50);
      expect(node1Pos!.x).toBeLessThan(150);
    });
  });

  describe('compute', () => {
    it('应该执行布局计算并返回结果', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(50);

      expect(result.nodePositions).toBeInstanceOf(Map);
      expect(result.constellations).toBeInstanceOf(Array);
      expect(result.galaxies).toBeInstanceOf(Array);
    });

    it('应该检测星座', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(50);

      expect(result.constellations.length).toBeGreaterThan(0);
      for (const constellation of result.constellations) {
        expect(constellation.id).toBeDefined();
        expect(constellation.name).toBeDefined();
        expect(constellation.members).toBeInstanceOf(Array);
        expect(constellation.members.length).toBeGreaterThan(0);
      }
    });

    it('应该为星座分配颜色', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const result = layout.compute(50);

      for (const constellation of result.constellations) {
        expect(constellation.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  describe('updateNodePosition', () => {
    it('应该更新节点位置', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      layout.updateNodePosition('node-1', 500, 500);
      const pos = layout.getNodePosition('node-1');

      expect(pos).toBeDefined();
      expect(pos!.x).toBe(500);
      expect(pos!.y).toBe(500);
    });

    it('应该忽略不存在的节点', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      expect(() => {
        layout.updateNodePosition('non-existent', 100, 100);
      }).not.toThrow();
    });
  });

  describe('getConstellations', () => {
    it('应该返回星座列表', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      const constellations = layout.getConstellations();

      expect(Array.isArray(constellations)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('应该释放资源', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);

      expect(() => {
        layout.dispose();
      }).not.toThrow();
    });

    it('释放后调用compute应该可以正常工作', () => {
      const layout = new StarfieldLayout();
      layout.initialize(nodes, edges);
      layout.dispose();

      // 重新初始化
      layout.initialize(nodes, edges);
      const result = layout.compute(10);

      expect(result.nodePositions.size).toBe(4);
    });
  });

  describe('边界测试', () => {
    it('空节点列表应该正常处理', () => {
      const layout = new StarfieldLayout();
      layout.initialize([], []);

      const result = layout.compute(10);

      expect(result.nodePositions.size).toBe(0);
      expect(result.constellations.length).toBe(0);
    });

    it('单节点应该正常处理', () => {
      const singleNode: ExtendedGraphNode[] = [
        {
          id: 'single-node',
          label: 'Single Node',
          nodeType: NodeType.Document,
          importance: 'medium',
          urgency: 'normal',
        },
      ];

      const layout = new StarfieldLayout();
      layout.initialize(singleNode, []);

      const result = layout.compute(10);

      expect(result.nodePositions.size).toBe(1);
      // 单节点不应形成星座
      expect(result.constellations.length).toBe(0);
    });

    it('大量节点应该在合理时间内完成', () => {
      const manyNodes: ExtendedGraphNode[] = [];
      const manyEdges: ExtendedGraphEdge[] = [];

      for (let i = 0; i < 100; i++) {
        manyNodes.push({
          id: `node-${i}`,
          label: `Node ${i}`,
          nodeType: NodeType.Document,
          importance: 'medium',
          urgency: 'normal',
        });

        if (i > 0) {
          manyEdges.push({
            id: `edge-${i}`,
            source: `node-${i - 1}`,
            target: `node-${i}`,
            edgeType: EdgeType.Reference,
          });
        }
      }

      const layout = new StarfieldLayout();
      layout.initialize(manyNodes, manyEdges);

      const startTime = Date.now();
      const result = layout.compute(100);
      const endTime = Date.now();

      expect(result.nodePositions.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // 5秒内完成
    });
  });
});