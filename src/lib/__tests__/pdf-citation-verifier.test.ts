/**
 * PDF Citation Verifier Skill测试
 * @module src/lib/__tests__/pdf-citation-verifier.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PdfCitationVerifier, createPdfCitationVerifier } from '../pdf-citation-verifier'
import { AminerConfig } from '../aminer-skill'

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

  describe('验证参数验证', () => {
    it('空PDF路径应该抛出错误', async () => {
      await expect(skill.verify({ pdfPath: '', citations: ['citation 1'] }))
        .rejects.toThrow('PDF路径不能为空')
    })

    it('空引用列表应该抛出错误', async () => {
      await expect(skill.verify({ pdfPath: '/path/to/paper.pdf', citations: [] }))
        .rejects.toThrow('引用列表不能为空')
    })
  })

  describe('验证PDF引用', () => {
    it('应该返回验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isVerified: true,
            confidence: 0.98,
            position: {
              page: 5,
              start: 100,
              end: 200
            },
            details: {
              formatCheck: { isValid: true },
              contentCheck: { isValid: true, similarity: 0.95 },
              contextCheck: { isValid: true }
            }
          }
        ],
        overallVerificationScore: 0.98,
        pdfMetadata: {
          title: 'Test Paper',
          authors: ['Author 1'],
          pageCount: 10,
          language: 'en'
        },
        took: 1000,
        statistics: {
          totalCitations: 1,
          verifiedCount: 1,
          unverifiedCount: 0,
          averageConfidence: 0.98
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const response = await skill.verify({
        pdfPath: '/path/to/paper.pdf',
        citations: ['citation 1']
      })

      expect(response.verifications).toHaveLength(1)
      expect(response.overallVerificationScore).toBe(0.98)
      expect(response.pdfMetadata?.title).toBe('Test Paper')
    })
  })

  describe('快速验证单条引用', () => {
    it('应该返回单个验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isVerified: true,
            confidence: 0.95
          }
        ],
        overallVerificationScore: 0.95,
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
      })

      const result = await skill.verifySingleCitation('/path/to/paper.pdf', 'citation 1')
      expect(result.isVerified).toBe(true)
      expect(result.confidence).toBe(0.95)
    })
  })

  describe('批量验证引用', () => {
    it('应该返回多个验证结果', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isVerified: true,
            confidence: 0.98
          },
          {
            citationId: '2',
            isVerified: false,
            confidence: 0.45,
            details: {
              contentCheck: {
                isValid: false,
                similarity: 0.3,
                issues: ['Content mismatch']
              }
            }
          }
        ],
        overallVerificationScore: 0.715,
        took: 1500,
        statistics: {
          totalCitations: 2,
          verifiedCount: 1,
          unverifiedCount: 1,
          averageConfidence: 0.715
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const results = await skill.verifyMultipleCitations('/path/to/paper.pdf', ['citation 1', 'citation 2'])
      expect(results).toHaveLength(2)
    })
  })

  describe('获取未通过验证的引用', () => {
    it('应该只返回未通过验证的引用', async () => {
      const mockResponse = {
        verifications: [
          {
            citationId: '1',
            isVerified: true,
            confidence: 0.98
          },
          {
            citationId: '2',
            isVerified: false,
            confidence: 0.45
          }
        ],
        overallVerificationScore: 0.715,
        took: 1500,
        statistics: {
          totalCitations: 2,
          verifiedCount: 1,
          unverifiedCount: 1,
          averageConfidence: 0.715
        }
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const unverified = await skill.getUnverifiedCitations('/path/to/paper.pdf', ['citation 1', 'citation 2'])
      expect(unverified).toHaveLength(1)
      expect(unverified[0].isVerified).toBe(false)
    })
  })

  describe('获取PDF元数据', () => {
    it('应该返回PDF元数据', async () => {
      const mockResponse = {
        verifications: [],
        overallVerificationScore: 0,
        pdfMetadata: {
          title: 'Test Paper',
          authors: ['Author 1', 'Author 2'],
          pageCount: 15,
          language: 'en'
        },
        took: 200,
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
      })

      const metadata = await skill.getPdfMetadata('/path/to/paper.pdf', ['dummy citation'])
      expect(metadata?.title).toBe('Test Paper')
      expect(metadata?.authors).toHaveLength(2)
      expect(metadata?.pageCount).toBe(15)
    })
  })

  describe('工厂函数', () => {
    it('createPdfCitationVerifier应该返回正确的实例', () => {
      const instance = createPdfCitationVerifier(testConfig)
      expect(instance).toBeInstanceOf(PdfCitationVerifier)
    })
  })
})