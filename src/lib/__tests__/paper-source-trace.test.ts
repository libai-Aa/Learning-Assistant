/**
 * Paper Source Trace Skill测试
 * @module src/lib/__tests__/paper-source-trace.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PaperSourceTrace, createPaperSourceTrace } from '../paper-source-trace'
import { AminerConfig } from '../aminer-skill'

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

  describe('溯源参数验证', () => {
    it('空论文ID应该抛出错误', async () => {
      await expect(skill.trace({ paperId: '' }))
        .rejects.toThrow('论文ID不能为空')
    })
  })

  describe('追溯论文来源', () => {
    it('应该返回溯源结果', async () => {
      const mockResponse = {
        sourceChain: ['paper-1', 'paper-2', 'paper-3'],
        traceTree: {
          paperId: 'paper-1',
          title: 'Root Paper',
          year: 2024,
          authors: ['Author 1'],
          relationType: 'cites',
          level: 0,
          children: [
            {
              paperId: 'paper-2',
              title: 'Child Paper',
              year: 2023,
              authors: ['Author 2'],
              relationType: 'cites',
              level: 1
            }
          ]
        },
        totalNodes: 2,
        earliestYear: 2023,
        latestYear: 2024,
        took: 300
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const response = await skill.trace({ paperId: 'paper-1' })
      expect(response.sourceChain).toHaveLength(3)
      expect(response.totalNodes).toBe(2)
      expect(response.earliestYear).toBe(2023)
    })
  })

  describe('追溯引用链', () => {
    it('应该返回引用链', async () => {
      const mockResponse = {
        sourceChain: ['paper-1', 'paper-2', 'paper-3'],
        traceTree: {
          paperId: 'paper-1',
          title: 'Root Paper',
          year: 2024,
          authors: ['Author 1'],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 3,
        earliestYear: 2020,
        latestYear: 2024,
        took: 400
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const chain = await skill.traceCitations('paper-1')
      expect(chain).toHaveLength(3)
    })
  })

  describe('追溯被引用链', () => {
    it('应该返回被引用链', async () => {
      const mockResponse = {
        sourceChain: ['paper-1', 'paper-2'],
        traceTree: {
          paperId: 'paper-1',
          title: 'Root Paper',
          year: 2024,
          authors: ['Author 1'],
          relationType: 'cited_by',
          level: 0
        },
        totalNodes: 2,
        earliestYear: 2024,
        latestYear: 2024,
        took: 200
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const chain = await skill.traceCitedBy('paper-1')
      expect(chain).toHaveLength(2)
    })
  })

  describe('获取源头论文', () => {
    it('应该返回源头论文ID', async () => {
      const mockResponse = {
        sourceChain: ['paper-1', 'paper-2', 'paper-3', 'paper-4', 'paper-5'],
        traceTree: {
          paperId: 'paper-1',
          title: 'Root Paper',
          year: 2024,
          authors: ['Author 1'],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 5,
        earliestYear: 2010,
        latestYear: 2024,
        took: 500
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const origin = await skill.getOriginPaper('paper-1')
      expect(origin).toBe('paper-5')
    })

    it('空链应该返回null', async () => {
      const mockResponse = {
        sourceChain: [],
        traceTree: {
          paperId: 'paper-1',
          title: 'Root Paper',
          year: 2024,
          authors: ['Author 1'],
          relationType: 'cites',
          level: 0
        },
        totalNodes: 0,
        earliestYear: 2024,
        latestYear: 2024,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const origin = await skill.getOriginPaper('paper-1')
      expect(origin).toBeNull()
    })
  })

  describe('工厂函数', () => {
    it('createPaperSourceTrace应该返回正确的实例', () => {
      const instance = createPaperSourceTrace(testConfig)
      expect(instance).toBeInstanceOf(PaperSourceTrace)
    })
  })
})