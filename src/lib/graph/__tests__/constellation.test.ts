/**
 * 星座算法测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConstellationDetector, ConstellationLayout } from '../constellation';
import type { ExtendedGraphNode, ExtendedGraphEdge, NodePosition } from '../../../types/graph';
import { NodeType, EdgeType } from '../../../types/graph';

describe('ConstellationDetector', () => {
  let nodes: ExtendedGraphNode[];
  let edges: ExtendedGraphEdge[];
  let positions: Map<string, NodePosition>;

  beforeEach(() => {
    nodes = [
      {
        id: 'node-1',
        label: '中心节点',
        nodeType: NodeType.Problem,
        importance: 'high',
        urgency: 'urgent',
      },
      {
        id: 'node-2',
        label: '想法节点',
        nodeType: NodeType.Idea,
        importance: 'medium',
        urgency: 'normal',
      },
      {
        id: 'node-3',
        label: '文档节点',
        nodeType: NodeType.Document,
        importance: 'low',
        urgency: 'not-urgent',
      },
      {
        id: 'node-4',
        label: '标注节点',
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
        source: 'node-1',
        target: 'node-3',
        edgeType: EdgeType.Reference,
      },
    ];

    positions = new Map([
      ['node-1', { x: 100, y: 100 }],
      ['node-2', { x: 150, y: 100 }],
      ['node-3', { x: 100, y: 150 }],
      ['node-4', { x: 300, y: 300 }],
    ]);
  });

  describe('detect', () => {
    it('应该检测并返回星座', () => {
      const detector = new ConstellationDetector(nodes, edges, positions);
      const constellations = detector.detect();

      expect(Array.isArray(constellations)).toBe(true);
      expect(constellations.length).toBeGreaterThan(0);
    });

    it('星座应该包含必要的信息', () => {
      const detector = new ConstellationDetector(nodes, edges, positions);
      const constellations = detector.detect();

      for (const constellation of constellations) {
        expect(constellation.id).toBeDefined();
        expect(constellation.name).toBeDefined();
        expect(constellation.centerNode).toBeDefined();
        expect(constellation.members).toBeInstanceOf(Array);
        expect(constellation.members.length).toBeGreaterThan(0);
        expect(constellation.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(constellation.nodeCount).toBe(constellation.members.length);
      }
    });

    it('应该选择度最高的节点作为中心节点', () => {
      const detector = new ConstellationDetector(nodes, edges, positions);
      const constellations = detector.detect();

      for (const constellation of constellations) {
        const centerNode = nodes.find(n => n.id === constellation.centerNode);
        expect(centerNode).toBeDefined();
      }
    });

    it('空节点列表应该返回空数组', () => {
      const detector = new ConstellationDetector([], [], new Map());
      const constellations = detector.detect();

      expect(constellations).toEqual([]);
    });

    it('单节点应该形成星座', () => {
      const singleNode = [nodes[0]];
      const detector = new ConstellationDetector(singleNode, [], positions);
      const constellations = detector.detect();

      expect(constellations.length).toBe(1);
      expect(constellations[0].members).toContain('node-1');
    });
  });
});

describe('ConstellationLayout', () => {
  let positions: Map<string, NodePosition>;

  beforeEach(() => {
    positions = new Map();
  });

  describe('layout', () => {
    it('单节点应该放在中心', () => {
      const layout = new ConstellationLayout(200, 200);
      const members = ['node-1'];

      layout.layout(members, positions);

      const pos = positions.get('node-1');
      expect(pos).toBeDefined();
      expect(pos!.x).toBe(200);
      expect(pos!.y).toBe(200);
    });

    it('2-6个节点应该使用圆形排列', () => {
      const layout = new ConstellationLayout(200, 200);
      const members = ['node-1', 'node-2', 'node-3', 'node-4'];

      layout.layout(members, positions);

      for (const member of members) {
        const pos = positions.get(member);
        expect(pos).toBeDefined();
        expect(pos!.x).not.toBe(200);
        expect(pos!.y).not.toBe(200);
      }
    });

    it('7-12个节点应该使用双环排列', () => {
      const layout = new ConstellationLayout(200, 200);
      const members = Array.from({ length: 10 }, (_, i) => `node-${i + 1}`);

      layout.layout(members, positions);

      for (const member of members) {
        const pos = positions.get(member);
        expect(pos).toBeDefined();
      }
    });

    it('超过12个节点应该使用螺旋排列', () => {
      const layout = new ConstellationLayout(200, 200);
      const members = Array.from({ length: 20 }, (_, i) => `node-${i + 1}`);

      layout.layout(members, positions);

      for (const member of members) {
        const pos = positions.get(member);
        expect(pos).toBeDefined();
      }
    });

    it('空成员列表应该正常处理', () => {
      const layout = new ConstellationLayout(200, 200);

      expect(() => {
        layout.layout([], positions);
      }).not.toThrow();
    });
  });
});

describe('ConstellationLayout 排列验证', () => {
  it('圆形排列应该均匀分布', () => {
    const layout = new ConstellationLayout(200, 200, 50);
    const members = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
    const positions = new Map<string, NodePosition>();

    layout.layout(members, positions);

    // 验证所有节点到中心的距离大致相等
    const distances: number[] = [];
    for (const member of members) {
      const pos = positions.get(member)!;
      const distance = Math.sqrt(Math.pow(pos.x - 200, 2) + Math.pow(pos.y - 200, 2));
      distances.push(distance);
    }

    // 距离应该大致相等（允许一定误差）
    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    for (const d of distances) {
      expect(Math.abs(d - avgDistance)).toBeLessThan(30);
    }
  });

  it('螺旋排列应该从内向外', () => {
    const layout = new ConstellationLayout(200, 200, 30);
    const members = Array.from({ length: 15 }, (_, i) => `node-${i + 1}`);
    const positions = new Map<string, NodePosition>();

    layout.layout(members, positions);

    // 验证节点按顺序从内向外
    const distances: number[] = [];
    for (const member of members) {
      const pos = positions.get(member)!;
      const distance = Math.sqrt(Math.pow(pos.x - 200, 2) + Math.pow(pos.y - 200, 2));
      distances.push(distance);
    }

    // 后面的节点应该比前面的更远（大致趋势）
    let increasing = 0;
    for (let i = 1; i < distances.length; i++) {
      if (distances[i] >= distances[i - 1]) {
        increasing++;
      }
    }
    // 至少60%的节点是递增的
    expect(increasing).toBeGreaterThan(distances.length * 0.6);
  });
});