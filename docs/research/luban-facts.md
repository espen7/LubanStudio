# Luban 事实速查（源码级调研固化，2026-10）

> 调研来源：focus-creative-games/luban 仓库（源码 + Releases）、luban_examples 官方示例仓库、官方文档站 datable.cn。
> 本文是 Luban Studio 开发的对 Luban 本体行为的权威备忘，实现解析器/CLI 集成时以本文 + `docs/samples/` 实证样本为准。

## 1. 版本现状

| 版本 | 发布 | 要点 |
|---|---|---|
| 1.x / 2.x | - | 无 luban.conf，全局配置在 root.xml（topmodule/group/service 标签）；有 Luban.Server（HTTP 8899） |
| 3.0.0 | 2024-07 | 彻底重构：引入 luban.conf + schemaFiles，单一 Luban.dll，移除远程生成，TableImporter 按文件名自动导表 |
| 4.0.0 | 2025-04 | Excel streaming 格式可配、原生 Lite 紧凑格式 |
| 5.0.0 | 2026-09 | AI Native：`-c schema-json`、`--errorFormat json`、Luban.Agent CLI、MCP Server、双语错误消息库、pipeline scope |
| 5.1.0 | 2026-09-10 | table variant、schema 来源追踪（file/sheet） |

**Luban Studio 目标环境是 v4**：无 schema-json、无 errorFormat json。v5 能力作为检测到时才启用的增强通道。

## 2. luban.conf（v3+ 格式，v4/v5 一致）

MiniTemplate/luban.conf 真实示例：

```json
{
  "groups": [
    {"names":["c"], "default":true},
    {"names":["s"], "default":true},
    {"names":["e"], "default":true}
  ],
  "schemaFiles": [
    {"fileName":"Defines", "type":""},
    {"fileName":"Data/__tables__.xlsx", "type":"table"},
    {"fileName":"Data/__beans__.xlsx", "type":"bean"},
    {"fileName":"Data/__enums__.xlsx", "type":"enum"}
  ],
  "dataDir": "Data",
  "targets": [
    {"name":"server", "manager":"Tables", "groups":["s"], "topModule":"cfg"},
    {"name":"client", "manager":"Tables", "groups":["c"], "topModule":"cfg"},
    {"name":"all",     "manager":"Tables", "groups":["c","s","e"], "topModule":"cfg"}
  ],
  "xargs": []
}
```

- 顶层 key 共 5 个（源码 `src/Luban.Core/GlobalConfigLoader.cs`）：`groups` / `schemaFiles` / `dataDir`（必填）/ `targets` / `xargs`
- `schemaFiles[].type`：`""` = 递归收集该目录下 XML 定义；`table` / `bean` / `enum` = 对应 xlsx 定义文件
- `groups.default: true` 的组承接未标 group 的表；未标 group 的字段属于所有组
- `__tables__` / `__beans__` / `__enums__` 不是顶层 key，是 schemaFiles 引入的**文件名约定**

## 3. 定义文件格式

### 3.1 XML（Defines/*.xml）

```xml
<module name="item">
  <enum name="EItemQuality" comment="道具品质">
    <var name="WHITE" alias="白" comment="白"/>
    <var name="GREEN" alias="绿"/>
  </enum>
  <bean name="Item" comment="道具">
    <var name="id" type="int" comment="道具id"/>
    <var name="major_type" type="EMajorType" group="c,s"/>
  </bean>
  <table name="TbItem" value="Item" input="通用道具表@item/道具系统表.xlsx" comment="道具表"/>
</module>
```

- table 属性全集：`name/value/index/mode(map|list|one)/input/readSchemaFromFile/group/output/comment/tags/patch_input`
- bean：`name/parent/valueType/sep/alias`；enum：`name/flags/unique`
- `input` 语法：`表名@文件路径`（可多段、目录递归）
- `Defines/builtin.xml` 预置 vector2/3/4（`valueType="1" sep=","`）

### 3.2 Excel 定义（__tables__.xlsx 等）

首个 `##` 行为元数据行，其后每列一项展开：

- `__tables__`：`full_name | value_type | read_schema_from_file | input | index | mode | group | comment | tags`（index 用 `+` 组合键、`,` 多索引）
- `__beans__`：`full_name | parent | valueType | sep | alias | comment | *fields`，字段展开为 `name | type | group | comment`
- `__enums__`：`full_name | flags | unique | comment | *items`，项展开为 `name | alias | value | comment`

## 4. 数据文件格式

### 4.1 Excel 数据表

- A 列以 `##` 开头的行为表头标记行，顺序可调：`##var`（字段名）、`##type`（类型）、`##group`（导出分组）、`##`/`##comment`（注释，整行忽略）
- 列名为空或 `#` 开头 → 整列忽略
- 多级表头：父字段合并单元格，其下再放子字段 `##var` 行（如 reward 下放 `item_id|num`）
- sep 多值：类型 `list,Item#sep=,`，单元格填 `101,1,armor`
- 多行 bean：字段名加 `*` 前缀，每物理行一个元素
- 竖表：A1 写 `##column`，一行一字段（配 mode=one）
- 紧凑 Lite：单元格 `{1,2,3}`、多态 `{Circle,1.5}`
- 字段类型后缀：`#sep= #default= #ref= #path= #convert= #escape=1`；可空 `int?`

### 4.2 JSON / Lua / 其他

- JSON：input 写 `*@foo.json` 为记录数组 `[{"id":1},...]`；裸文件名为单记录；多态 `"$type": "DemoD2"`；map 为 `[[2,2],[4,10]]`；目录递归扫描且忽略 `.` `~` `_` 开头文件
- Lua：文件以 `return` 开头，多态 `_type_="DemoD2"`，tag `__tag__="dev"`
- TSV 于 v4.12.0 加入

## 5. CLI

- 运行时要求：.NET SDK 8.0+
- 发布包：GitHub Releases `Luban.7z`（约 1.6MB），约定解压到 `Tools/Luban/`，内含 `Luban.dll`、`Templates/`（Scriban）、`nlog.xml`
- 官方 gen 脚本（MiniTemplate/gen.bat）：

```bat
set LUBAN_DLL=%WORKSPACE%\Tools\Luban\Luban.dll
dotnet %LUBAN_DLL% -t all -d json --conf luban.conf -x outputDataDir=output
```

- 参数全集（源码 `src/Luban/Program.cs` + v5.1 `--help` 实测）：`--conf`、`-t/--target`（必填）、`-c/--codeTarget`（可多次）、`-d/--dataTarget`（可多次）、`-x key=value`、`-p/--pipeline`、`-f/--forceLoadTableDatas`、`-i/-e`（tag 过滤）、`-o/--outputTable`（限定表）、`-w/--watchDir`、`--strict`、`--errorFormat text|json`（默认 text）、`--locale`、`--variant`、`--timeZone`、`--customTemplateDir`、`-l/--logConfig`、`-v/--verbose`、`--version`、`--help`

**版本探测（实证）**：`--version` 把 `Luban 5.1.0+<hash>` 打到 **stderr** 且仍 exit 1（缺必填参数）；启动 banner 也在 stderr。`-v` 是 verbose 不是版本。探测实现：忽略退出码、合并 stdout+stderr、正则 `/Luban (\d+\.\d+\.\d+)/`。

## 6. 错误输出格式（实证：docs/samples/）

### 6.0 通道实证结论（2026-10-08，v4.12.0 + v5.1.0 实测）

- **nlog 控制台日志（INFO/WARN/ERROR）全部走 stdout**，行前缀 `2026/10/08 11:17:24.707|ERROR|`；stderr 在文本模式下为空
- **v5 `--errorFormat json` 的 JSON 走 stderr**（纯净 JSON，无前缀）
- **v4.12 数据错误同样是五段块**（调研称"散落 Exception"不准确），与 v5 文本模式仅标签差异：v4 用 `Err:`，v5 用 `错误:`（v5 双语消息库）；解析器两者都要兼容
- `文件:` 字段格式为 `<表名>@<绝对路径>`（表名来自 input 描述符；readSchemaFromFile 场景为 Sheet 名）
- v4.12 无法加载当前 luban_examples/DataTables（examples 已用 v5 `variant` 属性，v4 报 `包含未知属性 attr:variant` 后退出）——v4 数据样本需用 MiniTemplate 抓

### 6.1 v5/v4 五段块（stdout，nlog 前缀需剥离）

```
=======================================================================
解析失败!
文件:        通用道具表@D:\...\Data\item/道具系统表.xlsx
错误位置:    Sheet:通用道具表 字段:max_pile_num 位置:[G4] abc      ← Sheet+字段+单元格+原始值
Err:         abc 不是 int 类型值                                     ← v5 为「错误:」
字段:        {item.Item}.max_pile_num
=======================================================================
```

schema 错误（v4 实证）：`===> "定义文件:<path> 定义:<xml片段> 包含未知属性 attr:variant"` 单行 + `run failed!!!`。

### 6.2 v5 `--errorFormat json`（stderr，IDE 首选）

```json
{"version":1,"ok":false,"exitCode":1,"errors":[
  {"category":"data","code":"error.data.parse_failed","message":"abc 不是 int 类型值",
   "file":"通用道具表@D:\\...\\道具系统表.xlsx",
   "location":"Sheet:通用道具表 字段:max_pile_num 位置:[G4] abc",
   "fieldPath":"{item.Item}.max_pile_num"}]}
```

注意：`file` 为 `<表名>@<绝对路径>` 描述符；`location` 为复合串（Sheet/字段/单元格/原值），与文本模式 `错误位置:` 行同构。

成功输出 `{"version":1,"ok":true,"exitCode":0}`；category ∈ `schema|data|validation|codegen|cli|runtime`。

### 6.3 schema-json 输出形状（实证，v5.1.0，见 docs/samples/v5/）

命令：`dotnet Luban.dll -t all -c schema-json --conf luban.conf -x outputCodeDir=<dir>` → 产出单个 `schema.json`：

```jsonc
{
  "version": 1, "target": "all", "manager": "Tables", "topModule": "cfg",
  "groups": [],
  "tables": [{
    "fullName": "item.TbItem", "name": "TbItem", "namespace": "item",
    "valueType": "item.Item", "mode": "map", "index": "id",
    "inputFiles": ["通用道具表@item/道具系统表.xlsx"], "groups": [],
    "readSchemaFromFile": false, "outputDataFile": "item_tbitem",
    "comment": "道具表", "source": {"file": "Defines/item.xml"}
  }],
  "beans": [{
    "fullName": "demo.item", "name": "item", "namespace": "demo",
    "isAbstract": false, "groups": [], "source": {"file": "Data/#demo.item.xlsx"},
    "fields": [{"name": "id", "type": "int", "comment": "id", "groups": [], "hostType": "demo.item"}]
  }],
  "enums": [{
    "fullName": "ai.EExecutor", "name": "EExecutor", "namespace": "ai",
    "isFlags": false, "groups": [], "source": {"file": "Defines/ai.xml"},
    "items": [{"name": "CLIENT", "value": 0}]
  }]
}
```

要点：

- 字段 `type` 是**原始类型字符串**（`"int"`、`"EMinorType"`、`"list,Item#sep=,"`），仍需过 type-parser 归一到 TypeRef
- `isAbstract` / `isFlags` 为官方命名，映射到内部模型时改名（禁 is 前缀）
- `readSchemaFromFile=true` 时 bean 的 `source.file` 指向数据 xlsx 本身（MiniTemplate 即此形态）
- scale 参考：DataTables 示例 53 表 / 128 bean / 25 enum，schema.json 约 100KB 量级

### 6.4 其他真实消息样例

- `配置表 'TbItem' 主键字段:'id' 主键值:'5' 重复. 记录1 来自文件:a.xlsx 记录2 来自文件:b.xlsx`
- `结构:'Item' 字段:'x1' 缺失`

## 7. 长驻进程 / IDE 集成通道

- `-w/--watchDir`：本地 DirectoryWatcher + 1s 轮询，变化重跑不退出；无 HTTP
- v5 专属：`Luban.Mcp`（stdio MCP Server：ListTables/GetSchema/Describe/Validate/Generate/SearchDocs，需环境变量 LUBAN_AGENT_DLL/LUBAN_DLL/LUBAN_DOC）、`Luban.Agent.dll`（子命令 capabilities/list-tables/describe/schema/validate，输出 AgentResult JSON）

## 8. 对 Luban Studio 的直接影响

1. conf 解析按 §2 五个顶层 key；1.x/2.x root.xml 仅识别并提示不支持
2. Schema 主路径 = 自研解析（§3 XML + Excel 定义）；v5 才有 schema-json
3. 错误映射主路径 = 文本解析（§6.1 五段块，stdout；v4 `Err:` / v5 `错误:` 双标签）；v5 才有 JSON（§6.2，stderr）
4. `[B15]` 位置 = Cell.ToString()（列字母+行号），需换算为 exceljs 1-based 行列
5. dotnet ≥8 + Luban.dll 路径可配置、默认自动发现 `Tools/Luban/`
