/**
 * 夜间知识库维护
 * @description 每晚自动更新维护研究型知识库
 * @module src/lib/maintenance/nightly-maintenance
 */

import type {
  MaintenanceConfig,
  MaintenanceReport,
  KnowledgeGrowthRecord
} from '../../types/research'
import { FalsificationEngine } from '../research/falsification-engine'

// ============ 维护配置 ============

/** 默认配置 */
const DEFAULT_CONFIG: MaintenanceConfig = {
  enabled: true,
  scheduleTime: '00:00',
  timezone: 'Asia/Shanghai',
  knowledgeScope: 'recent',
  maxCheckCount: 100
}

// ============ 维护任务接口 ============

/** 知识条目信息 */
interface KnowledgeEntry {
  id: string
  title: string
  content: string
  lastUpdated: string
  createdAt: string
}

/** 知识库服务接口 */
export interface KnowledgeService {
  /** 获取知识条目 */
  getKnowledgeEntry(id: string): Promise<KnowledgeEntry | null>
  
  /** 获取需要检查的知识条目列表 */
  getEntriesForMaintenance(config: MaintenanceConfig): Promise<KnowledgeEntry[]>
  
  /** 更新知识条目 */
  updateKnowledgeEntry(id: string, updates: Partial<KnowledgeEntry>): Promise<void>
  
  /** 添加生长记录 */
  addGrowthRecord(record: KnowledgeGrowthRecord): Promise<void>
}

// ============ 维护任务类 ============

/**
 * 夜间维护任务
 * 每晚自动检查知识更新，生成维护报告
 */
export class NightlyMaintenance {
  private config: MaintenanceConfig
  private falsificationEngine: FalsificationEngine
  private knowledgeService: KnowledgeService | null = null
  private timerId: NodeJS.Timeout | null = null
  private isRunning: boolean = false

  constructor(
    config?: Partial<MaintenanceConfig>,
    falsificationEngine?: FalsificationEngine
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.falsificationEngine = falsificationEngine || new FalsificationEngine()
  }

  /**
   * 设置知识库服务
   */
  setKnowledgeService(service: KnowledgeService): void {
    this.knowledgeService = service
  }

  /**
   * 启动定时任务
   */
  start(): void {
    this.stop()
    
    this.scheduleNextRun()
    console.log('[NightlyMaintenance] 夜间维护任务已启动')
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    console.log('[NightlyMaintenance] 夜间维护任务已停止')
  }

  /**
   * 执行维护任务
   */
  async execute(): Promise<MaintenanceReport> {
    if (this.isRunning) {
      console.warn('[NightlyMaintenance] 维护任务已在运行中')
      return this.createEmptyReport('任务已在运行中')
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      console.log('[NightlyMaintenance] 开始执行夜间维护...')

      const report = await this.runMaintenance()

      const duration = Date.now() - startTime
      report.duration = duration

      console.log(`[NightlyMaintenance] 维护完成，耗时 ${duration}ms`)
      console.log(`[NightlyMaintenance] 检查: ${report.checkedCount}, 更新: ${report.updatedCount}, 证伪: ${report.falsifiedCount}`)

      return report

    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[NightlyMaintenance] 维护失败，耗时 ${duration}ms`, error)
      
      return {
        id: this.generateId(),
        executedAt: new Date().toISOString(),
        checkedCount: 0,
        updatedCount: 0,
        falsifiedCount: 0,
        summaries: [],
        errors: [{
          knowledgeId: 'system',
          error: error instanceof Error ? error.message : String(error)
        }],
        duration
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 运行维护逻辑
   */
  private async runMaintenance(): Promise<MaintenanceReport> {
    const report: MaintenanceReport = {
      id: this.generateId(),
      executedAt: new Date().toISOString(),
      checkedCount: 0,
      updatedCount: 0,
      falsifiedCount: 0,
      summaries: [],
      errors: [],
      duration: 0
    }

    // 检查知识库服务
    if (!this.knowledgeService) {
      report.errors.push({
        knowledgeId: 'system',
        error: '知识库服务未配置'
      })
      return report
    }

    // 获取需要检查的知识条目
    const entries = await this.knowledgeService.getEntriesForMaintenance(this.config)
    report.checkedCount = entries.length

    // 限制检查数量
    const maxCount = this.config.maxCheckCount || 100
    const entriesToCheck = entries.slice(0, maxCount)

    // 对每个条目进行检查
    for (const entry of entriesToCheck) {
      try {
        const result = await this.checkEntry(entry)
        
        if (result.needsUpdate) {
          report.updatedCount++
          report.summaries.push({
            knowledgeId: entry.id,
            title: entry.title,
            updates: result.updates
          })
        }

        if (result.falsified) {
          report.falsifiedCount++
        }

      } catch (error) {
        report.errors.push({
          knowledgeId: entry.id,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return report
  }

  /**
   * 检查单个知识条目
   */
  private async checkEntry(entry: KnowledgeEntry): Promise<{
    needsUpdate: boolean
    updates: string[]
    falsified: boolean
  }> {
    const updates: string[] = []
    let needsUpdate = false
    let falsified = false

    // 1. 检查知识更新
    const updateResult = await this.falsificationEngine.checkUpdate(entry.id)
    
    if (updateResult.needsUpdate) {
      needsUpdate = true
      updates.push(...updateResult.reasons)
    }

    // 2. 执行证伪审查
    const falsificationResult = await this.falsificationEngine.performFalsification(entry.id)
    
    if (falsificationResult.result === 'falsified') {
      falsified = true
      updates.push('发现新证据与原有结论冲突')
    }

    // 3. 更新知识条目
    if (needsUpdate && this.knowledgeService) {
      await this.knowledgeService.updateKnowledgeEntry(entry.id, {
        lastUpdated: new Date().toISOString()
      })
    }

    return { needsUpdate, updates, falsified }
  }

  /**
   * 安排下一次执行
   */
  private scheduleNextRun(): void {
    const now = new Date()
    const nextRun = this.getNextRunTime(now)
    
    const delay = nextRun.getTime() - now.getTime()
    this.timerId = setTimeout(() => {
      this.execute().then(() => {
        // 执行完成后安排下一次
        this.scheduleNextRun()
      })
    }, Math.max(delay, 0))

    console.log(`[NightlyMaintenance] 下一次执行时间: ${nextRun.toLocaleString()}`)
  }

  /**
   * 获取下一次执行时间
   */
  private getNextRunTime(now: Date): Date {
    const [hours, minutes] = this.config.scheduleTime.split(':').map(Number)
    
    const nextRun = new Date(now)
    nextRun.setHours(hours, minutes, 0, 0)

    // 如果今天的时间已过，安排到明天
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    return nextRun
  }

  /**
   * 创建空报告
   */
  private createEmptyReport(error: string): MaintenanceReport {
    return {
      id: this.generateId(),
      executedAt: new Date().toISOString(),
      checkedCount: 0,
      updatedCount: 0,
      falsifiedCount: 0,
      summaries: [],
      errors: [{ knowledgeId: 'system', error }],
      duration: 0
    }
  }

  /**
   * 生成ID
   */
  private generateId(): string {
    return `maintenance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ============ 导出 ============

/** 默认实例 */
export let nightlyMaintenance: NightlyMaintenance | null = null

/**
 * 创建夜间维护任务实例
 */
export function createNightlyMaintenance(
  config?: Partial<MaintenanceConfig>
): NightlyMaintenance {
  const maintenance = new NightlyMaintenance(config)
  nightlyMaintenance = maintenance
  return maintenance
}

/**
 * 获取夜间维护任务实例
 */
export function getNightlyMaintenance(): NightlyMaintenance | null {
  return nightlyMaintenance
}