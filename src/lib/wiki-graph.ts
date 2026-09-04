/**
 * Wiki图谱构建模块
 * 扩展支持问题/想法节点和星座/星系布局
 */

import type {
  ExtendedGraphNode,
  ExtendedGraphEdge,
  ConstellationInfo,
  GalaxyInfo,
  LayoutResult,
} from '../types/graph';
import { NodeType, EdgeType } from '../types/graph';
import { StarfieldGraphLayout } from './graph/starfield-layout';

// ============================================
// 类型定义
// ============================================

/** 原始图谱节点 */
interface RawGraphNode {
  id: string;
  label?: string;
  type?: string;
  path?: string;
  links?: string[];
  backlinks?: string[];
  tags?: string[];
  importance?: 'high' | 'medium' | 'low';
  urgency?: 'urgent' | 'normal' | 'not-urgent';
}

/** 原始图谱边 */
interface RawGraphEdge {
  source: string;
  target: string;
  type?: string;
}

/** 原始图谱数据 */
interface RawGraphData {
  nodes: RawGraphNode[];
  edges: RawGraphEdge[];
}

/** 图谱构建结果 */
export interface WikiGraphResult {
  nodes: ExtendedGraphNode[];
  edges: ExtendedGraphEdge[];
  constellations: ConstellationInfo[];
  galaxies: GalaxyInfo[];
  layout: LayoutResult;
}

// ============================================
// 图谱构建器
// ============================================

/**
 * Wiki图谱构建器
 */
export class WikiGraphBuilder {
  private rawNodes: RawGraphNode[];
  private rawEdges: RawGraphEdge[];
  private nodes: ExtendedGraphNode[];
  private edges: ExtendedGraphEdge[];

  constructor() {
    this.rawNodes = [];
    this.rawEdges = [];
    this.nodes = [];
    this.edges = [];
  }

  /**
   * 从原始数据构建图谱
   */
  build(rawData: RawGraphData): WikiGraphResult {
    this.rawNodes = rawData.nodes;
    this.rawEdges = rawData.edges;

    // 转换节点
    this.transformNodes();

    // 转换边
    this.transformEdges();

    // 执行布局
    const layout = this.computeLayout();

    return {
      nodes: this.nodes,
      edges: this.edges,
      constellations: layout.constellations,
      galaxies: layout.galaxies,
      layout,
    };
  }

  /**
   * 转换节点
   */
  private transformNodes(): void {
    for (const rawNode of this.rawNodes) {
      const nodeType = this.determineNodeType(rawNode);

      const node: ExtendedGraphNode = {
        id: rawNode.id,
        label: rawNode.label || rawNode.id,
        nodeType,
        importance: rawNode.importance || 'medium',
        urgency: rawNode.urgency || 'normal',
        labels: rawNode.tags || [],
      };

      this.nodes.push(node);
    }
  }

  /**
   * 确定节点类型
   */
  private determineNodeType(rawNode: RawGraphNode): NodeType {
    if (rawNode.type) {
      switch (rawNode.type.toLowerCase()) {
        case 'problem':
        case 'question':
          return NodeType.Problem;
        case 'idea':
        case 'thought':
          return NodeType.Idea;
        case 'annotation':
        case 'highlight':
          return NodeType.Annotation;
        case 'research':
          return NodeType.Research;
        case 'image':
        case 'picture':
          return NodeType.Image;
        case 'audio':
          return NodeType.Audio;
        case 'video':
          return NodeType.Video;
        case 'webpage':
        case 'web':
          return NodeType.WebPage;
        case 'document':
        case 'md':
        case 'markdown':
        default:
          return NodeType.Document;
      }
    }

    // 根据标签判断
    if (rawNode.tags?.includes('问题')) return NodeType.Problem;
    if (rawNode.tags?.includes('想法')) return NodeType.Idea;
    if (rawNode.tags?.includes('研究')) return NodeType.Research;

    // 默认是文档
    return NodeType.Document;
  }

  /**
   * 转换边
   */
  private transformEdges(): void {
    for (const rawEdge of this.rawEdges) {
      const edgeType = this.determineEdgeType(rawEdge);

      const edge: ExtendedGraphEdge = {
        id: `${rawEdge.source}-${rawEdge.target}`,
        source: rawEdge.source,
        target: rawEdge.target,
        edgeType,
      };

      this.edges.push(edge);
    }
  }

  /**
   * 确定边类型
   */
  private determineEdgeType(rawEdge: RawGraphEdge): EdgeType {
    if (rawEdge.type) {
      switch (rawEdge.type.toLowerCase()) {
        case 'falsification':
        case 'refute':
          return EdgeType.Falsification;
        case 'derivation':
        case 'derive':
          return EdgeType.Derivation;
        case 'annotation':
        case 'annotate':
          return EdgeType.Annotation;
        case 'hierarchy':
        case 'parent':
        case 'child':
          return EdgeType.Hierarchy;
        case 'association':
        case 'link':
          return EdgeType.Association;
        case 'reference':
        case 'cite':
          return EdgeType.Reference;
        default:
          return EdgeType.Reference;
      }
    }

    // 默认是引用关系
    return EdgeType.Reference;
  }

  /**
   * 执行布局计算
   */
  private computeLayout(): LayoutResult {
    const layout = new StarfieldGraphLayout();
    return layout.compute(this.nodes, this.edges);
  }
}

// ============================================
// 辅助函数
// ============================================

/**
 * 构建Wiki图谱
 */
export function buildWikiGraph(rawData: RawGraphData): WikiGraphResult {
  const builder = new WikiGraphBuilder();
  return builder.build(rawData);
}

/**
 * 从文件路径构建图谱
 */
export async function buildGraphFromFiles(
  filePaths: string[]
): Promise<WikiGraphResult> {
  // 模拟从文件读取数据
  const rawNodes: RawGraphNode[] = [];
  const rawEdges: RawGraphEdge[] = [];

  for (const filePath of filePaths) {
    const id = filePath.replace(/\\/g, '/').replace(/\.md$/, '');
    rawNodes.push({
      id,
      label: id.split('/').pop() || id,
      type: 'document',
      tags: ['文档'],
    });
  }

  // 简单的链接检测
  for (const node of rawNodes) {
    const links = findLinksInContent(node.id);
    for (const link of links) {
      if (rawNodes.some(n => n.id === link)) {
        rawEdges.push({
          source: node.id,
          target: link,
          type: 'reference',
        });
      }
    }
  }

  return buildWikiGraph({ nodes: rawNodes, edges: rawEdges });
}

/**
 * 从内容中查找链接
 */
function findLinksInContent(content: string): string[] {
  // 简单的链接检测：查找 [[link]] 格式
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[1]);
  }

  return links;
}

export default {
  WikiGraphBuilder,
  buildWikiGraph,
  buildGraphFromFiles,
};