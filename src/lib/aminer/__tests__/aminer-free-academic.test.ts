/**
 * AMiner Free Academic Skill 测试
 * @module src/lib/aminer/__tests__/aminer-free-academic.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AminerFreeAcademic, createFreeAcademic } from '../aminer-free-academic'
import { AminerConfig } from '../../aminer-skill'

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
              citationCount: 5,
              url: 'https://example.com/paper/1'
            },
            openAccessUrl: 'https://oa.example.com/1',
            pdfUrl: 'https://oa.example.com/1.pdf',
            license: 'CC-BY',
            source: 'arxiv'
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
      }) as unknown as typeof fetch

      const response = await skill.search({ query: 'machine learning' })
      expect(response.resources).toHaveLength(1)
      expect(response.openAccessRatio).toBe(1.0)
    })
  })

  describe('学者筛选', () => {
    it('空查询应该抛出错误', async () => {
      await expect(skill.filterScholars('')).rejects.toThrow('搜索关键词不能为空')
    })

    it('应该返回学者列表', async () => {
      const mockResponse = {
        scholars: [
          {
            scholarId: 's1',
            name: 'Scholar One',
            affiliation: 'MIT',
            researchAreas: ['AI'],
            paperCount: 100,
            citationCount: 5000,
            hIndex: 30
          }
        ],
        total: 1
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const response = await skill.filterScholars('AI', { minHIndex: 20 })
      expect(response.scholars).toHaveLength(1)
      expect(response.scholars[0].name).toBe('Scholar One')
    })
  })

  describe('开放获取搜索', () => {
    it('应该返回开放获取资源', async () => {
      const mockResponse = {
        resources: [],
        total: 0,
        openAccessRatio: 0
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const resources = await skill.searchOpenAccess('AI')
      expect(resources).toEqual([])
    })
  })

  describe('获取PDF链接', () => {
    it('应该返回带PDF链接的资源', async () => {
      const mockResponse = {
        resources: [
          {
            paper: {
              paperId: '1',
              title: 'Paper',
              authors: ['A'],
              abstract: 'A',
              year: 2024,
              citationCount: 0,
              url: 'u'
            },
            pdfUrl: 'https://example.com/1.pdf',
            source: 'arxiv'
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
      }) as unknown as typeof fetch

      const links = await skill.getPdfLinks('AI')
      expect(links).toHaveLength(1)
      expect(links[0].pdfUrl).toBe('https://example.com/1.pdf')
    })
  })

  describe('按数据源搜索', () => {
    it('应该返回资源列表', async () => {
      const mockResponse = {
        resources: [],
        total: 0,
        openAccessRatio: 0
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const resources = await skill.searchBySources('AI', ['arxiv', 'pubmed'])
      expect(resources).toEqual([])
    })
  })

  describe('工厂函数', () => {
    it('createFreeAcademic应该返回正确的实例', () => {
      const instance = createFreeAcademic(testConfig)
      expect(instance).toBeInstanceOf(AminerFreeAcademic)
    })
  })
})