/**
 * 节点样式配置
 * 定义不同类型节点的视觉样式
 */

import type {
  ExtendedGraphNode,
  NodeStyleConfig,
  EdgeStyleConfig,
  NodeType,
  EdgeType,
} from '../../types/graph';
import {
  DEFAULT_NODE_STYLES,
  DEFAULT_EDGE_STYLES,
} from '../../types/graph';

/**
 * 获取节点样式
 */
export function getNodeStyle(node: ExtendedGraphNode): NodeStyleConfig {
  const baseStyle = { ...DEFAULT_NODE_STYLES[node.nodeType] };

  // 根据重要性调整大小
  if (node.importance === 'high') {
    baseStyle.size *= 1.3;
  } else if (node.importance === 'low') {
    baseStyle.size *= 0.8;
  }

  // 根据紧急度调整发光
  if (node.urgency === 'urgent') {
    baseStyle.glow = true;
    baseStyle.glowIntensity = 0.8;
  }

  return baseStyle;
}

/**
 * 获取边样式
 */
export function getEdgeStyle(edge: { edgeType: EdgeType; weight?: number }): EdgeStyleConfig {
  const baseStyle = { ...DEFAULT_EDGE_STYLES[edge.edgeType] };

  // 根据权重调整宽度
  if (edge.weight) {
    baseStyle.width *= Math.min(1 + edge.weight * 0.5, 3);
  }

  return baseStyle;
}

/**
 * 获取节点显示颜色
 * 考虑星座颜色
 */
export function getNodeColor(
  node: ExtendedGraphNode,
  constellationColor?: string
): string {
  // 如果有星座颜色，使用星座颜色
  if (constellationColor) {
    return constellationColor;
  }

  // 否则使用节点类型颜色
  const style = getNodeStyle(node);
  return style.color;
}

/**
 * 获取节点显示大小
 */
export function getNodeSize(node: ExtendedGraphNode): number {
  const style = getNodeStyle(node);
  return style.size;
}

/**
 * 获取节点形状
 */
export function getNodeShape(node: ExtendedGraphNode): NodeStyleConfig['shape'] {
  const style = getNodeStyle(node);
  return style.shape;
}

/**
 * 生成Sigma.js节点配置
 */
export function createSigmaNodeConfig(
  node: ExtendedGraphNode,
  constellationColor?: string
): Record<string, unknown> {
  const style = getNodeStyle(node);
  const color = constellationColor || style.color;

  return {
    x: node.x || 0,
    y: node.y || 0,
    size: style.size,
    label: node.label || node.id,
    color,
    type: style.shape,
    ...(style.glow && {
      glow: style.glowColor,
      glowIntensity: style.glowIntensity,
    }),
    // 自定义属性
    nodeType: node.nodeType,
    importance: node.importance,
    urgency: node.urgency,
    constellationId: node.constellationId,
    galaxyId: node.galaxyId,
  };
}

/**
 * 生成Sigma.js边配置
 */
export function createSigmaEdgeConfig(
  edge: { id: string; source: string; target: string; edgeType: EdgeType; weight?: number }
): Record<string, unknown> {
  const style = getEdgeStyle(edge);

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    size: style.width,
    color: style.color,
    type: style.type,
    ...(style.arrow && {
      arrow: 'forward',
    }),
    ...(style.glow && {
      glow: style.glowColor,
      glowIntensity: style.glowIntensity,
    }),
    // 自定义属性
    edgeType: edge.edgeType,
    weight: edge.weight,
  };
}

/**
 * 获取节点悬停样式
 */
export function getHoverStyle(): Record<string, unknown> {
  return {
    scale: 1.2,
    glow: '#ffffff',
    glowIntensity: 0.5,
  };
}

/**
 * 获取节点选中样式
 */
export function getSelectedStyle(): Record<string, unknown> {
  return {
    scale: 1.3,
    glow: '#ffff00',
    glowIntensity: 0.8,
    borderColor: '#ffffff',
    borderWidth: 2,
  };
}

/**
 * 生成星座连线样式
 */
export function getConstellationLineStyle(color: string): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
} {
  return {
    stroke: color,
    strokeWidth: 1,
    strokeDasharray: '5,5',
    opacity: 0.3,
  };
}

/**
 * 生成星座边界样式
 */
export function getConstellationBoundaryStyle(color: string): {
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillOpacity: number;
} {
  return {
    stroke: color,
    strokeWidth: 2,
    fill: color,
    fillOpacity: 0.1,
  };
}

/**
 * 生成星系边界样式
 */
export function getGalaxyBoundaryStyle(color: string): {
  stroke: string;
  strokeWidth: number;
  fill: string;
  fillOpacity: number;
} {
  return {
    stroke: color,
    strokeWidth: 3,
    fill: color,
    fillOpacity: 0.05,
  };
}

/**
 * 样式预设
 */
export const STYLE_PRESETS = {
  // 默认主题
  default: {
    background: '#0a0a23',
    node: DEFAULT_NODE_STYLES,
    edge: DEFAULT_EDGE_STYLES,
  },
  // 深空主题
  deepSpace: {
    background: '#000011',
    node: {
      ...DEFAULT_NODE_STYLES,
      [NodeType.Problem]: {
        ...DEFAULT_NODE_STYLES[NodeType.Problem],
        color: '#FF4444',
        glowColor: '#FF4444',
      },
      [NodeType.Idea]: {
        ...DEFAULT_NODE_STYLES[NodeType.Idea],
        color: '#FFD700',
        glowColor: '#FFD700',
      },
    },
    edge: DEFAULT_EDGE_STYLES,
  },
  // 星云主题
  nebula: {
    background: '#1a0a2e',
    node: {
      ...DEFAULT_NODE_STYLES,
      [NodeType.Problem]: {
        ...DEFAULT_NODE_STYLES[NodeType.Problem],
        color: '#FF69B4',
        glowColor: '#FF69B4',
      },
      [NodeType.Idea]: {
        ...DEFAULT_NODE_STYLES[NodeType.Idea],
        color: '#00FF7F',
        glowColor: '#00FF7F',
      },
    },
    edge: DEFAULT_EDGE_STYLES,
  },
  // 极光主题
  aurora: {
    background: '#001122',
    node: {
      ...DEFAULT_NODE_STYLES,
      [NodeType.Problem]: {
        ...DEFAULT_NODE_STYLES[NodeType.Problem],
        color: '#00FFFF',
        glowColor: '#00FFFF',
      },
      [NodeType.Idea]: {
        ...DEFAULT_NODE_STYLES[NodeType.Idea],
        color: '#FF00FF',
        glowColor: '#FF00FF',
      },
    },
    edge: DEFAULT_EDGE_STYLES,
  },
};

/**
 * 获取当前主题样式
 */
export function getCurrentTheme(theme: keyof typeof STYLE_PRESETS = 'default') {
  return STYLE_PRESETS[theme];
}

export default {
  getNodeStyle,
  getEdgeStyle,
  getNodeColor,
  getNodeSize,
  getNodeShape,
  createSigmaNodeConfig,
  createSigmaEdgeConfig,
  getHoverStyle,
  getSelectedStyle,
  getConstellationLineStyle,
  getConstellationBoundaryStyle,
  getGalaxyBoundaryStyle,
  STYLE_PRESETS,
  getCurrentTheme,
};