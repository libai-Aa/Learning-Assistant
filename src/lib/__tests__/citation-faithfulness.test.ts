/**
 * Citation Faithfulness Skill测试
 * @module src/lib/__tests__/citation-faithfulness.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CitationFaithfulness, createCitationFaithfulness } from '../citation-faithfulness'
import { AminerConfig } from '../aminer-skill'

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

  describe('检查参数验证', () => {
    it('空论文ID应该抛出错误', async () => {
      await expect(skill.check({ paperId: '', citations: ['citation 1'] }))
        .rejects.toThrow('论文ID不能为空')
    })

    it('空引用列表应该抛出错误', async () => {
      await expect(skill.check({ paperId: 'paper-1', citations: [] }))
        .rejects.toThrow('引用列表不能为空')
    })
  })

  describe('检查引用忠实度', () => {
    it('应该返回验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isFaithful: true,
            confidence: 0.95,
            issues: [],
            suggestions: []
          }
        ],
        overallFaithfulnessScore: 0.95,
        took: 500,
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
      })

      const response = await skill.check({
        paperId: 'paper-1',
        citations: ['citation 1']
      })

      expect(response.verifications).toHaveLength(1)
      expect(response.overallFaithfulnessScore).toBe(0.95)
      expect(response.statistics.faithfulCount).toBe(1)
    })
  })

  describe('快速检查单条引用', () => {
    it('应该返回单个验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isFaithful: true,
            confidence: 0.9,
            issues: [],
            suggestions: []
          }
        ],
        overallFaithfulnessScore: 0.9,
        took: 200,
        statistics: {
          totalCitations: 1,
          faithfulCount: 1,
          unfaithfulCount: 0,
          averageConfidence: 0.9
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const result = await skill.checkSingleCitation('paper-1', 'citation 1')
      expect(result.isFaithful).toBe(true)
      expect(result.confidence).toBe(0.9)
    })
  })

  describe('批量检查引用', () => {
    it('应该返回多个验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isFaithful: true,
            confidence: 0.95
          },
          {
            citationId: '2',
            isFaithful: false,
            confidence: 0.6,
            issues: ['Misattribution']
          }
        ],
        overallFaithfulnessScore: 0.775,
        took: 400,
        statistics: {
          totalCitations: 2,
          faithfulCount: 1,
          unfaithfulCount: 1,
          averageConfidence: 0.775
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const results = await skill.checkMultipleCitations('paper-1', ['citation 1', 'citation 2'])
      expect(results).toHaveLength(2)
    })
  })

  describe('获取不忠实的引用', () => {
    it('应该只返回不忠实的引用', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isFaithful: true,
            confidence: 0.95
          },
          {
            citationId: '2',
            isFaithful: false,
            confidence: 0.6,
            issues: ['Misattribution']
          }
        ],
        overallFaithfulnessScore: 0.775,
        took: 400,
        statistics: {
          totalCitations: 2,
          faithfulCount: 1,
          unfaithfulCount: 1,
          averageConfidence: 0.775
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const unfaithful = await skill.getUnfaithfulCitations('paper-1', ['citation 1', 'citation 2'])
      expect(unfaithful).toHaveLength(1)
      expect(unfaithful[0].isFaithful).toBe(false)
    })
  })

  describe('工厂函数', () => {
    it('createCitationFaithfulness应该返回正确的实例', () => {
      const instance = createCitationFaithfulness(testConfig)
      expect(instance).toBeInstanceOf(CitationFaithfulness)
    })
  })
})