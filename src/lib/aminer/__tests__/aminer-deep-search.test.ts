/**
 * AMiner Deep Search Skill 测试
 * @module src/lib/aminer/__tests__/aminer-deep-search.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AminerDeepSearch, createDeepSearch } from '../aminer-deep-search'
import { AminerConfig } from '../../aminer-skill'

const testConfig: AminerConfig = {
  apiKey: 'test-api-key',
  baseUrl: 'https://test-api.aminer.cn'
}

describe('AminerDeepSearch', () => {
  let skill: AminerDeepSearch

  beforeEach(() => {
    skill = new AminerDeepSearch(testConfig)
  })

  describe('构造函数', () => {
    it('应该正确初始化Skill', () => {
      const info = skill.getSkillInfo()
      expect(info.name).toBe('aminer-deep-search')
      expect(info.endpoint).toBe('/api/search/deep')
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

  describe('深度搜索', () => {
    it('应该返回搜索结果树', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Root Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 10,
            url: 'https://example.com/paper/1'
          },
          level: 0
        },
        totalNodes: 1,
        took: 200,
        searchPath: ['query'],
        uniqueCount: 1
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const response = await skill.search({ query: 'machine learning', depth: 2 })
      expect(response.totalNodes).toBe(1)
      expect(response.searchPath).toEqual(['query'])
    })
  })

  describe('快速搜索', () => {
    it('应该返回论文列表', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Test Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 5,
            url: 'https://example.com/paper/1'
          },
          level: 0
        },
        totalNodes: 1,
        took: 100,
        searchPath: []
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.quickSearch('AI', 2)
      expect(papers).toHaveLength(1)
      expect(papers[0].title).toBe('Test Paper')
    })
  })

  describe('多轮搜索', () => {
    it('应该返回累积结果', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Test Paper',
            authors: ['Author 1'],
            abstract: 'Abstract',
            year: 2024,
            citationCount: 5,
            url: 'https://example.com/paper/1'
          },
          level: 0
        },
        totalNodes: 1,
        took: 300,
        searchPath: []
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const papers = await skill.multiRoundSearch('AI', 3, 2)
      expect(papers).toHaveLength(1)
    })
  })

  describe('获取引用网络', () => {
    it('应该返回节点和边', async () => {
      const mockResponse = {
        resultTree: {
          paper: {
            paperId: '1',
            title: 'Root',
            authors: ['A'],
            abstract: 'A',
            year: 2024,
            citationCount: 0,
            url: 'u'
          },
          level: 0,
          citations: [
            {
              paper: {
                paperId: '2',
                title: 'Citing',
                authors: ['B'],
                abstract: 'B',
                year: 2025,
                citationCount: 0,
                url: 'u2'
              },
              level: 1
            }
          ]
        },
        totalNodes: 2,
        took: 100,
        searchPath: []
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockResponse
        })
      }) as unknown as typeof fetch

      const network = await skill.getCitationNetwork('AI', 1)
      expect(network.nodes).toHaveLength(2)
      expect(network.edges).toHaveLength(1)
      expect(network.edges[0].type).toBe('citation')
    })
  })

  describe('工厂函数', () => {
    it('createDeepSearch应该返回正确的实例', () => {
      const instance = createDeepSearch(testConfig)
      expect(instance).toBeInstanceOf(AminerDeepSearch)
    })
  })
})