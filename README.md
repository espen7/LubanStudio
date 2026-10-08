# Luban Studio

面向 [Luban](https://github.com/focus-creative-games/luban) 游戏数据配置的桌面 IDE。不替代 Luban，而是把 `luban.conf`、Schema 定义（XML / `__tables__.xlsx` 等）和 Excel 数据表整合成一个可视化的配置编辑环境，让策划和程序在一个界面里浏览表结构、编辑表格数据、校验并导出。

## 功能特性

- **项目管理**：打开 Luban 项目（选中目录或 `luban.conf` 文件均可，自动定位 conf），解析项目配置、发现 dotnet 与 `Luban.dll` 运行时，支持最近项目恢复
- **Schema 浏览**：双通道解析——自研解析器（XML + Excel 定义，主路径，不依赖运行时）+ Luban v5 的 schema-json 增强通道；左侧项目树展示表 / bean / enum，右侧 Schema 面板展示字段结构、ref 与注释
- **表格编辑**：基于 Glide Data Grid 的 Excel 数据表编辑器，支持类型化单元格编辑；workbook 常驻主进程，单格即时写回，保存时只改动目标单元格（样式、公式、其余 sheet 保真），首存自动生成 `.luban-bak` 备份

## 技术栈

| 层     | 技术                                                        |
|--------|-------------------------------------------------------------|
| 框架   | Electron + electron-vite 5 + TypeScript                     |
| 渲染层 | React 18 + zustand 5 + Tailwind CSS 4 + Glide Data Grid 6   |
| 主进程 | exceljs 4.4.0（Excel 读写）+ fast-xml-parser（Schema 解析） |
| 工程   | pnpm + Vitest + electron-builder                            |

版本目标：**Luban v4 为主**（无 v5 新特性依赖），v5+ 自动启用增强通道。

## 快速开始

环境要求：Node.js ≥ 20、pnpm；可选 .NET SDK 8+（用于 Luban CLI 校验/导出，缺失时编辑与前端校验不受影响）。Windows 优先。

```bash
pnpm install
pnpm dev          # 启动开发环境
pnpm typecheck    # 类型检查
pnpm test         # 单元测试
pnpm build:win    # 打包 Windows 安装包
```

## 项目结构

```text
LubanStudio/
├── docs/                      # 设计文档 / 调研事实 / 实证样本
├── src/
│   ├── shared/                # 纯类型 + 纯函数，三进程共享（IPC 契约、Schema 抽象、Problem 模型）
│   ├── main/                  # 主进程
│   │   ├── project/           # conf 解析 / 项目发现
│   │   ├── schema/            # Schema 双通道解析
│   │   ├── data/excel/        # Excel 读写层
│   │   └── settings/          # 设置持久化
│   ├── preload/               # contextBridge → window.api
│   └── renderer/              # IDE 布局 / 项目树 / 表格编辑器 / Schema 面板
└── electron.vite.config.ts
```

## 路线图

- [x] M1 脚手架 + IDE 布局骨架
- [x] M2 打开项目 + conf 解析 + 运行时发现
- [x] M3 Schema 双通道解析 + Schema 面板
- [x] M4 Excel 读写层 + 表格编辑器（写回保真）
- [ ] M5 前端校验（类型、必填、主键、enum、ref）+ Problems 面板
- [ ] M6 Luban CLI 校验 + 错误定位（表/行/字段级映射）闭环
- [ ] M7 导出 + 端到端 + 打包发布

## 文档

- [设计文档](docs/design.md) — 架构、数据流、IPC 契约、里程碑
- [调研事实](docs/research/) 与 [实证样本](docs/samples/) — v4/v5 真实错误形态与 conf 结构

## 许可

[MIT](LICENSE)。
