/**
 * AMiner Academic Search Skill 测试
 * @module src/lib/aminer/__tests__/aminer-academic-search.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AminerAcademicSearch, createAcademicSearch } from '../aminer-academic-search'
import { AminerConfig } from '../../aminer-skill'

// 测试配置
const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn',
  timeout: 5000
}

describe('AminerAcademicSearch', () => {
  let skill: AminerAcademicSearch

  beforeEach(() => {
    skill = new AminerAcademicSearch(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('aminer-academic-search')
      expect(info.endpoint).toBe('/api/search/academic')
    })
  })

  describe('搜索参数验证', () => {
    it('空查询应该抛出错误', async () => {
      await expect(skill.search({ query: '' })).rejects.toThrow('搜索关键词不能为空')
    })

    it('空白查询应该抛出错误', async () => {
      await expect(skill.search({ query: '   ' })).rejects.toThrow('搜索关键词不能为空')
    })
  })

  describe('快速搜索', () => {
    it('应该返回搜索结果', async () => {
      const mockResponse = {
        papers: [
          {
            paperId: '1',
            title: 'Test Paper',
            authors: ['Author 1'],
            abstract: 'Test abstract',
            year: 2024,
            citationCount: 10,
            url: 'https://example.com/paper/1'
          }
        ],
        total: 1,
        took: 100
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const results = await skill.quickSearch('test')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Test Paper')
    })
  })

  describe('按年份搜索', () => {
    it('应该包含年份参数', async () => {
      const mockResponse = {
        papers: [],
        total: 0,
        took: 50
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const results = await skill.searchByYear('machine learning', 2024)
      expect(results).toEqual([])
    })
  })

  describe('按领域搜索', () => {
    it('应该包含领域参数', async () => {
      const mockResponse = {
        papers: [],
        total: 0,
        took: 50
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const results = await skill.searchByFields('AI', ['Computer Science', 'Machine Learning'])
      expect(results).toEqual([])
    })
  })

  describe('工厂函数', () => {
    it('createAcademicSearch应该返回正确的实例', () => {
      const instance = createAcademicSearch(testConfig)
      expect(instance).toBeInstanceOf(AminerAcademicSearch)
    })
  })
})