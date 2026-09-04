/**
 * 星空布局算法
 * 实现力导向布局 + 星空约束
 */

import type {
  ExtendedGraphNode,
  ExtendedGraphEdge,
  NodePosition,
  ConstellationInfo,
  GalaxyInfo,
  StarfieldLayoutConfig,
  LayoutResult,
} from '../../types/graph';
import { DEFAULT_STARFIELD_CONFIG } from '../../types/graph';

/**
 * 星空布局器
 * 结合力导向算法与星空约束，实现星座/星系布局
 */
export class StarfieldLayout {
  private config: StarfieldLayoutConfig;
  private nodes: Map<string, ExtendedGraphNode>;
  private edges: Map<string, ExtendedGraphEdge>;
  private positions: Map<string, NodePosition>;
  private velocities: Map<string, NodePosition>;

  constructor(config: Partial<StarfieldLayoutConfig> = {}) {
    this.config = { ...DEFAULT_STARFIELD_CONFIG, ...config };
    this.nodes = new Map();
    this.edges = new Map();
    this.positions = new Map();
    this.velocities = new Map();
  }

  /**
   * 初始化图谱数据
   */
  initialize(nodes: ExtendedGraphNode[], edges: ExtendedGraphEdge[]): void {
    this.nodes.clear();
    this.edges.clear();
    this.positions.clear();
    this.velocities.clear();

    // 存储节点
    for (const node of nodes) {
      this.nodes.set(node.id, node);
    }

    // 存储边
    for (const edge of edges) {
      this.edges.set(edge.id, edge);
    }

    // 初始化位置（随机分布）
    this.initializePositions();
  }

  /**
   * 初始化节点位置
   * 使用圆形分布作为初始布局
   */
  private initializePositions(): void {
    const nodeCount = this.nodes.size;
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;
    const radius = Math.min(this.config.width, this.config.height) * 0.3;

    let i = 0;
    for (const [id, node] of this.nodes) {
      // 如果节点已有位置，保持原位置
      if (node.x !== undefined && node.y !== undefined) {
        this.positions.set(id, { x: node.x, y: node.y });
        this.velocities.set(id, { x: 0, y: 0 });
        i++;
        continue;
      }

      // 使用圆形分布
      const angle = (2 * Math.PI * i) / nodeCount;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      this.positions.set(id, { x, y });
      this.velocities.set(id, { x: 0, y: 0 });
      i++;
    }
  }

  /**
   * 执行布局计算
   * @param iterations 迭代次数
   */
  compute(iterations: number = 100): LayoutResult {
    for (let i = 0; i < iterations; i++) {
      this.step();
    }

    return this.getLayoutResult();
  }

  /**
   * 单步迭代
   */
  private step(): void {
    const repulsion = this.config.repulsion;
    const gravity = this.config.gravity;
    const friction = this.config.friction;

    // 计算斥力（节点间）
    this.computeRepulsion(repulsion);

    // 计算引力（边连接的节点间）
    this.computeGravity();

    // 计算向心力
    this.computeCenterGravity(gravity);

    // 更新位置
    this.updatePositions(friction);
  }

  /**
   * 计算节点间斥力
   */
  private computeRepulsion(repulsion: number): void {
    const nodeIds = Array.from(this.nodes.keys());

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const idA = nodeIds[i];
        const idB = nodeIds[j];
        const posA = this.positions.get(idA)!;
        const posB = this.positions.get(idB)!;
        const velA = this.velocities.get(idA)!;
        const velB = this.velocities.get(idB)!;

        const dx = posB.x - posA.x;
        const dy = posB.y - posA.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // 避免重叠的最小距离
        const minDistance = this.config.nodeSpacing * 2;
        if (distance < minDistance) {
          const force = repulsion / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          velA.x -= fx;
          velA.y -= fy;
          velB.x += fx;
          velB.y += fy;
        }
      }
    }
  }

  /**
   * 计算边的引力
   */
  private computeGravity(): void {
    for (const edge of this.edges.values()) {
      const posA = this.positions.get(edge.source);
      const posB = this.positions.get(edge.target);
      if (!posA || !posB) continue;

      const velA = this.velocities.get(edge.source)!;
      const velB = this.velocities.get(edge.target)!;

      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      // 理想距离（边的长度）
      const idealDistance = this.config.nodeSpacing * 3;
      const force = (distance - idealDistance) * 0.01;

      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      velA.x += fx;
      velA.y += fy;
      velB.x -= fx;
      velB.y -= fy;
    }
  }

  /**
   * 计算向心力
   */
  private computeCenterGravity(gravity: number): void {
    const centerX = this.config.width / 2;
    const centerY = this.config.height / 2;

    for (const [id, node] of this.nodes) {
      const pos = this.positions.get(id)!;
      const vel = this.velocities.get(id)!;

      const dx = centerX - pos.x;
      const dy = centerY - pos.y;

      vel.x += dx * gravity;
      vel.y += dy * gravity;
    }
  }

  /**
   * 更新节点位置
   */
  private updatePositions(friction: number): void {
    for (const [id, pos] of this.positions) {
      const vel = this.velocities.get(id)!;

      // 应用摩擦
      vel.x *= friction;
      vel.y *= friction;

      // 更新位置
      pos.x += vel.x;
      pos.y += vel.y;

      // 边界约束
      this.constrainToBounds(pos);
    }
  }

  /**
   * 边界约束
   */
  private constrainToBounds(pos: NodePosition): void {
    const margin = 50;
    pos.x = Math.max(margin, Math.min(this.config.width - margin, pos.x));
    pos.y = Math.max(margin, Math.min(this.config.height - margin, pos.y));
  }

  /**
   * 获取布局结果
   */
  private getLayoutResult(): LayoutResult {
    const constellations = this.detectConstellations();
    const galaxies = this.clusterGalaxies(constellations);

    return {
      nodePositions: new Map(this.positions),
      constellations,
      galaxies,
    };
  }

  /**
   * 检测星座
   * 基于社区检测算法划分星座
   */
  private detectConstellations(): ConstellationInfo[] {
    // 使用Louvain算法检测社区
    const communities = this.louvainCommunityDetection();

    const constellations: ConstellationInfo[] = [];
    const constellationColors = this.generateConstellationColors();

    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      if (community.length < 2) continue; // 忽略单节点社区

      const constellation = this.createConstellation(
        i,
        community,
        constellationColors[i % constellationColors.length]
      );
      constellations.push(constellation);
    }

    return constellations;
  }

  /**
   * Louvain社区检测算法
   */
  private louvainCommunityDetection(): string[][] {
    const nodeIds = Array.from(this.nodes.keys());
    const communities: Map<number, Set<string>> = new Map();

    // 初始化：每个节点一个社区
    let communityId = 0;
    for (const id of nodeIds) {
      communities.set(communityId, new Set([id]));
      communityId++;
    }

    // 构建邻接表
    const adjacency = this.buildAdjacency();

    // 迭代优化
    let changed = true;
    let iterations = 0;
    const maxIterations = 10;

    while (changed && iterations < maxIterations) {
      changed = false;

      for (const nodeId of nodeIds) {
        const currentCommunity = this.findCommunity(nodeId, communities);
        const neighborCommunities = this.getNeighborCommunities(nodeId, adjacency, communities);

        // 找到模块度增益最大的社区
        let bestCommunity = currentCommunity;
        let maxGain = 0;

        for (const commId of neighborCommunities) {
          const gain = this.calculateModularityGain(nodeId, commId, communities, adjacency);
          if (gain > maxGain) {
            maxGain = gain;
            bestCommunity = commId;
          }
        }

        if (bestCommunity !== currentCommunity) {
          this.moveNode(nodeId, currentCommunity, bestCommunity, communities);
          changed = true;
        }
      }

      iterations++;
    }

    // 转换为数组格式
    return Array.from(communities.values())
      .map(community => Array.from(community))
      .filter(community => community.length > 0);
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
      const neighbors = adjacency.get(edge.source);
      if (neighbors) {
        neighbors.add(edge.target);
      }

      const neighbors2 = adjacency.get(edge.target);
      if (neighbors2) {
        neighbors2.add(edge.source);
      }
    }

    return adjacency;
  }

  /**
   * 查找节点所属社区
   */
  private findCommunity(nodeId: string, communities: Map<number, Set<string>>): number {
    for (const [id, community] of communities) {
      if (community.has(nodeId)) {
        return id;
      }
    }
    return -1;
  }

  /**
   * 获取邻居社区
   */
  private getNeighborCommunities(
    nodeId: string,
    adjacency: Map<string, Set<string>>,
    communities: Map<number, Set<string>>
  ): number[] {
    const neighbors = adjacency.get(nodeId) || new Set();
    const neighborCommunities = new Set<number>();

    for (const neighbor of neighbors) {
      const commId = this.findCommunity(neighbor, communities);
      if (commId >= 0) {
        neighborCommunities.add(commId);
      }
    }

    return Array.from(neighborCommunities);
  }

  /**
   * 计算模块度增益
   */
  private calculateModularityGain(
    nodeId: string,
    targetCommunity: number,
    communities: Map<number, Set<string>>,
    adjacency: Map<string, Set<string>>
  ): number {
    const totalEdges = this.edges.size;
    const targetSet = communities.get(targetCommunity) || new Set();

    // 简化计算：统计与目标社区的连接数
    const neighbors = adjacency.get(nodeId) || new Set();
    let connections = 0;

    for (const neighbor of neighbors) {
      if (targetSet.has(neighbor)) {
        connections++;
      }
    }

    // 模块度增益公式
    const k_i = neighbors.size;
    const sum_tot = this.getCommunityDegree(targetSet, adjacency);
    const gain = connections - (k_i * sum_tot) / (2 * totalEdges);

    return gain;
  }

  /**
   * 获取社区总度数
   */
  private getCommunityDegree(community: Set<string>, adjacency: Map<string, Set<string>>): number {
    let degree = 0;
    for (const nodeId of community) {
      degree += (adjacency.get(nodeId) || new Set()).size;
    }
    return degree;
  }

  /**
   * 移动节点到新社区
   */
  private moveNode(
    nodeId: string,
    fromCommunity: number,
    toCommunity: number,
    communities: Map<number, Set<string>>
  ): void {
    const fromSet = communities.get(fromCommunity);
    const toSet = communities.get(toCommunity);

    if (fromSet) {
      fromSet.delete(nodeId);
      // 如果原社区为空，删除
      if (fromSet.size === 0) {
        communities.delete(fromCommunity);
      }
    }

    if (toSet) {
      toSet.add(nodeId);
    }
  }

  /**
   * 创建星座
   */
  private createConstellation(
    index: number,
    members: string[],
    color: string
  ): ConstellationInfo {
    // 找到中心节点（度最高的节点）
    const centerNode = this.findCenterNode(members);

    // 计算星座半径
    const radius = this.calculateConstellationRadius(members);

    // 生成星座名称
    const name = this.generateConstellationName(index);

    // 生成主题标签
    const theme = this.generateConstellationTheme(members);

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
    let maxDegree = -1;
    let centerNode = members[0];

    for (const nodeId of members) {
      const degree = this.getNodeDegree(nodeId);
      if (degree > maxDegree) {
        maxDegree = degree;
        centerNode = nodeId;
      }
    }

    return centerNode;
  }

  /**
   * 获取节点度数
   */
  private getNodeDegree(nodeId: string): number {
    let degree = 0;
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        degree++;
      }
    }
    return degree;
  }

  /**
   * 计算星座半径
   */
  private calculateConstellationRadius(members: string[]): number {
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
    return Math.max(width, height) / 2 + this.config.nodeSpacing;
  }

  /**
   * 生成星座名称
   */
  private generateConstellationName(index: number): string {
    const names = [
      '天狼座', '北极座', '仙女座', '猎户座', '天蝎座',
      '射手座', '摩羯座', '水瓶座', '双鱼座', '白羊座',
      '金牛座', '双子座', '巨蟹座', '狮子座', '室女座',
      '天秤座', '天鹰座', '天鹅座', '凤凰座', '天龙座',
    ];
    return names[index % names.length] || `星座-${index + 1}`;
  }

  /**
   * 生成星座主题
   */
  private generateConstellationTheme(members: string[]): string {
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
  private generateConstellationColors(): string[] {
    return [
      '#FF6B6B', // 珊瑚红
      '#4ECDC4', // 薄荷绿
      '#45B7D1', // 天蓝
      '#96CEB4', // 鼠尾草绿
      '#FFEAA7', // 奶油黄
      '#DDA0DD', // 淡紫
      '#98D8C8', // 翡翠绿
      '#F7DC6F', // 金黄
      '#BB8FCE', // 淡紫
      '#85C1E9', // 天蓝
    ];
  }

  /**
   * 星系聚类
   * 将相近的星座聚合成星系
   */
  private clusterGalaxies(constellations: ConstellationInfo[]): GalaxyInfo[] {
    if (constellations.length === 0) return [];

    // 简单的距离聚类算法
    const clusters: ConstellationInfo[][] = [];
    const threshold = this.config.constellationSpacing;

    for (const constellation of constellations) {
      let foundCluster = false;

      for (const cluster of clusters) {
        const center = this.getClusterCenter(cluster);
        const constellationCenter = this.getConstellationCenter(constellation);

        const distance = Math.sqrt(
          Math.pow(center.x - constellationCenter.x, 2) +
          Math.pow(center.y - constellationCenter.y, 2)
        );

        if (distance < threshold) {
          cluster.push(constellation);
          foundCluster = true;
          break;
        }
      }

      if (!foundCluster) {
        clusters.push([constellation]);
      }
    }

    // 创建星系
    return clusters.map((cluster, index) => this.createGalaxy(index, cluster));
  }

  /**
   * 获取星座中心点
   */
  private getConstellationCenter(constellation: ConstellationInfo): { x: number; y: number } {
    const centerNode = this.positions.get(constellation.centerNode);
    return centerNode || { x: 0, y: 0 };
  }

  /**
   * 获取星系中心
   */
  private getClusterCenter(constellations: ConstellationInfo[]): { x: number; y: number } {
    let x = 0, y = 0;

    for (const constellation of constellations) {
      const center = this.getConstellationCenter(constellation);
      x += center.x;
      y += center.y;
    }

    return {
      x: x / constellations.length,
      y: y / constellations.length,
    };
  }

  /**
   * 创建星系
   */
  private createGalaxy(index: number, constellations: ConstellationInfo[]): GalaxyInfo {
    const center = this.getClusterCenter(constellations);
    const radius = this.calculateGalaxyRadius(constellations, center);

    return {
      id: `galaxy-${index}`,
      name: `星系 ${index + 1}`,
      constellations,
      center,
      radius,
      color: this.generateGalaxyColor(index),
    };
  }

  /**
   * 计算星系半径
   */
  private calculateGalaxyRadius(
    constellations: ConstellationInfo[],
    center: { x: number; y: number }
  ): number {
    let maxDistance = 0;

    for (const constellation of constellations) {
      const constellationCenter = this.getConstellationCenter(constellation);
      const distance = Math.sqrt(
        Math.pow(center.x - constellationCenter.x, 2) +
        Math.pow(center.y - constellationCenter.y, 2)
      );
      maxDistance = Math.max(maxDistance, distance + constellation.radius);
    }

    return maxDistance + this.config.constellationSpacing;
  }

  /**
   * 生成星系颜色
   */
  private generateGalaxyColor(index: number): string {
    const colors = [
      '#667EEA', // 靛蓝
      '#764BA2', // 紫罗兰
      '#F093FB', // 粉紫
      '#F5576C', // 珊瑚粉
      '#4FACFE', // 天蓝
      '#00F2FE', // 青色
      '#43E97B', // 翠绿
      '#38F9D7', // 薄荷
      '#FA709A', // 玫红
      '#FEE140', // 金黄
    ];
    return colors[index % colors.length];
  }

  /**
   * 更新单个节点位置（拖拽时使用）
   */
  updateNodePosition(nodeId: string, x: number, y: number): void {
    const pos = this.positions.get(nodeId);
    if (pos) {
      pos.x = x;
      pos.y = y;
      this.velocities.set(nodeId, { x: 0, y: 0 });
    }
  }

  /**
   * 获取节点位置
   */
  getNodePosition(nodeId: string): NodePosition | undefined {
    return this.positions.get(nodeId);
  }

  /**
   * 获取所有节点位置
   * 返回节点ID到位置的映射（副本），避免外部修改内部状态
   */
  getNodePositions(): Map<string, NodePosition> {
    return new Map(this.positions);
  }

  /**
   * 获取所有星座
   */
  getConstellations(): ConstellationInfo[] {
    return this.detectConstellations();
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.nodes.clear();
    this.edges.clear();
    this.positions.clear();
    this.velocities.clear();
  }
}

export default StarfieldLayout;