/**
 * PDF Citation Verifier Skill 测试
 * @module src/lib/aminer/__tests__/pdf-citation-verifier.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PdfCitationVerifier, createPdfCitationVerifier } from '../pdf-citation-verifier'
import { AminerConfig } from '../../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('PdfCitationVerifier', () => {
  let skill: PdfCitationVerifier

  beforeEach(() => {
    skill = new PdfCitationVerifier(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('pdf-citation-verifier')
      expect(info.endpoint).toBe('/api/verify/pdf')
    })
  })

  describe('参数验证', () => {
    it('空PDF路径应该抛出错误', async () => {
      await expect(skill.verify({ pdfPath: '', citations: ['c1'] }))
        .rejects.toThrow('PDF路径不能为空')
    })

    it('空引用列表应该抛出错误', async () => {
      await expect(skill.verify({ pdfPath: '/path/to.pdf', citations: [] }))
        .rejects.toThrow('引用列表不能为空')
    })
  })

  describe('验证PDF引用', () => {
    it('应该返回验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: 'c1',
            isVerified: true,
            exists: true,
            confidence: 0.95,
            position: { page: 1, start: 100, end: 200 }
          }
        ],
        overallVerificationScore: 0.95,
        pdfMetadata: {
          title: 'Test PDF',
          authors: ['Author 1'],
          pageCount: 10,
          language: 'en'
        },
        took: 500,
        statistics: {
          totalCitations: 1,
          verifiedCount: 1,
          unverifiedCount: 0,
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

      const response = await skill.verify({
        pdfPath: '/path/to.pdf',
        citations: ['some citation']
      })
      expect(response.verifications).toHaveLength(1)
      expect(response.overallVerificationScore).toBe(0.95)
      expect(response.pdfMetadata?.pageCount).toBe(10)
    })
  })

  describe('单条引用验证', () => {
    it('应该返回单条验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: 'c1',
            isVerified: false,
            exists: false,
            confidence: 0.2
          }
        ],
        overallVerificationScore: 0.2,
        took: 100,
        statistics: {
          totalCitations: 1,
          verifiedCount: 0,
          unverifiedCount: 1,
          averageConfidence: 0.2
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const result = await skill.verifySingleCitation('/path/to.pdf', 'citation')
      expect(result.isVerified).toBe(false)
      expect(result.exists).toBe(false)
    })
  })

  describe('批量验证', () => {
    it('应该返回多条验证结果', async () => {
      const mockResponse = {
        verifications: [
          { citationId: 'c1', isVerified: true, confidence: 0.9 },
          { citationId: 'c2', isVerified: false, confidence: 0.3 }
        ],
        overallVerificationScore: 0.6,
        took: 200,
        statistics: {
          totalCitations: 2,
          verifiedCount: 1,
          unverifiedCount: 1,
          averageConfidence: 0.6
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const results = await skill.verifyMultipleCitations('/path/to.pdf', ['c1', 'c2'])
      expect(results).toHaveLength(2)
    })
  })

  describe('获取未验证引用', () => {
    it('应该只返回未通过的引用', async () => {
      const mockResponse = {
        verifications: [
          { citationId: 'c1', isVerified: true, confidence: 0.9 },
          { citationId: 'c2', isVerified: false, confidence: 0.3 }
        ],
        overallVerificationScore: 0.6,
        took: 200,
        statistics: {
          totalCitations: 2,
          verifiedCount: 1,
          unverifiedCount: 1,
          averageConfidence: 0.6
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const unverified = await skill.getUnverifiedCitations('/path/to.pdf', ['c1', 'c2'])
      expect(unverified).toHaveLength(1)
      expect(unverified[0].citationId).toBe('c2')
    })
  })

  describe('获取不存在的引用', () => {
    it('应该只返回不存在的引用', async () => {
      const mockResponse = {
        verifications: [
          { citationId: 'c1', isVerified: true, exists: true, confidence: 0.9 },
          { citationId: 'c2', isVerified: false, exists: false, confidence: 0.2 }
        ],
        overallVerificationScore: 0.55,
        took: 200,
        statistics: {
          totalCitations: 2,
          verifiedCount: 1,
          unverifiedCount: 1,
          averageConfidence: 0.55
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const nonexistent = await skill.getNonExistentCitations('/path/to.pdf', ['c1', 'c2'])
      expect(nonexistent).toHaveLength(1)
      expect(nonexistent[0].citationId).toBe('c2')
    })
  })

  describe('计算验证分数', () => {
    it('应该返回0-1之间的分数', async () => {
      const mockResponse = {
        verifications: [],
        overallVerificationScore: 0.88,
        took: 100,
        statistics: {
          totalCitations: 0,
          verifiedCount: 0,
          unverifiedCount: 0,
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

      const score = await skill.calculateVerificationScore('/path/to.pdf', ['c1'])
      expect(score).toBe(0.88)
    })
  })

  describe('获取PDF元数据', () => {
    it('应该返回PDF元数据', async () => {
      const mockResponse = {
        verifications: [],
        overallVerificationScore: 0,
        pdfMetadata: {
          title: 'Research Paper',
          authors: ['Author A', 'Author B'],
          pageCount: 20,
          language: 'en'
        },
        took: 100,
        statistics: {
          totalCitations: 0,
          verifiedCount: 0,
          unverifiedCount: 0,
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

      const metadata = await skill.getPdfMetadata('/path/to.pdf')
      expect(metadata?.title).toBe('Research Paper')
      expect(metadata?.pageCount).toBe(20)
    })
  })

  describe('工厂函数', () => {
    it('createPdfCitationVerifier应该返回正确的实例', () => {
      const instance = createPdfCitationVerifier(testConfig)
      expect(instance).toBeInstanceOf(PdfCitationVerifier)
    })
  })
})