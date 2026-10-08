# 样本抓取命令记录（docs/samples/ 复现方式）

前提：`.sandbox/` 目录（gitignore）内已备好素材——`luban_examples`（官方示例 clone）、`releases/v4|v5/Luban/Luban.dll`（GitHub Releases Luban.7z 解压，7z 在 D:\Scoop\shims\7z.exe）。dotnet SDK 8。

```bash
# 1. 素材准备（一次性）
git clone --depth 1 https://github.com/focus-creative-games/luban_examples .sandbox/luban_examples
curl -sL -o .sandbox/releases/Luban-v4.12.0.7z https://github.com/focus-creative-games/luban/releases/download/v4.12.0/Luban.7z
curl -sL -o .sandbox/releases/Luban-v5.1.0.7z https://github.com/focus-creative-games/luban/releases/download/v5.1.0/Luban.7z
7z x .sandbox/releases/Luban-v4.12.0.7z -o.sandbox/releases/v4
7z x .sandbox/releases/Luban-v5.1.0.7z -o.sandbox/releases/v5

# 2. 版本探测（v4/v5 同构：首行 "Luban x.y.z+hash"，缺 --conf 时 exit 1 但版本已打印）
dotnet .sandbox/releases/v4/Luban/Luban.dll -v > docs/samples/v4/version-probe.txt
dotnet .sandbox/releases/v5/Luban/Luban.dll -v > docs/samples/v5/version-probe.txt

# 3. 成功导出（MiniTemplate，v4/v5 参数完全一致）
cd .sandbox/luban_examples/MiniTemplate
dotnet <dll> -t all -d json --conf luban.conf -x outputDataDir=out-json \
  > docs/samples/v4/export-ok.stdout.txt 2> docs/samples/v4/export-ok.stderr.txt

# 4. schema-json（仅 v5；产出 out-schema/schema.json）
dotnet .sandbox/releases/v5/Luban/Luban.dll -t all -c schema-json \
  --conf luban.conf -x outputCodeDir=out-schema
cp out-schema/schema.json docs/samples/v5/mini-schema.json        # MiniTemplate
cp out-schema/schema.json docs/samples/v5/datatables-schema.json  # DataTables（53 表）

# 5. 数据错误（先篡改单元格：MiniTemplate #demo.item.xlsx Sheet1 E5 int←"abc"，
#    DataTables 道具系统表.xlsx 通用道具表 G4 int←"abc"，exceljs 改值保存）
# v4 文本（stdout 五段块，Err: 标签）——注意 v4 跑不了当前 DataTables（v5 variant 属性），用 MiniTemplate
dotnet .sandbox/releases/v4/Luban/Luban.dll -t all -d json --conf luban.conf -x outputDataDir=out-json \
  > docs/samples/v4/data-error.stdout.txt 2> docs/samples/v4/data-error.stderr.txt
# v5 文本（stdout 五段块，错误: 标签）
dotnet .sandbox/releases/v5/Luban/Luban.dll -t all -d json --conf luban.conf -x outputDataDir=out-json \
  > docs/samples/v5/data-error-text.stdout.txt 2> docs/samples/v5/data-error-text.stderr.txt
# v5 JSON（stderr 纯 JSON）
dotnet .sandbox/releases/v5/Luban/Luban.dll -t all -d json --conf luban.conf -x outputDataDir=out-json \
  --errorFormat json \
  > docs/samples/v5/data-error-json.stdout.txt 2> docs/samples/v5/data-error-json.stderr.txt

# 6. v4 schema 错误（v4.12 跑 v5 版 examples 的 DataTables，schema 加载即失败）
dotnet .sandbox/releases/v4/Luban/Luban.dll -t all -d json --conf luban.conf -x outputDataDir=out-json \
  > docs/samples/v4/schema-error.stdout.txt 2> docs/samples/v4/schema-error.stderr.txt
```

篡改脚本（node，项目根运行）：

```js
const Excel = require('exceljs')
;(async () => {
  const wb = new Excel.Workbook()
  await wb.xlsx.readFile('.sandbox/run/err-v4-mini/Data/#demo.item.xlsx')
  wb.worksheets[0].getRow(5).getCell(5).value = 'abc'
  await wb.xlsx.writeFile('.sandbox/run/err-v4-mini/Data/#demo.item.xlsx')
})()
```
