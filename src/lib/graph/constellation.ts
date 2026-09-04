/**
 * 星座算法
 * 实现社区到星座的映射、星座命名、星座可视化
 */

import type {
  ExtendedGraphNode,
  ExtendedGraphEdge,
  ConstellationInfo,
  NodePosition,
} from '../../types/graph';
import { CONSTELLATION_NAMES } from '../../types/graph';

/**
 * 星座检测器
 * 基于社区检测结果划分星座
 */
export class ConstellationDetector {
  private nodes: Map<string, ExtendedGraphNode>;
  private edges: Map<string, ExtendedGraphEdge>;
  private positions: Map<string, NodePosition>;

  constructor(
    nodes: ExtendedGraphNode[],
    edges: ExtendedGraphEdge[],
    positions: Map<string, NodePosition>
  ) {
    this.nodes = new Map(nodes.map(n => [n.id, n]));
    this.edges = new Map(edges.map(e => [e.id, e]));
    this.positions = positions;
  }

  /**
   * 检测星座
   * 使用Louvain算法进行社区检测，然后映射为星座
   */
  detect(): ConstellationInfo[] {
    const communities = this.louvain();
    const constellations: ConstellationInfo[] = [];

    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      if (community.length < 1) continue;

      const constellation = this.mapToConstellation(community, i);
      constellations.push(constellation);
    }

    return constellations;
  }

  /**
   * Louvain社区检测算法
   */
  private louvain(): string[][] {
    // 初始化：每个节点一个社区
    const nodeToCommunity = new Map<string, number>();
    const communityToNodes = new Map<number, Set<string>>();

    let communityId = 0;
    for (const nodeId of this.nodes.keys()) {
      nodeToCommunity.set(nodeId, communityId);
      communityToNodes.set(communityId, new Set([nodeId]));
      communityId++;
    }

    // 构建邻接表
    const adjacency = this.buildAdjacency();

    // 迭代优化
    let changed = true;
    let iteration = 0;
    const maxIterations = 100;

    while (changed && iteration < maxIterations) {
      changed = false;

      for (const nodeId of this.nodes.keys()) {
        const currentCommunity = nodeToCommunity.get(nodeId)!;
        const neighborCommunities = this.getNeighborCommunities(
          nodeId,
          adjacency,
          nodeToCommunity
        );

        // 找到模块度增益最大的社区
        let bestCommunity = currentCommunity;
        let maxGain = 0;

        for (const commId of neighborCommunities) {
          const gain = this.calculateModularityGain(
            nodeId,
            currentCommunity,
            commId,
            communityToNodes,
            adjacency
          );

          if (gain > maxGain) {
            maxGain = gain;
            bestCommunity = commId;
          }
        }

        if (bestCommunity !== currentCommunity) {
          // 移动节点
          communityToNodes.get(currentCommunity)!.delete(nodeId);
          communityToNodes.get(bestCommunity)!.add(nodeId);
          nodeToCommunity.set(nodeId, bestCommunity);
          changed = true;
        }
      }

      iteration++;
    }

    // 聚合结果
    return Array.from(communityToNodes.values())
      .filter(community => community.size > 0)
      .map(community => Array.from(community));
  }

  /**
   * 构建邻接表
   */
  private buildAdjacency(): Map<string, Set<string>> {
    const adjacency = new Map<string, Set<string>>();

    for (const node of this.nodes.values()) {
      adjacency.set(node.id, new Set());
    }

    for (const edge of this.edges.values()) {
      const sourceNeighbors = adjacency.get(edge.source);
      const targetNeighbors = adjacency.get(edge.target);

      if (sourceNeighbors) sourceNeighbors.add(edge.target);
      if (targetNeighbors) targetNeighbors.add(edge.source);
    }

    return adjacency;
  }

  /**
   * 获取邻居社区
   */
  private getNeighborCommunities(
    nodeId: string,
    adjacency: Map<string, Set<string>>,
    nodeToCommunity: Map<string, number>
  ): number[] {
    const neighbors = adjacency.get(nodeId) || new Set();
    const communities = new Set<number>();

    for (const neighbor of neighbors) {
      const commId = nodeToCommunity.get(neighbor);
      if (commId !== undefined) {
        communities.add(commId);
      }
    }

    return Array.from(communities);
  }

  /**
   * 计算模块度增益
   */
  private calculateModularityGain(
    nodeId: string,
    fromCommunity: number,
    toCommunity: number,
    communityToNodes: Map<number, Set<string>>,
    adjacency: Map<string, Set<string>>
  ): number {
    const m = this.edges.size;
    const neighbors = adjacency.get(nodeId) || new Set();
    const k_i = neighbors.size;

    // 计算与目标社区的内部连接数
    const toNodes = communityToNodes.get(toCommunity) || new Set();
    let k_i_in = 0;
    for (const neighbor of neighbors) {
      if (toNodes.has(neighbor)) {
        k_i_in++;
      }
    }

    // 计算与源社区的内部连接数
    const fromNodes = communityToNodes.get(fromCommunity) || new Set();
    let k_i_out = 0;
    for (const neighbor of neighbors) {
      if (fromNodes.has(neighbor)) {
        k_i_out++;
      }
    }

    // 模块度增益公式
    const sigma_tot = this.getCommunityDegree(toNodes, adjacency);
    const gain = (k_i_in / (2 * m)) - ((sigma_tot * k_i) / (2 * m * m));

    return gain;
  }

  /**
   * 获取社区总度数
   */
  private getCommunityDegree(
    community: Set<string>,
    adjacency: Map<string, Set<string>>
  ): number {
    let degree = 0;
    for (const nodeId of community) {
      degree += (adjacency.get(nodeId) || new Set()).size;
    }
    return degree;
  }

  /**
   * 映射到星座
   */
  private mapToConstellation(members: string[], index: number): ConstellationInfo {
    // 找到中心节点
    const centerNode = this.findCenterNode(members);

    // 计算星座半径
    const radius = this.calculateRadius(members);

    // 生成星座名称
    const name = this.generateName(index);

    // 生成主题
    const theme = this.generateTheme(members);

    // 生成颜色
    const color = this.generateColor(index);

    return {
      id: `constellation-${index}`,
      name,
      centerNode,
      members,
      theme,
      color,
      nodeCount: members.length,
      radius,
    };
  }

  /**
   * 找到中心节点
   */
  private findCenterNode(members: string[]): string {
    // 选择度最高的节点作为中心
    let maxDegree = -1;
    let centerNode = members[0];

    for (const nodeId of members) {
      let degree = 0;
      for (const edge of this.edges.values()) {
        if (edge.source === nodeId || edge.target === nodeId) {
          degree++;
        }
      }

      if (degree > maxDegree) {
        maxDegree = degree;
        centerNode = nodeId;
      }
    }

    return centerNode;
  }

  /**
   * 计算星座半径
   */
  private calculateRadius(members: string[]): number {
    if (members.length === 0) return 0;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const nodeId of members) {
      const pos = this.positions.get(nodeId);
      if (pos) {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return Math.max(width, height) / 2 + 30;
  }

  /**
   * 生成星座名称
   */
  private generateName(index: number): string {
    const nameIndex = index % CONSTELLATION_NAMES.length;
    return CONSTELLATION_NAMES[nameIndex];
  }

  /**
   * 生成星座主题
   */
  private generateTheme(members: string[]): string {
    const themes: string[] = [];

    for (const nodeId of members) {
      const node = this.nodes.get(nodeId);
      if (node && node.labels) {
        themes.push(...node.labels);
      }
    }

    // 统计最常见的主题
    const themeCount = new Map<string, number>();
    for (const theme of themes) {
      themeCount.set(theme, (themeCount.get(theme) || 0) + 1);
    }

    const sorted = Array.from(themeCount.entries())
      .sort((a, b) => b[1] - a[1]);

    return sorted[0]?.[0] || '综合';
  }

  /**
   * 生成星座颜色
   */
  private generateColor(index: number): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#FF8A5C', '#EA6B8C', '#6B8CEA', '#8CEA6B', '#EA6B6B',
    ];

    return colors[index % colors.length];
  }
}

/**
 * 星座布局器
 * 将星座内的节点排列成星形
 */
export class ConstellationLayout {
  private centerX: number;
  private centerY: number;
  private nodeSpacing: number;

  constructor(centerX: number, centerY: number, nodeSpacing: number = 40) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.nodeSpacing = nodeSpacing;
  }

  /**
   * 排列星座节点
   */
  layout(members: string[], positions: Map<string, NodePosition>): void {
    const n = members.length;
    if (n === 0) return;

    if (n === 1) {
      // 单节点放在中心
      positions.set(members[0], { x: this.centerX, y: this.centerY });
      return;
    }

    if (n <= 6) {
      // 小星座：圆形排列
      this.layoutCircle(members, positions);
    } else if (n <= 12) {
      // 中等星座：双环排列
      this.layoutDoubleRing(members, positions);
    } else {
      // 大星座：螺旋排列
      this.layoutSpiral(members, positions);
    }
  }

  /**
   * 圆形排列
   */
  private layoutCircle(members: string[], positions: Map<string, NodePosition>): void {
    const n = members.length;
    const radius = Math.max(this.nodeSpacing * n / Math.PI, this.nodeSpacing * 2);

    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      const x = this.centerX + radius * Math.cos(angle);
      const y = this.centerY + radius * Math.sin(angle);
      positions.set(members[i], { x, y });
    }
  }

  /**
   * 双环排列
   */
  private layoutDoubleRing(members: string[], positions: Map<string, NodePosition>): void {
    const n = members.length;
    const innerCount = Math.ceil(n / 2);
    const outerCount = n - innerCount;

    // 内环
    const innerRadius = this.nodeSpacing * 2;
    for (let i = 0; i < innerCount; i++) {
      const angle = (2 * Math.PI * i) / innerCount;
      const x = this.centerX + innerRadius * Math.cos(angle);
      const y = this.centerY + innerRadius * Math.sin(angle);
      positions.set(members[i], { x, y });
    }

    // 外环
    const outerRadius = this.nodeSpacing * 4;
    for (let i = 0; i < outerCount; i++) {
      const angle = (2 * Math.PI * i) / outerCount;
      const x = this.centerX + outerRadius * Math.cos(angle);
      const y = this.centerY + outerRadius * Math.sin(angle);
      positions.set(members[innerCount + i], { x, y });
    }
  }

  /**
   * 螺旋排列
   */
  private layoutSpiral(members: string[], positions: Map<string, NodePosition>): void {
    const n = members.length;

    for (let i = 0; i < n; i++) {
      const angle = i * 0.5; // 黄金角
      const radius = this.nodeSpacing * Math.sqrt(i);
      const x = this.centerX + radius * Math.cos(angle);
      const y = this.centerY + radius * Math.sin(angle);
      positions.set(members[i], { x, y });
    }
  }
}

/**
 * 星座可视化器
 * 生成星座的可视化数据
 */
export class ConstellationVisualizer {
  private constellations: ConstellationInfo[];
  private positions: Map<string, NodePosition>;

  constructor(constellations: ConstellationInfo[], positions: Map<string, NodePosition>) {
    this.constellations = constellations;
    this.positions = positions;
  }

  /**
   * 生成星座连线
   * 返回星座内部的连线（用于绘制星座轮廓）
   */
  generateConstellationLines(): Array<{
    source: string;
    target: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }> {
    const lines: Array<{
      source: string;
      target: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    for (const constellation of this.constellations) {
      const centerPos = this.positions.get(constellation.centerNode);
      if (!centerPos) continue;

      // 从中心节点到每个成员画一条线
      for (const memberId of constellation.members) {
        if (memberId === constellation.centerNode) continue;

        const memberPos = this.positions.get(memberId);
        if (memberPos) {
          lines.push({
            source: constellation.centerNode,
            target: memberId,
            x1: centerPos.x,
            y1: centerPos.y,
            x2: memberPos.x,
            y2: memberPos.y,
          });
        }
      }
    }

    return lines;
  }

  /**
   * 生成星座边界
   * 返回星座的凸包边界
   */
  generateConstellationBoundaries(): Array<{
    constellationId: string;
    points: Array<{ x: number; y: number }>;
  }> {
    const boundaries: Array<{
      constellationId: string;
      points: Array<{ x: number; y: number }>;
    }> = [];

    for (const constellation of this.constellations) {
      const points: Array<{ x: number; y: number }> = [];

      for (const memberId of constellation.members) {
        const pos = this.positions.get(memberId);
        if (pos) {
          points.push(pos);
        }
      }

      if (points.length >= 3) {
        // 计算凸包
        const hull = this.computeConvexHull(points);
        boundaries.push({
          constellationId: constellation.id,
          points: hull,
        });
      }
    }

    return boundaries;
  }

  /**
   * 计算凸包（Graham Scan算法）
   */
  private computeConvexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    if (points.length <= 2) return points;

    // 找到最低点
    let lowest = points[0];
    for (const p of points) {
      if (p.y > lowest.y || (p.y === lowest.y && p.x < lowest.x)) {
        lowest = p;
      }
    }

    // 按极角排序
    const sorted = points.filter(p => p !== lowest).sort((a, b) => {
      const angleA = Math.atan2(a.y - lowest.y, a.x - lowest.x);
      const angleB = Math.atan2(b.y - lowest.y, b.x - lowest.x);
      return angleA - angleB;
    });

    // Graham Scan
    const stack = [lowest, sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      while (stack.length >= 2) {
        const top = stack[stack.length - 1];
        const next = stack[stack.length - 2];
        const orientation = this.crossProduct(next, top, sorted[i]);

        if (orientation > 0) break;
        stack.pop();
      }
      stack.push(sorted[i]);
    }

    return stack;
  }

  /**
   * 叉积计算
   */
  private crossProduct(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ): number {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  }
}

export default ConstellationDetector;