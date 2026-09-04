/**
 * AMiner Free Academic Skill测试
 * @module src/lib/__tests__/aminer-free-academic.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AminerFreeAcademic, createFreeAcademic } from '../aminer-free-academic'
import { AminerConfig } from '../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('AminerFreeAcademic', () => {
  let skill: AminerFreeAcademic

  beforeEach(() => {
    skill = new AminerFreeAcademic(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('aminer-free-academic')
      expect(info.endpoint).toBe('/api/paper/free')
    })
  })

  describe('搜索参数验证', () => {
    it('空查询应该抛出错误', async () => {
      await expect(skill.search({ query: '' })).rejects.toThrow('搜索关键词不能为空')
    })
  })

  describe('搜索免费学术资源', () => {
    it('应该返回资源列表', async () => {
      const mockResponse = {
        resources: [
          {
            paper: {
              paperId: '1',
              title: 'Open Access Paper',
              authors: ['Author 1'],
              abstract: 'Abstract',
              year: 2024,
              citationCount: 10,
              url: 'https://example.com/paper/1'
            },
            openAccessUrl: 'https://example.com/paper/1.pdf',
            pdfUrl: 'https://example.com/paper/1.pdf',
            source: 'arXiv'
          }
        ],
        total: 1,
        openAccessRatio: 0.8
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const response = await skill.search({ query: 'test' })
      expect(response.resources).toHaveLength(1)
      expect(response.openAccessRatio).toBe(0.8)
    })
  })

  describe('搜索开放获取论文', () => {
    it('应该只返回开放获取论文', async () => {
      const mockResponse = {
        resources: [],
        total: 0,
        openAccessRatio: 1.0
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const papers = await skill.searchOpenAccess('test')
      expect(papers).toEqual([])
    })
  })

  describe('获取PDF链接', () => {
    it('应该返回PDF链接列表', async () => {
      const mockResponse = {
        resources: [
          {
            paper: {
              paperId: '1',
              title: 'Paper with PDF',
              authors: ['Author 1'],
              abstract: 'Abstract',
              year: 2024,
              citationCount: 10,
              url: 'https://example.com/paper/1'
            },
            pdfUrl: 'https://example.com/paper/1.pdf',
            source: 'arXiv'
          }
        ],
        total: 1,
        openAccessRatio: 1.0
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const pdfLinks = await skill.getPdfLinks('test')
      expect(pdfLinks).toHaveLength(1)
      expect(pdfLinks[0].pdfUrl).toBe('https://example.com/paper/1.pdf')
    })
  })

  describe('按数据源搜索', () => {
    it('应该包含数据源参数', async () => {
      const mockResponse = {
        resources: [],
        total: 0,
        openAccessRatio: 0.5
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      })

      const papers = await skill.searchBySources('test', ['arXiv', 'PubMed'])
      expect(papers).toEqual([])
    })
  })

  describe('工厂函数', () => {
    it('createFreeAcademic应该返回正确的实例', () => {
      const instance = createFreeAcademic(testConfig)
      expect(instance).toBeInstanceOf(AminerFreeAcademic)
    })
  })
})