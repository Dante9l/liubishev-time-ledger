# 柳比歇夫时间账本插件 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个可在 Obsidian 中运行的柳比歇夫时间账本插件，支持手动快录、统计、Markdown 导出与 AI 周/月复盘。

**Architecture:** 基于官方 sample plugin 脚手架搭建 TypeScript 插件。核心逻辑拆分为记录存储、时间解析、统计、Markdown 导出和 AI 服务，UI 通过 Modal、ItemView、SettingTab 组织。

**Tech Stack:** TypeScript、Obsidian Plugin API、esbuild、Node.js、少量原生测试

---

### Task 1: 工程脚手架与运行时骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `src/main.ts`
- Create: `src/settings.ts`
- Create: `styles.css`
- Create: `.gitignore`

**Step 1:** 基于官方 sample plugin 建立最小工程结构。  
**Step 2:** 添加插件 manifest、构建脚本、基础设置页和入口类。  
**Step 3:** 运行 `npm install`。  
**Step 4:** 运行 `npm run build`，确认能产出 `main.js`。

### Task 2: 数据模型、存储与时间解析

**Files:**
- Create: `src/types.ts`
- Create: `src/store.ts`
- Create: `src/time.ts`
- Modify: `src/main.ts`
- Test: `tests/time.test.mjs`

**Step 1:** 定义 `TimeEntry`、`Category`、`PluginSettings` 类型。  
**Step 2:** 实现数据加载、保存、增删改查。  
**Step 3:** 实现时间输入解析、时长换算、重叠/跨天辅助规则。  
**Step 4:** 用可执行测试覆盖关键解析案例。

### Task 3: 快速补录弹窗与今日记录视图

**Files:**
- Create: `src/ui/entry-modal.ts`
- Create: `src/ui/today-view.ts`
- Modify: `src/main.ts`
- Modify: `styles.css`

**Step 1:** 实现快速补录弹窗。  
**Step 2:** 接入新增、编辑、删除记录。  
**Step 3:** 实现今日记录视图与基础空档展示。  
**Step 4:** 注册命令与侧边栏入口。

### Task 4: 统计与 Markdown 导出

**Files:**
- Create: `src/stats.ts`
- Create: `src/markdown.ts`
- Create: `src/ui/stats-view.ts`
- Modify: `src/main.ts`
- Test: `tests/stats.test.mjs`

**Step 1:** 实现今日/周/月统计聚合。  
**Step 2:** 实现统计报告与原始流水 Markdown 导出。  
**Step 3:** 实现统计视图、导出按钮与插入当前笔记能力。  
**Step 4:** 用测试验证统计与导出结果。

### Task 5: AI 周/月复盘与设置完善

**Files:**
- Create: `src/ai.ts`
- Modify: `src/settings.ts`
- Modify: `src/ui/stats-view.ts`
- Modify: `src/types.ts`

**Step 1:** 定义 AI Provider 配置与 prompt 组装。  
**Step 2:** 实现周/月复盘请求、错误处理与结果预览。  
**Step 3:** 在设置页提供 API Base URL、API Key、Model、隐私开关。  
**Step 4:** 保证无 AI 配置时功能可降级。

### Task 6: 收尾验证

**Files:**
- Modify: `tests/time.test.mjs`
- Modify: `tests/stats.test.mjs`

**Step 1:** 运行解析与统计测试。  
**Step 2:** 运行 `npm run build`。  
**Step 3:** 手动检查导出文本与 AI prompt 输入是否符合需求。  
**Step 4:** 整理交付说明和未完成项。
