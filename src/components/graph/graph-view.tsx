/**
 * 图谱视图组件
 * 基于Sigma.js实现星空知识图谱可视化
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { SigmaContainer, useSigma, useRegisterEvents, ControlsContainer as Controls, FullScreenControl } from '@react-sigma/core';
import Graph from 'graphology';
import { SigmaContainer as SigmaContainerType } from '@react-sigma/core';
import type { EventHandlers as EventMapping } from '@react-sigma/core';
import type {
  ExtendedGraphNode,
  ExtendedGraphEdge,
  ConstellationInfo,
  GalaxyInfo,
  InteractionState,
  StarrySkyConfig,
} from '../../types/graph';
import { DEFAULT_STARRY_SKY_CONFIG } from '../../types/graph';
import { StarfieldGraphLayout } from '../../lib/graph/starfield-layout';
import { ConstellationVisualizer } from '../../lib/graph/constellation';
import {
  getNodeStyle,
  createSigmaNodeConfig,
  createSigmaEdgeConfig,
  getHoverStyle,
  getSelectedStyle,
  getConstellationLineStyle,
  getConstellationBoundaryStyle,
  getGalaxyBoundaryStyle,
} from '../../lib/graph/node-styles';
import { StarrySky } from './starry-sky';

// ============================================
// 类型定义
// ============================================

interface GraphViewProps {
  /** 图谱节点 */
  nodes: ExtendedGraphNode[];
  /** 图谱边 */
  edges: ExtendedGraphEdge[];
  /** 节点点击回调 */
  onNodeClick?: (node: ExtendedGraphNode) => void;
  /** 节点双击回调 */
  onNodeDoubleClick?: (node: ExtendedGraphNode) => void;
  /** 悬停节点回调 */
  onNodeHover?: (node: ExtendedGraphNode | null) => void;
  /** 星空配置 */
  starryConfig?: Partial<StarrySkyConfig>;
  /** 类名 */
  className?: string;
  /** 是否显示星座连线 */
  showConstellationLines?: boolean;
  /** 是否显示星座边界 */
  showConstellationBoundaries?: boolean;
  /** 是否显示星系边界 */
  showGalaxyBoundaries?: boolean;
}

interface GraphViewState {
  interaction: InteractionState;
  constellations: ConstellationInfo[];
  galaxies: GalaxyInfo[];
  isLoaded: boolean;
}

// ============================================
// Sigma.js 事件处理组件
// ============================================

/**
 * Sigma事件处理器
 */
const SigmaEventHandlers: React.FC<{
  nodes: ExtendedGraphNode[];
  onNodeClick: (node: ExtendedGraphNode) => void;
  onNodeDoubleClick: (node: ExtendedGraphNode) => void;
  onNodeHover: (node: ExtendedGraphNode | null) => void;
  updateInteraction: (state: Partial<InteractionState>) => void;
}> = ({ nodes, onNodeClick, onNodeDoubleClick, onNodeHover, updateInteraction }) => {
  const sigma = useSigma();

  useRegisterEvents({
    enterNode: (event: EventMapping['enterNode']) => {
      const node = event.node;
      const graphNode = nodes.find(n => n.id === node);
      if (graphNode) {
        onNodeHover(graphNode);
        updateInteraction({ hoveredNode: node });

        // 悬停效果
        const graph = sigma.getGraph();
        graph.setNodeAttribute(node, 'scale', 1.2);
      }
    },
    leaveNode: (event: EventMapping['leaveNode']) => {
      const node = event.node;
      onNodeHover(null);
      updateInteraction({ hoveredNode: undefined });

      // 恢复节点大小
      const graph = sigma.getGraph();
      const originalSize = graph.getNodeAttribute(node, 'size');
      graph.setNodeAttribute(node, 'scale', 1);
    },
    clickNode: (event: EventMapping['clickNode']) => {
      const node = event.node;
      const graphNode = nodes.find(n => n.id === node);
      if (graphNode) {
        onNodeClick(graphNode);
        updateInteraction({ selectedNode: node });
      }
    },
    doubleClickNode: (event: EventMapping['doubleClickNode']) => {
      const node = event.node;
      const graphNode = nodes.find(n => n.id === node);
      if (graphNode) {
        onNodeDoubleClick(graphNode);
      }
    },
    wheel: () => {
      const camera = sigma.getCamera();
      updateInteraction({ zoom: camera.ratio });
    },
    drag: () => {
      const camera = sigma.getCamera();
      updateInteraction({
        zoom: camera.ratio,
        pan: { x: camera.x, y: camera.y },
      });
    },
  });

  return null;
};

// ============================================
// 星座可视化层
// ============================================

/**
 * 星座可视化层
 * 在Sigma.js之上绘制星座连线和边界
 */
const ConstellationLayer: React.FC<{
  constellations: ConstellationInfo[];
  galaxies: GalaxyInfo[];
  nodePositions: Map<string, { x: number; y: number }>;
  showLines: boolean;
  showBoundaries: boolean;
  showGalaxies: boolean;
}> = ({ constellations, galaxies, nodePositions, showLines, showBoundaries, showGalaxies }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigma = useSigma();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // 获取Sigma.js的相机状态
      const camera = sigma.getCamera();

      // 绘制星座连线
      if (showLines) {
        for (const constellation of constellations) {
          const style = getConstellationLineStyle(constellation.color);
          const centerPos = nodePositions.get(constellation.centerNode);

          if (centerPos) {
            for (const memberId of constellation.members) {
              if (memberId === constellation.centerNode) continue;

              const memberPos = nodePositions.get(memberId);
              if (memberPos) {
                ctx.beginPath();
                ctx.moveTo(centerPos.x, centerPos.y);
                ctx.lineTo(memberPos.x, memberPos.y);
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = style.strokeWidth;
                ctx.globalAlpha = style.opacity;
                if (style.strokeDasharray) {
                  ctx.setLineDash(style.strokeDasharray.split(',').map(Number));
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
              }
            }
          }
        }
      }

      // 绘制星座边界
      if (showBoundaries) {
        for (const constellation of constellations) {
          const centerPos = nodePositions.get(constellation.centerNode);
          if (centerPos) {
            const style = getConstellationBoundaryStyle(constellation.color);
            ctx.beginPath();
            ctx.arc(centerPos.x, centerPos.y, constellation.radius, 0, Math.PI * 2);
            ctx.fillStyle = style.fill;
            ctx.globalAlpha = style.fillOpacity;
            ctx.fill();
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth = style.strokeWidth;
            ctx.globalAlpha = 1;
            ctx.stroke();
          }
        }
      }

      // 绘制星系边界
      if (showGalaxies) {
        for (const galaxy of galaxies) {
          const style = getGalaxyBoundaryStyle(galaxy.color);
          ctx.beginPath();
          ctx.arc(galaxy.center.x, galaxy.center.y, galaxy.radius, 0, Math.PI * 2);
          ctx.fillStyle = style.fill;
          ctx.globalAlpha = style.fillOpacity;
          ctx.fill();
          ctx.strokeStyle = style.stroke;
          ctx.lineWidth = style.strokeWidth;
          ctx.globalAlpha = 1;
          ctx.stroke();

          // 绘制星系标签
          ctx.fillStyle = galaxy.color;
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(galaxy.name, galaxy.center.x, galaxy.center.y - galaxy.radius - 10);
        }
      }
    };

    render();

    // 监听Sigma.js渲染事件
    sigma.on('render', render);

    return () => {
      sigma.off('render', render);
    };
  }, [constellations, galaxies, nodePositions, showLines, showBoundaries, showGalaxies, sigma]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};

// ============================================
// 节点详情面板
// ============================================

/**
 * 节点详情面板
 */
const NodeDetailPanel: React.FC<{
  node: ExtendedGraphNode | null;
  onClose: () => void;
}> = ({ node, onClose }) => {
  if (!node) return null;

  return (
    <div
      className="absolute right-4 top-4 w-80 bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-xl border border-gray-700 p-4 z-20"
      style={{ maxHeight: '80vh', overflowY: 'auto' }}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-white truncate flex-1">
          {node.label || node.id}
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">类型:</span>
          <span className="px-2 py-0.5 rounded bg-gray-700 text-white">
            {node.nodeType}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">重要性:</span>
          <span className={`px-2 py-0.5 rounded ${
            node.importance === 'high' ? 'bg-red-900/50 text-red-300' :
            node.importance === 'medium' ? 'bg-yellow-900/50 text-yellow-300' :
            'bg-gray-700 text-gray-300'
          }`}>
            {node.importance === 'high' ? '高' :
             node.importance === 'medium' ? '中' : '低'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">紧急度:</span>
          <span className={`px-2 py-0.5 rounded ${
            node.urgency === 'urgent' ? 'bg-red-900/50 text-red-300' :
            node.urgency === 'normal' ? 'bg-yellow-900/50 text-yellow-300' :
            'bg-gray-700 text-gray-300'
          }`}>
            {node.urgency === 'urgent' ? '紧急' :
             node.urgency === 'normal' ? '一般' : '不紧急'}
          </span>
        </div>

        {node.constellationId && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">星座:</span>
            <span className="text-blue-300">{node.constellationId}</span>
          </div>
        )}

        {node.galaxyId && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">星系:</span>
            <span className="text-purple-300">{node.galaxyId}</span>
          </div>
        )}

        {node.labels && node.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {node.labels.map((label, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-blue-900/50 text-blue-300 text-xs">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// 主组件
// ============================================

/**
 * 图谱视图组件
 */
export const GraphView: React.FC<GraphViewProps> = ({
  nodes,
  edges,
  onNodeClick,
  onNodeDoubleClick,
  onNodeHover,
  starryConfig,
  className = '',
  showConstellationLines = true,
  showConstellationBoundaries = true,
  showGalaxyBoundaries = true,
}) => {
  const [state, setState] = useState<GraphViewState>({
    interaction: {
      zoom: 1,
      pan: { x: 0, y: 0 },
      isDragging: false,
    },
    constellations: [],
    galaxies: [],
    isLoaded: false,
  });

  const graphRef = useRef<Graph | null>(null);
  const layoutRef = useRef<StarfieldGraphLayout | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // 初始化图谱
  const initializeGraph = useCallback(() => {
    const graph = new Graph();
    graphRef.current = graph;

    // 创建布局器
    layoutRef.current = new StarfieldGraphLayout();

    // 执行布局
    const result = layoutRef.current.compute(nodes, edges);

    // 更新节点位置引用
    nodePositionsRef.current = result.nodePositions;

    // 添加节点到图谱
    for (const node of nodes) {
      const pos = result.nodePositions.get(node.id) || { x: 0, y: 0 };
      const nodeWithPos = { ...node, x: pos.x, y: pos.y };
      const constellation = result.constellations.find(c => c.members.includes(node.id));

      graph.addNode(node.id, {
        ...createSigmaNodeConfig(nodeWithPos, constellation?.color),
      });
    }

    // 添加边到图谱
    for (const edge of edges) {
      graph.addEdge(edge.source, edge.target, {
        ...createSigmaEdgeConfig(edge),
      });
    }

    // 更新状态
    setState(prev => ({
      ...prev,
      constellations: result.constellations,
      galaxies: result.galaxies,
      isLoaded: true,
    }));
  }, [nodes, edges]);

  // 图谱加载
  useEffect(() => {
    initializeGraph();
    return () => {
      if (layoutRef.current) {
        layoutRef.current.dispose();
      }
    };
  }, [initializeGraph]);

  // 更新交互状态
  const updateInteraction = useCallback((partial: Partial<InteractionState>) => {
    setState(prev => ({
      ...prev,
      interaction: { ...prev.interaction, ...partial },
    }));
  }, []);

  // 节点点击处理
  const handleNodeClick = useCallback((node: ExtendedGraphNode) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
  }, [onNodeClick]);

  // 节点双击处理
  const handleNodeDoubleClick = useCallback((node: ExtendedGraphNode) => {
    if (onNodeDoubleClick) {
      onNodeDoubleClick(node);
    }
  }, [onNodeDoubleClick]);

  // 节点悬停处理
  const handleNodeHover = useCallback((node: ExtendedGraphNode | null) => {
    if (onNodeHover) {
      onNodeHover(node);
    }
  }, [onNodeHover]);

  // 关闭详情面板
  const handleCloseDetail = useCallback(() => {
    setState(prev => ({
      ...prev,
      interaction: { ...prev.interaction, selectedNode: undefined },
    }));
  }, []);

  // 获取选中的节点
  const selectedNode = useMemo(() => {
    if (!state.interaction.selectedNode) return null;
    return nodes.find(n => n.id === state.interaction.selectedNode) || null;
  }, [state.interaction.selectedNode, nodes]);

  return (
    <div className={`relative ${className}`}>
      <StarrySky config={starryConfig} className="absolute inset-0" />

      {state.isLoaded && graphRef.current && (
        <div className="relative w-full h-full">
          <SigmaContainer
            graph={graphRef.current}
            settings={{
              renderEdgeLabels: true,
              defaultEdgeColor: '#e0e0e0',
              defaultNodeType: 'circle',
              labelDensity: 2,
              labelGridCellSize: 100,
              labelRenderedSizeThreshold: 6,
              edgeLabelSize: 10,
              edgeLabelColor: { color: '#ffffff' },
              zoomToSizeRatioFunction: 'sqrt',
              maxCameraRatio: 10,
              minCameraRatio: 0.1,
            }}
            className="w-full h-full"
          >
            {/* 事件处理 */}
            <SigmaEventHandlers
              nodes={nodes}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              onNodeHover={handleNodeHover}
              updateInteraction={updateInteraction}
            />

            {/* 星座可视化层 */}
            <ConstellationLayer
              constellations={state.constellations}
              galaxies={state.galaxies}
              nodePositions={nodePositionsRef.current}
              showLines={showConstellationLines}
              showBoundaries={showConstellationBoundaries}
              showGalaxies={showGalaxyBoundaries}
            />

            {/* 控制按钮 */}
            <Controls position="bottom-right">
              <FullScreenControl />
            </Controls>
          </SigmaContainer>

          {/* 节点详情面板 */}
          {selectedNode && (
            <NodeDetailPanel
              node={selectedNode}
              onClose={handleCloseDetail}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default GraphView;