/**
 * Citation Faithfulness Skill 测试
 * @module src/lib/aminer/__tests__/citation-faithfulness.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CitationFaithfulness, createCitationFaithfulness } from '../citation-faithfulness'
import { AminerConfig } from '../../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('CitationFaithfulness', () => {
  let skill: CitationFaithfulness

  beforeEach(() => {
    skill = new CitationFaithfulness(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('citation-faithfulness')
      expect(info.endpoint).toBe('/api/verify/citation')
    })
  })

  describe('参数验证', () => {
    it('空论文ID应该抛出错误', async () => {
      await expect(skill.check({ paperId: '', citations: ['c1'] }))
        .rejects.toThrow('论文ID不能为空')
    })

    it('空引用列表应该抛出错误', async () => {
      await expect(skill.check({ paperId: 'p1', citations: [] }))
        .rejects.toThrow('引用列表不能为空')
    })
  })

  describe('检查引用忠实度', () => {
    it('应该返回验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: 'c1',
            isFaithful: true,
            confidence: 0.95,
            issueType: 'none'
          }
        ],
        overallFaithfulnessScore: 0.95,
        took: 200,
        statistics: {
          totalCitations: 1,
          faithfulCount: 1,
          unfaithfulCount: 0,
          averageConfidence: 0.95
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const response = await skill.check({
        paperId: 'p1',
        citations: ['some citation text']
      })
      expect(response.verifications).toHaveLength(1)
      expect(response.overallFaithfulnessScore).toBe(0.95)
    })
  })

  describe('单条引用检查', () => {
    it('应该返回单条验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: 'c1',
            isFaithful: false,
            confidence: 0.3,
            issueType: 'misattribution',
            issues: ['引用归属错误']
          }
        ],
        overallFaithfulnessScore: 0.3,
        took: 100,
        statistics: {
          totalCitations: 1,
          faithfulCount: 0,
          unfaithfulCount: 1,
          averageConfidence: 0.3
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const result = await skill.checkSingleCitation('p1', 'citation text')
      expect(result.isFaithful).toBe(false)
      expect(result.issueType).toBe('misattribution')
    })
  })

  describe('批量检查', () => {
    it('应该返回多条验证结果', async () => {
      const mockResponse = {
        verifications: [
          { citationId: 'c1', isFaithful: true, confidence: 0.9 },
          { citationId: 'c2', isFaithful: false, confidence: 0.4 }
        ],
        overallFaithfulnessScore: 0.65,
        took: 200,
        statistics: {
          totalCitations: 2,
          faithfulCount: 1,
          unfaithfulCount: 1,
          averageConfidence: 0.65
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const results = await skill.checkMultipleCitations('p1', ['c1', 'c2'])
      expect(results).toHaveLength(2)
    })
  })

  describe('获取不忠实引用', () => {
    it('应该只返回不忠实的引用', async () => {
      const mockResponse = {
        verifications: [
          { citationId: 'c1', isFaithful: true, confidence: 0.9 },
          { citationId: 'c2', isFaithful: false, confidence: 0.4 }
        ],
        overallFaithfulnessScore: 0.65,
        took: 200,
        statistics: {
          totalCitations: 2,
          faithfulCount: 1,
          unfaithfulCount: 1,
          averageConfidence: 0.65
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const unfaithful = await skill.getUnfaithfulCitations('p1', ['c1', 'c2'])
      expect(unfaithful).toHaveLength(1)
      expect(unfaithful[0].citationId).toBe('c2')
    })
  })

  describe('计算忠实度分数', () => {
    it('应该返回0-1之间的分数', async () => {
      const mockResponse = {
        verifications: [],
        overallFaithfulnessScore: 0.85,
        took: 100,
        statistics: {
          totalCitations: 0,
          faithfulCount: 0,
          unfaithfulCount: 0,
          averageConfidence: 0
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const score = await skill.calculateFaithfulnessScore('p1', ['c1'])
      expect(score).toBe(0.85)
    })
  })

  describe('工厂函数', () => {
    it('createCitationFaithfulness应该返回正确的实例', () => {
      const instance = createCitationFaithfulness(testConfig)
      expect(instance).toBeInstanceOf(CitationFaithfulness)
    })
  })
})