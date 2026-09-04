/**
 * 节点样式配置测试
 */

import { describe, it, expect } from 'vitest';
import {
  getNodeStyle,
  getEdgeStyle,
  getNodeColor,
  getNodeSize,
  getNodeShape,
  createSigmaNodeConfig,
  createSigmaEdgeConfig,
  STYLE_PRESETS,
} from '../node-styles';
import type { ExtendedGraphNode } from '../../../types/graph';
import { NodeType, EdgeType } from '../../../types/graph';

describe('node-styles', () => {
  describe('getNodeStyle', () => {
    it('应该为每种节点类型返回正确的样式', () => {
      const nodeTypes = [
        NodeType.Document,
        NodeType.WebPage,
        NodeType.Image,
        NodeType.Audio,
        NodeType.Video,
        NodeType.Idea,
        NodeType.Problem,
        NodeType.Annotation,
        NodeType.Research,
      ];

      for (const nodeType of nodeTypes) {
        const node: ExtendedGraphNode = {
          id: 'test-node',
          label: 'Test Node',
          nodeType,
          importance: 'medium',
          urgency: 'normal',
        };

        const style = getNodeStyle(node);

        expect(style.color).toBeDefined();
        expect(style.size).toBeGreaterThan(0);
        expect(['circle', 'star', 'diamond', 'triangle', 'square']).toContain(style.shape);
        expect(typeof style.glow).toBe('boolean');
      }
    });

    it('高重要性节点应该更大', () => {
      const highNode: ExtendedGraphNode = {
        id: 'high-node',
        label: 'High Importance',
        nodeType: NodeType.Document,
        importance: 'high',
        urgency: 'normal',
      };

      const lowNode: ExtendedGraphNode = {
        id: 'low-node',
        label: 'Low Importance',
        nodeType: NodeType.Document,
        importance: 'low',
        urgency: 'normal',
      };

      const highStyle = getNodeStyle(highNode);
      const lowStyle = getNodeStyle(lowNode);

      expect(highStyle.size).toBeGreaterThan(lowStyle.size);
    });

    it('紧急节点应该发光', () => {
      const urgentNode: ExtendedGraphNode = {
        id: 'urgent-node',
        label: 'Urgent',
        nodeType: NodeType.Document,
        importance: 'medium',
        urgency: 'urgent',
      };

      const normalNode: ExtendedGraphNode = {
        id: 'normal-node',
        label: 'Normal',
        nodeType: NodeType.Document,
        importance: 'medium',
        urgency: 'normal',
      };

      const urgentStyle = getNodeStyle(urgentNode);
      const normalStyle = getNodeStyle(normalNode);

      expect(urgentStyle.glowIntensity).toBeGreaterThan(normalStyle.glowIntensity);
    });
  });

  describe('getEdgeStyle', () => {
    it('应该为每种边类型返回正确的样式', () => {
      const edgeTypes = [
        EdgeType.Reference,
        EdgeType.Falsification,
        EdgeType.Derivation,
        EdgeType.Annotation,
        EdgeType.Association,
        EdgeType.Hierarchy,
      ];

      for (const edgeType of edgeTypes) {
        const edge = {
          id: 'test-edge',
          source: 'source',
          target: 'target',
          edgeType,
        };

        const style = getEdgeStyle(edge);

        expect(style.color).toBeDefined();
        expect(style.width).toBeGreaterThan(0);
        expect(['line', 'curve', 'dashed', 'dotted']).toContain(style.type);
      }
    });

    it('权重应该影响边宽度', () => {
      const lightEdge = {
        id: 'light-edge',
        source: 'source',
        target: 'target',
        edgeType: EdgeType.Reference,
        weight: 0.5,
      };

      const heavyEdge = {
        id: 'heavy-edge',
        source: 'source',
        target: 'target',
        edgeType: EdgeType.Reference,
        weight: 2,
      };

      const lightStyle = getEdgeStyle(lightEdge);
      const heavyStyle = getEdgeStyle(heavyEdge);

      expect(heavyStyle.width).toBeGreaterThan(lightStyle.width);
    });
  });

  describe('getNodeColor', () => {
    it('应该返回节点类型的颜色', () => {
      const node: ExtendedGraphNode = {
        id: 'test-node',
        label: 'Test',
        nodeType: NodeType.Problem,
        importance: 'high',
        urgency: 'urgent',
      };

      const color = getNodeColor(node);

      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('星座颜色应该优先于节点类型颜色', () => {
      const node: ExtendedGraphNode = {
        id: 'test-node',
        label: 'Test',
        nodeType: NodeType.Problem,
        importance: 'high',
        urgency: 'urgent',
      };

      const constellationColor = '#FF0000';
      const color = getNodeColor(node, constellationColor);

      expect(color).toBe(constellationColor);
    });
  });

  describe('getNodeSize and getNodeShape', () => {
    it('应该返回正确的大小', () => {
      const node: ExtendedGraphNode = {
        id: 'test-node',
        label: 'Test',
        nodeType: NodeType.Document,
        importance: 'medium',
        urgency: 'normal',
      };

      const size = getNodeSize(node);
      const shape = getNodeShape(node);

      expect(size).toBeGreaterThan(0);
      expect(['circle', 'star', 'diamond', 'triangle', 'square']).toContain(shape);
    });
  });

  describe('createSigmaNodeConfig', () => {
    it('应该生成Sigma.js节点配置', () => {
      const node: ExtendedGraphNode = {
        id: 'test-node',
        label: 'Test Node',
        nodeType: NodeType.Idea,
        importance: 'high',
        urgency: 'urgent',
        constellationId: 'constellation-1',
        galaxyId: 'galaxy-1',
      };

      const config = createSigmaNodeConfig(node);

      expect(config.x).toBeDefined();
      expect(config.y).toBeDefined();
      expect(config.size).toBeGreaterThan(0);
      expect(config.label).toBe('Test Node');
      expect(config.nodeType).toBe(NodeType.Idea);
      expect(config.constellationId).toBe('constellation-1');
      expect(config.galaxyId).toBe('galaxy-1');
    });

    it('应该支持星座颜色', () => {
      const node: ExtendedGraphNode = {
        id: 'test-node',
        label: 'Test',
        nodeType: NodeType.Document,
        importance: 'medium',
        urgency: 'normal',
      };

      const constellationColor = '#FF0000';
      const config = createSigmaNodeConfig(node, constellationColor);

      expect(config.color).toBe(constellationColor);
    });
  });

  describe('createSigmaEdgeConfig', () => {
    it('应该生成Sigma.js边配置', () => {
      const edge = {
        id: 'test-edge',
        source: 'source',
        target: 'target',
        edgeType: EdgeType.Reference,
        weight: 1,
      };

      const config = createSigmaEdgeConfig(edge);

      expect(config.id).toBe('test-edge');
      expect(config.source).toBe('source');
      expect(config.target).toBe('target');
      expect(config.edgeType).toBe(EdgeType.Reference);
    });
  });

  describe('STYLE_PRESETS', () => {
    it('应该包含所有预设主题', () => {
      expect(STYLE_PRESETS.default).toBeDefined();
      expect(STYLE_PRESETS.deepSpace).toBeDefined();
      expect(STYLE_PRESETS.nebula).toBeDefined();
      expect(STYLE_PRESETS.aurora).toBeDefined();
    });

    it('每个主题应该有背景和样式配置', () => {
      for (const theme of Object.values(STYLE_PRESETS)) {
        expect(theme.background).toBeDefined();
        expect(theme.node).toBeDefined();
        expect(theme.edge).toBeDefined();
      }
    });
  });
});