/**
 * Paper Source Trace Skill 测试
 * @module src/lib/aminer/__tests__/paper-source-trace.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PaperSourceTrace, createPaperSourceTrace } from '../paper-source-trace'
import { AminerConfig } from '../../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('PaperSourceTrace', () => {
  let skill: PaperSourceTrace

  beforeEach(() => {
    skill = new PaperSourceTrace(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('paper-source-trace')
      expect(info.endpoint).toBe('/api/paper/source')
    })
  })

  describe('参数验证', () => {
    it('空论文ID应该抛出错误', async () => {
      await expect(skill.trace({ paperId: '' })).rejects.toThrow('论文ID不能为空')
    })
  })

  describe('论文溯源', () => {
    it('应该返回溯源结果', async () => {
      const mockResponse = {
        sourceChain: ['p1', 'p2', 'p3'],
        traceTree: {
          paperId: 'p1',
          title: 'Paper 1',
          year: 2024,
          authors: ['A'],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 3,
        earliestYear: 2020,
        latestYear: 2024,
        took: 300,
        propagationPath: ['p1', 'p2', 'p3']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const response = await skill.trace({ paperId: 'p1', depth: 3 })
      expect(response.sourceChain).toHaveLength(3)
      expect(response.totalNodes).toBe(3)
      expect(response.propagationPath).toEqual(['p1', 'p2', 'p3'])
    })
  })

  describe('追溯引用链', () => {
    it('应该返回引用链', async () => {
      const mockResponse = {
        sourceChain: ['p1', 'p2'],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 2,
        earliestYear: 2020,
        latestYear: 2024,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const chain = await skill.traceCitations('p1', 3)
      expect(chain).toEqual(['p1', 'p2'])
    })
  })

  describe('追溯被引用链', () => {
    it('应该返回被引用链', async () => {
      const mockResponse = {
        sourceChain: ['p1', 'p3'],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cited_by',
          level: 0
        },
        totalNodes: 2,
        earliestYear: 2024,
        latestYear: 2025,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const chain = await skill.traceCitedBy('p1', 3)
      expect(chain).toEqual(['p1', 'p3'])
    })
  })

  describe('获取源头论文', () => {
    it('应该返回源头论文ID', async () => {
      const mockResponse = {
        sourceChain: ['p1', 'p2', 'p3'],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 3,
        earliestYear: 2020,
        latestYear: 2024,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const origin = await skill.getOriginPaper('p1')
      expect(origin).toBe('p3')
    })

    it('空链应该返回null', async () => {
      const mockResponse = {
        sourceChain: [],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 0,
        earliestYear: 0,
        latestYear: 0,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const origin = await skill.getOriginPaper('p1')
      expect(origin).toBeNull()
    })
  })

  describe('获取传播路径', () => {
    it('应该返回传播路径', async () => {
      const mockResponse = {
        sourceChain: [],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cited_by',
          level: 0
        },
        totalNodes: 0,
        earliestYear: 0,
        latestYear: 0,
        took: 100,
        propagationPath: ['p1', 'p2', 'p3']
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const path = await skill.getPropagationPath('p1', 5)
      expect(path).toEqual(['p1', 'p2', 'p3'])
    })
  })

  describe('获取影响范围', () => {
    it('应该返回影响统计', async () => {
      const mockResponse = {
        sourceChain: [],
        traceTree: {
          paperId: 'p1',
          title: '',
          year: 2024,
          authors: [],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 5,
        earliestYear: 2020,
        latestYear: 2026,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const scope = await skill.getImpactScope('p1')
      expect(scope.totalCitations).toBe(5)
      expect(scope.totalCitedBy).toBe(5)
    })
  })

  describe('工厂函数', () => {
    it('createPaperSourceTrace应该返回正确的实例', () => {
      const instance = createPaperSourceTrace(testConfig)
      expect(instance).toBeInstanceOf(PaperSourceTrace)
    })
  })
})