# Luban Studio 设计文档 v0.1

> 状态：定稿（2026-10-08）。事实依据见 [research/luban-facts.md](research/luban-facts.md)，实证样本见 [samples/](samples/)。
> 本文档取代最初大纲草稿：luban.conf 结构按 v3+ 真实格式修正，Schema 层与错误映射按「v4 主路径 / v5 增强通道」双轨设计。

## 1. 项目概述

Luban Studio 是一个面向 **Luban 游戏数据配置**（focus-creative-games/luban）的桌面 IDE。它不替代 Luban，而是把 `luban.conf`、Schema 定义（XML / `__tables__.xlsx` 等）和 Excel 数据表转成一个可视化的配置编辑环境。

核心目标：

- 让策划和程序在一个界面里浏览表结构；
- 编辑表格数据（Excel 直改、保真写回）；
- 实时校验字段类型、ref、enum、必填、主键；
- 调用 Luban CLI 进行校验和导出；
- 把 Luban 错误定位回具体表、行、字段。

## 2. 产品定位

| 维度     | 定位                                                        |
|----------|-------------------------------------------------------------|
| 用户     | 游戏策划、程序、配置维护人员                                |
| 场景     | Luban 项目日常配置编辑、校验、导出                          |
| 形态     | 桌面应用（Windows 优先）                                    |
| 关系     | Luban 的配套 IDE，不是新的配置框架                          |
| 边界     | 不重写 Luban 编译器，只做编辑、校验、导出集成               |
| 版本目标 | **Luban v4 为主**（无 v5 新特性依赖），v5+ 自动启用增强通道 |

## 3. 技术架构

**Electron + TypeScript + React**，自建（不 fork VSCode/Theia——体量、维护成本、许可条款都不划算；布局范式借鉴 IDEA，架构思路借鉴 Beekeeper Studio / MongoDB Compass）。

```text
┌──────────────────────────────────────────────────┐
│  Renderer (React 18 + TypeScript)                │
│  - IDEA 风格布局 (react-resizable-panels)         │
│  - Project 树 / Table Editor (Glide Data Grid)   │
│  - Schema Panel / Problems / Output              │
├──────────────────────────────────────────────────┤
│  Electron Main (Node.js)                         │
│  - 项目管理 / 文件读写 / 设置持久化                │
│  - Schema 解析（自研 + v5 schema-json 双通道）    │
│  - Luban CLI 调用 / 错误解析 / 导出管理           │
├──────────────────────────────────────────────────┤
│  Shared Layer (src/shared)                       │
│  - 纯类型 + 纯函数，三进程共享                    │
│  - IPC 契约 / 内部 Schema 抽象 / Problem 模型     │
└──────────────────────────────────────────────────┘
```

技术栈锁定：electron-vite 5、React 18（GDG peer 限制）、Glide Data Grid 6.0.3、zustand 5、Tailwind CSS 4 + shadcn/ui、exceljs 4.4.0、fast-xml-parser、pnpm。

## 4. 界面布局

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Toolbar   [打开项目] [校验▾ target] [导出…] [重载Schema] [设置]         │
├──────────────┬──────────────────────────────────────────┬─────────────┤
│ Project(240) │ EditorTabs  [TbItem ●] [TbSkill]         │ Schema(300) │
│ ┌──────────┐ │ ┌──────────────────────────────────────┐ │ ┌─────────┐ │
│ │🔍 过滤框  │ │ │ GridView (Glide Data Grid)          │ │ │ 表元信息 │ │
│ ├──────────┤ │ │ 行号│id │name│quality│cost …         │ │ │ mode/   │ │
│ │ ▾ item   │ │ │  1 │ 1 │剑 │WHITE  │100 │           │ │ │ index/  │ │
│ │  ▸ TbItem│ │ │  2 │ 2 │盾 │GREEN  │abc │◀类型错误   │ │ │ input/  │ │
│ │ ▾ reward │ │ │ 列头=字段名+类型徽标                  │ │ │ groups  │ │
│ │ ── 结构 ──│ │ └──────────────────────────────────────┘ │ ├─────────┤ │
│ │ ▸ enum   │ │                                          │ │ 字段列表 │ │
│ │ ▸ bean   │ │                                          │ │ ref/注释│ │
├──────────────┴──────────────────────────────────────────┴─────────────┤
│ Dock(220，可折叠): [Problems 3] [Output] [Terminal(占位v2)]            │
├────────────────────────────────────────────────────────────────────────┤
│ StatusBar(24): dotnet 8.0.406 │ Luban 4.13·文本通道 │ 脏表 2 │ 就绪    │
└────────────────────────────────────────────────────────────────────────┘
```

三块面板（左树 / 右 Schema / 底部 Dock）均可拖拽调宽、双击分隔条复位、可折叠。左侧导航、中间编辑、右侧字段结构、底部校验与日志。

## 5. 核心功能模块

| 模块 | 职责 |
|---|---|
| 项目管理 | 打开 Luban 项目，识别 luban.conf（旧版 root.xml 识别并提示不支持） |
| Schema 解析 | **自研解析器（主路径）**：XML + Excel 定义 → 内部 SchemaModel；v5 探测到时启用 schema-json 增强通道 |
| 表格编辑 | 基于 Glide Data Grid 展示和编辑 Excel 数据，写回保真 |
| 前端校验 | 类型、必填、主键重复、enum 合法性、ref 存在性 |
| Luban 集成 | spawn dotnet Luban.dll，流式转发 stdout/stderr，可取消 |
| 错误映射 | CLI 错误（v4 文本 / v5 JSON）映射到表、行、字段、单元格 |
| 导出管理 | target 选择、输出目录、仅导出当前表 |
| 输出面板 | Luban 日志、导出结果，validate/export 分频道 |

## 6. 内部 Schema 抽象

前端不直接操作原始定义文件，而是消费统一的 `SchemaModel`（`src/shared/types/schema.ts`）。核心类型：

```ts
type TypeRef =
  | { kind: 'primitive'; name: string }     // bool int long float double string ...
  | { kind: 'enum'; ref: string }
  | { kind: 'bean'; ref: string }
  | { kind: 'nullable'; inner: TypeRef }    // "int?"
  | { kind: 'list'; inner: TypeRef; sep?: string }
  | { kind: 'array' | 'set'; inner: TypeRef }
  | { kind: 'map'; key: TypeRef; value: TypeRef }
  | { kind: 'tuple'; items: TypeRef[] }
  | { kind: 'datetime' } | { kind: 'text' }

interface FieldSchema {
  name: string
  type: TypeRef
  options: { sep?: string; default?: string; ref?: string; path?: string }
  group?: string
  comment?: string
  tags?: string[]
}

interface TableSchema {
  id: string                // 'item.TbItem'
  module: string
  name: string
  mode: 'map' | 'list' | 'one'
  index?: string
  valueTypeRef: TypeRef
  input: { tableName: string; file: string }[]
  groups: string[]
  comment?: string
  fields: FieldSchema[]     // valueType 为 bean 时展平一层
}

interface SchemaModel {
  source: 'schema-json' | 'xml' | 'excel-def'
  tables: TableSchema[]
  beans: BeanSchema[]
  enums: EnumSchema[]
  warnings: string[]
}
```

解析管线（`src/main/schema/`）：

```text
版本探测 (dotnet Luban.dll -v)
  ├─ v5+ → schema-json 通道：dotnet Luban.dll -c schema-json → schema-json-mapper → SchemaModel
  └─ v4/v3 或 dotnet 不可用 → 自研解析（一等路径，不依赖运行时）：
        conf.schemaFiles
          ├─ type=""  → xml-parser（<module> 下 enum/bean/table 属性直读）
          └─ type=xlsx → excel-def-parser（## 元数据行 + 逐列展开）
        → type-parser（类型字符串 → TypeRef）→ normalizer → SchemaModel（附 warnings）
```

## 7. 数据流

```text
打开项目 → 读取 luban.conf → conf-parser → LubanProject（含 runtime 探测）
  → Schema 解析（双通道）→ 渲染 Project 树

点击表 → data:open → exceljs 打开 input 指向的 xlsx
  → header.ts 检测 ##var/##type 表头块、列映射（ColumnBinding）
  → cell-io 按 TypeRef 读值 → TableData → GDG 渲染

编辑单元格 → data:update-cell（main 侧 workbook 常驻，即时单格 IPC）
  → 前端校验（150ms debounce 增量）→ 标记错误单元格

保存 (Ctrl+S) → writer 只对编辑过的 cell 赋 value（不动 style）
  → 首存 .luban-bak 备份 → CLI 校验 → 错误解析 → Problems 面板
```

## 8. 错误处理机制

CLI 错误统一映射为 `Problem`（与前端校验共用类型）：

```ts
interface Problem {
  source: 'frontend' | 'luban'
  severity: 'error' | 'warning' | 'info'
  code: string
  category?: string        // CLI: data|schema|validation|...
  message: string
  tableId?: string
  file?: string            // 绝对路径
  rowNumber?: number       // 1-based，可直接对 exceljs
  columnNumber?: number
  fieldPath?: string
}
```

双通道解析：

- **v4（主路径）文本解析**：stderr 按行累积，正则/状态机提取。v5 文本形态为五段块（`文件:` / `错误位置: [B15]` / `错误:` / `字段:`）；v4 为散落 Exception/裸字符串——两种形态都要兼容，过滤 .NET 堆栈。形态以 `docs/samples/` 实证样本为准。
- **v5 JSON 解析**：stderr 整体 `JSON.parse`，`errors[]` 直读 file/location/fieldPath。

点击 Problem：自动切换到对应表 → 滚动到对应行 → 选中并高亮对应单元格。`[B15]` 位置由纯函数换算为 1-based 行列（含 AA+ 多字母列）。

## 9. 项目结构

```text
LubanStudio/
├── docs/                          # 设计文档 / 调研事实 / 实证样本
├── electron.vite.config.ts        # main/preload/renderer 三段 + @shared alias
├── src/
│   ├── shared/                    # 纯类型+纯函数（禁 import electron/node:*/DOM）
│   │   ├── ipc/                   # channels / contract / typed 工具
│   │   └── types/                 # project / schema / data / problem / settings
│   ├── main/
│   │   ├── ipc/                   # typed handle + 五组 handlers
│   │   ├── project/               # conf-parser / discovery / workspace
│   │   ├── schema/                # xml/excel-def/type-parser/normalizer + schema-json*
│   │   ├── data/excel/            # workbook / header / cell-io / writer
│   │   ├── luban/                 # runner / commands / error-json / error-text
│   │   └── settings/store.ts
│   ├── preload/index.ts           # contextBridge → window.api 五组
│   └── renderer/src/
│       ├── layouts/IdeLayout.tsx
│       ├── components/            # project-tree / table-editor / schema-panel / problems / output / status-bar
│       ├── stores/                # zustand × 6
│       ├── services/              # window.api 薄封装
│       ├── validation/            # engine + rules × 5
│       └── lib/                   # [B15]→行列换算等纯函数
```

## 10. 里程碑（第一阶段范围）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| M1 | 脚手架 + 四区布局骨架 + 设计文档 + v4/v5 实证样本 | `pnpm dev` 出窗口；样本齐全 |
| M2 | 打开项目 + conf 解析 + dotnet/Luban.dll 发现 + 表树 | MiniTemplate 树完整、分组正确、最近项目可恢复 |
| M3 | Schema 双通道解析 + Schema 面板 | 自研解析器对官方示例全量正确（硬指标）；无 dotnet 照常工作 |
| M4 | Excel 读写层 + GDG 编辑器 + 写回保真 | 样式/公式/其余 sheet 完好；unzip diff 仅目标 cell 变化 |
| M5 | 前端校验 5 规则 + Problems 面板 | 五类坏数据全检出、定位正确、修正即消 |
| M6 | CLI 校验 + Output + 错误定位闭环 | v4/v5 双环境：Problems 行列定位、双击跳转、可取消 |
| M7 | 导出 + 端到端 + electron-builder 打包 | 端到端 checklist 全过；导出与命令行直跑 diff 为空 |

第二阶段再考虑：多表对比、diff 模式、版本管理、插件扩展、多人协作、CloudIDE 形态、csv/json 数据源、加行加列、1.x/2.x 老版本支持。

## 附录 A：IPC 契约摘要

invoke：`project:pick-conf|open|close|recent`、`schema:get|reload`、`data:open|update-cell|save|close`、`luban:validate|export|cancel`、`settings:get|patch`
push：`schema:changed`、`luban:output`、`luban:exit`
规则：失败即 reject（不引入 Result 包装类）；数据入参在回调参数前；序列化字段名禁用 is 前缀。

## 附录 B：视觉规范

- 纯色无装饰：禁阴影/渐变/过渡动画；边框 1px solid；light `#fafafa`/`#ffffff`，dark `#1e1e1e`/`#252526`
- 间距 4 的倍数：面板内边距 12、列表行高 28、树缩进 12/级、页签 32、状态栏 24
- 图标：table/bean/enum 固定图标（lucide）；类型文本与日志用 mono
- 错误标记：纯色 1px 描边 + 角标，不用闪烁

## 附录 C：风险清单

| # | 风险 | 缓解 |
|---|---|---|
| R1 | GDG 维护放缓 | grid-adapter 封装隔离，备胎 react-data-grid |
| R2 | exceljs 图表/图片丢失 | 首存 .luban-bak；drawings 检测警告；unzip-diff 测试 |
| R3 | schema-json 形状未实证 | M1 实证定契约；mapper 单文件隔离 |
| R4 | 版本碎片化（v4 主、含更老） | 版本/能力探测缓存；自研解析+文本错误为一等路径 |
| R5 | dotnet 缺失 | runtime.available 状态机；编辑/前端校验不受影响 |
| R6 | 大表内存 | 按表懒加载 + workbook LRU（~8）；GDG 虚拟化 |
| R7 | 多级表头复杂度 | v1 明确只读矩阵，样本驱动单测 |
