/**
 * 星空布局
 * 整合星空布局算法和星座算法，提供完整的星空图谱布局
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
import { StarfieldLayout } from './starry-sky';
import { ConstellationDetector, ConstellationLayout } from './constellation';

/**
 * 星空图谱布局器
 * 整合力导向布局、星座检测、星系聚类
 */
export class StarfieldGraphLayout {
  private config: StarfieldLayoutConfig;
  private starfield: StarfieldLayout;
  private nodes: ExtendedGraphNode[];
  private edges: ExtendedGraphEdge[];

  constructor(config: Partial<StarfieldLayoutConfig> = {}) {
    this.config = { ...DEFAULT_STARFIELD_CONFIG, ...config };
    this.starfield = new StarfieldLayout(this.config);
    this.nodes = [];
    this.edges = [];
  }

  /**
   * 计算完整布局
   */
  compute(
    nodes: ExtendedGraphNode[],
    edges: ExtendedGraphEdge[]
  ): LayoutResult {
    this.nodes = nodes;
    this.edges = edges;

    // 1. 初始化星空布局
    this.starfield.initialize(nodes, edges);

    // 2. 执行力导向布局
    const iterations = this.calculateIterations(nodes.length);
    this.starfield.compute(iterations);

    // 3. 检测星座
    const constellations = this.detectConstellations();

    // 4. 优化星座内部布局
    this.optimizeConstellationLayouts(constellations);

    // 5. 星系聚类
    const galaxies = this.clusterGalaxies(constellations);

    // 6. 更新节点的星座和星系信息
    this.updateNodeMetadata(constellations, galaxies);

    return {
      nodePositions: this.starfield.getNodePositions(),
      constellations,
      galaxies,
    };
  }

  /**
   * 计算迭代次数
   * 节点越多，迭代次数越多
   */
  private calculateIterations(nodeCount: number): number {
    if (nodeCount < 50) return 100;
    if (nodeCount < 100) return 150;
    if (nodeCount < 500) return 200;
    if (nodeCount < 1000) return 250;
    return 300;
  }

  /**
   * 检测星座
   */
  private detectConstellations(): ConstellationInfo[] {
    const detector = new ConstellationDetector(
      this.nodes,
      this.edges,
      this.starfield.getNodePositions()
    );
    return detector.detect();
  }

  /**
   * 优化星座内部布局
   */
  private optimizeConstellationLayouts(constellations: ConstellationInfo[]): void {
    const positions = this.starfield.getNodePositions();

    for (const constellation of constellations) {
      const centerPos = positions.get(constellation.centerNode);
      if (!centerPos) continue;

      const layout = new ConstellationLayout(
        centerPos.x,
        centerPos.y,
        this.config.nodeSpacing
      );

      layout.layout(constellation.members, positions);
    }
  }

  /**
   * 星系聚类
   */
  private clusterGalaxies(constellations: ConstellationInfo[]): GalaxyInfo[] {
    if (constellations.length === 0) return [];

    const positions = this.starfield.getNodePositions();
    const threshold = this.config.constellationSpacing;

    // 使用层次聚类
    const clusters: ConstellationInfo[][] = [[constellations[0]]];

    for (let i = 1; i < constellations.length; i++) {
      const constellation = constellations[i];
      const centerPos = positions.get(constellation.centerNode);
      if (!centerPos) continue;

      let bestCluster = -1;
      let bestDistance = threshold;

      for (let j = 0; j < clusters.length; j++) {
        const cluster = clusters[j];
        const clusterCenter = this.getClusterCenter(cluster, positions);
        const distance = Math.sqrt(
          Math.pow(centerPos.x - clusterCenter.x, 2) +
          Math.pow(centerPos.y - clusterCenter.y, 2)
        );

        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = j;
        }
      }

      if (bestCluster >= 0) {
        clusters[bestCluster].push(constellation);
      } else {
        clusters.push([constellation]);
      }
    }

    // 创建星系
    return clusters.map((cluster, index) =>
      this.createGalaxy(index, cluster, positions)
    );
  }

  /**
   * 获取星系中心
   */
  private getClusterCenter(
    constellations: ConstellationInfo[],
    positions: Map<string, NodePosition>
  ): { x: number; y: number } {
    let x = 0, y = 0;
    let count = 0;

    for (const constellation of constellations) {
      const centerPos = positions.get(constellation.centerNode);
      if (centerPos) {
        x += centerPos.x;
        y += centerPos.y;
        count++;
      }
    }

    if (count === 0) return { x: 0, y: 0 };
    return { x: x / count, y: y / count };
  }

  /**
   * 创建星系
   */
  private createGalaxy(
    index: number,
    constellations: ConstellationInfo[],
    positions: Map<string, NodePosition>
  ): GalaxyInfo {
    const center = this.getClusterCenter(constellations, positions);
    const radius = this.calculateGalaxyRadius(constellations, positions, center);

    return {
      id: `galaxy-${index}`,
      name: this.generateGalaxyName(index),
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
    positions: Map<string, NodePosition>,
    center: { x: number; y: number }
  ): number {
    let maxDistance = 0;

    for (const constellation of constellations) {
      const centerPos = positions.get(constellation.centerNode);
      if (!centerPos) continue;

      const distance = Math.sqrt(
        Math.pow(center.x - centerPos.x, 2) +
        Math.pow(center.y - centerPos.y, 2)
      );
      maxDistance = Math.max(maxDistance, distance + constellation.radius);
    }

    return maxDistance + this.config.constellationSpacing;
  }

  /**
   * 生成星系名称
   */
  private generateGalaxyName(index: number): string {
    const names = [
      '仙女座星系', '猎户座星系', '室女座星系', '银河系',
      '仙后座星系', '天鹅座星系', '天蝎座星系', '人马座星系',
    ];
    return names[index % names.length] || `星系 ${index + 1}`;
  }

  /**
   * 生成星系颜色
   */
  private generateGalaxyColor(index: number): string {
    const colors = [
      '#667EEA', '#764BA2', '#F093FB', '#F5576C',
      '#4FACFE', '#00F2FE', '#43E97B', '#38F9D7',
    ];
    return colors[index % colors.length];
  }

  /**
   * 更新节点元数据
   */
  private updateNodeMetadata(
    constellations: ConstellationInfo[],
    galaxies: GalaxyInfo[]
  ): void {
    // 更新星座ID
    for (const constellation of constellations) {
      for (const nodeId of constellation.members) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
          node.constellationId = constellation.id;
        }
      }
    }

    // 更新星系ID
    for (const galaxy of galaxies) {
      for (const constellation of galaxy.constellations) {
        for (const nodeId of constellation.members) {
          const node = this.nodes.find(n => n.id === nodeId);
          if (node) {
            node.galaxyId = galaxy.id;
          }
        }
      }
    }
  }

  /**
   * 更新单个节点位置（拖拽时使用）
   */
  updateNodePosition(nodeId: string, x: number, y: number): void {
    this.starfield.updateNodePosition(nodeId, x, y);
  }

  /**
   * 获取节点位置
   */
  getNodePosition(nodeId: string): NodePosition | undefined {
    return this.starfield.getNodePosition(nodeId);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.starfield.dispose();
    this.nodes = [];
    this.edges = [];
  }
}

/**
 * 动画布局器
 * 支持动画效果的布局
 */
export class AnimatedStarfieldLayout extends StarfieldGraphLayout {
  private animationId: number | null = null;
  private isAnimating: boolean = false;

  /**
   * 动画执行布局
   */
  animate(
    nodes: ExtendedGraphNode[],
    edges: ExtendedGraphEdge[],
    onFrame: (result: LayoutResult) => void,
    duration: number = 2000
  ): Promise<void> {
    return new Promise((resolve) => {
      this.nodes = nodes;
      this.edges = edges;

      // 初始化布局
      const starfield = new StarfieldLayout(this.config);
      starfield.initialize(nodes, edges);

      const startTime = Date.now();
      const totalIterations = this.calculateIterations(nodes.length);

      const animateFrame = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 执行一步布局
        starfield.compute(Math.ceil(totalIterations * progress / 10));

        // 获取中间结果
        const constellations = this.detectConstellationsFromStarfield(starfield);
        const galaxies = this.clusterGalaxiesFromStarfield(constellations, starfield);

        const result: LayoutResult = {
          nodePositions: starfield.getNodePositions(),
          constellations,
          galaxies,
        };

        onFrame(result);

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animateFrame);
        } else {
          this.isAnimating = false;
          this.animationId = null;
          resolve();
        }
      };

      this.isAnimating = true;
      this.animationId = requestAnimationFrame(animateFrame);
    });
  }

  /**
   * 停止动画
   */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
      this.isAnimating = false;
    }
  }

  /**
   * 是否正在动画
   */
  isRunning(): boolean {
    return this.isAnimating;
  }

  /**
   * 从Starfield检测器检测星座
   */
  private detectConstellationsFromStarfield(
    starfield: StarfieldLayout
  ): ConstellationInfo[] {
    // 简化版本，实际应该使用完整的检测逻辑
    return [];
  }

  /**
   * 从Starfield检测器星系聚类
   */
  private clusterGalaxiesFromStarfield(
    constellations: ConstellationInfo[],
    starfield: StarfieldLayout
  ): GalaxyInfo[] {
    // 简化版本，实际应该使用完整的聚类逻辑
    return [];
  }
}

export default StarfieldGraphLayout;