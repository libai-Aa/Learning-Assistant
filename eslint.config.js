import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importX from 'eslint-plugin-import-x';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/** 仅 TypeScript 文件启用类型检查规则，避免对 .js/.mjs 缺失类型信息报错 */
const tsFiles = ['**/*.{ts,tsx}'];

/**
 * ESLint 9 Flat Config
 * - 基础: js.configs.recommended
 * - TS: tseslint recommendedTypeChecked + stylisticTypeChecked（仅 ts/tsx）
 * - React: react-hooks + react-refresh
 * - 解析: projectService + tsconfigRootDir
 *   测试/mock 文件被 tsconfig.json exclude，由 tsconfig.eslint.json 纳 include 覆盖，
 *   projectService 自动发现，无需 allowDefaultProject（其禁止 `**` 通配）。
 */
export default tseslint.config(
  // 全局忽略
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src-tauri/**',
      'coverage/**',
      'docs/**',
      'data/**',
      'data_reproduce/**',
      'images_reproduce/**',
      'research-notes/**',
      '*.config.ts',
      '*.config.js',
      'vitest.setup.ts',
      'debug-test2.mjs',
      '_oam_pretty.json',
      // 工具/缓存目录（非业务代码）
      '.codeartsdoer/**',
      '.arts/**',
      '.codegraph/**',
      '.resultverify/**',
      '.ruff_cache/**',
    ],
  },

  // 基础推荐规则
  js.configs.recommended,

  // TypeScript 类型检查推荐规则（仅 ts/tsx，避免 .js/.mjs 缺失类型信息）
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),
  // TypeScript 风格规则（仅 ts/tsx）
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: tsFiles,
  })),

  // TypeScript 解析选项：projectService + tsconfigRootDir
  // tsconfig.eslint.json include 全部 src（含测试/mocks），无需 allowDefaultProject
  {
    files: tsFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 源码配置：浏览器全局 + 插件 + 全部规则
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
    },
    rules: {
      // React Hooks：规则与依赖强制
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // React Refresh：仅导出组件
      'react-refresh/only-export-components': 'warn',

      // 禁止显式 any
      '@typescript-eslint/no-explicit-any': 'error',

      // 未使用变量（忽略 _ 前缀）与一致的类型导入
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // 函数行数限制：超过 150 行告警（跳过注释与空行）
      'max-lines-per-function': [
        'warn',
        {
          max: 150,
          skipComments: true,
          skipBlankLines: true,
          IIFEs: true,
        },
      ],

      // import 排序：分组 + 组间空行 + 字母序；@/** 归为 internal
      'import-x/order': [
        'error',
        {
          'newlines-between': 'always',
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],

      // 允许自定义 logger，但对裸 console.* 发出警告
      'no-console': 'warn',
    },
  },

  // 测试文件：放宽 any 与函数行数，补充 vitest 全局
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        vitest: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  // 关闭与 Prettier 冲突的格式化规则
  prettierConfig,
);
