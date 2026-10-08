import ExcelJS from 'exceljs'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseLubanConf } from '../project/conf-parser'
import { buildSchemaFromSources } from '../schema/normalizer'
import { addBlankRow, closeOpenedTable, deleteDataRow, openTableData } from './table-data'
import {
  forceReleaseWorkbook,
  getWorkbook,
  isDirty,
  markDirty,
  saveWorkbook
} from './excel/workbook'
import { applyEdits } from './excel/writer'
import type { FieldSchema, TableSchema } from '@shared/types/schema'
import type { LubanConf } from '@shared/types/project'
import { parseType } from '../schema/type-parser'

const SANDBOX = join(__dirname, '../../../.sandbox')
const MINI = join(SANDBOX, 'luban_examples/MiniTemplate')
const hasSandbox = existsSync(MINI)

const tmpDirs: string[] = []
const touchedFiles: string[] = []

afterEach(() => {
  for (const f of touchedFiles) forceReleaseWorkbook(f)
  touchedFiles.length = 0
})

describe.skipIf(!hasSandbox)('openTableData（真实 MiniTemplate 文件）', () => {
  it('# 前缀自动注册表可打开且列绑定正确', async () => {
    const conf = parseLubanConf(join(MINI, 'luban.conf'))
    const model = await buildSchemaFromSources(conf)
    const table = model.tables.find((t) => t.id === 'demo.Tbitem')
    expect(table).toBeDefined()

    const data = await openTableData(table!, conf)
    touchedFiles.push(data.file)
    expect(data.file.toLowerCase()).toContain('demo.item.xlsx')
    expect(data.columns.length).toBe(table!.fields.length)
    expect(data.rows.length).toBeGreaterThan(0)
    expect(data.rows[0].cells.length).toBe(data.columns.length)

    // id 字段列绑定且可编辑，值与 Excel 一致
    const idCol = data.columns.find((c) => c.fieldName === 'id')
    expect(idCol).toBeDefined()
    expect(idCol!.editable).toBe(true)
    const idIdx = data.columns.indexOf(idCol!)
    expect(typeof data.rows[0].cells[idIdx]).toBe('number')
  })

  it('编辑 → 保存 → 备份生成且原文件更新', async () => {
    const conf = parseLubanConf(join(MINI, 'luban.conf'))
    const model = await buildSchemaFromSources(conf)
    const table = model.tables.find((t) => t.id === 'demo.Tbitem')!

    // 复制 Data 到临时目录，写的是副本
    const tmp = mkdtempSync(join(tmpdir(), 'luban-m4-int-'))
    tmpDirs.push(tmp)
    const conf2 = { ...conf, dataDir: join(tmp, 'Data') }
    mkdirSync(conf2.dataDir, { recursive: true })
    copyFileSync(join(conf.dataDir, '#demo.item.xlsx'), join(conf2.dataDir, '#demo.item.xlsx'))

    const data = await openTableData(table, conf2)
    touchedFiles.push(data.file)

    const idCol = data.columns.find((c) => c.fieldName === 'id')!
    const idIdx = data.columns.indexOf(idCol)
    const row = data.rows[0]
    const oldVal = row.cells[idIdx] as number
    const field: FieldSchema = (() => {
      const f = table.fields.find((x) => x.name === 'id')!
      const { type, options } = parseType(f.rawType)
      return { ...f, type, options: { attrs: options.attrs } }
    })()

    const { wb } = await getWorkbook(data.file)
    applyEdits(wb, data.sheetName, [
      { rowNumber: row.rowNumber, excelCol: idCol.excelCol, field, text: String(oldVal + 100) }
    ])
    markDirty(data.file)

    const backupPath = await saveWorkbook(data.file)
    expect(backupPath).toBeDefined()
    expect(existsSync(backupPath!)).toBe(true)

    const re = new ExcelJS.Workbook()
    await re.xlsx.readFile(data.file)
    const ws = re.getWorksheet(data.sheetName)!
    expect(ws.getRow(row.rowNumber).getCell(idCol.excelCol).value).toBe(oldVal + 100)

    // 备份里是旧值
    const bak = new ExcelJS.Workbook()
    await bak.xlsx.readFile(backupPath!)
    expect(bak.getWorksheet(data.sheetName)!.getRow(row.rowNumber).getCell(idCol.excelCol).value).toBe(oldVal)
  })
})

const TABLE_ID = 'test.Trowops'

function mkField(name: string, rawType: string, groups: string[]): FieldSchema {
  const { type, options } = parseType(rawType)
  return { name, type, rawType, options: { attrs: options.attrs }, groups }
}

const ROWOPS_TABLE: TableSchema = {
  id: TABLE_ID,
  module: 'test',
  name: 'Trowops',
  mode: 'map',
  index: 'id',
  valueType: 'RowOps',
  inputs: [{ tableName: 'Trowops', file: 'Trowops.xlsx' }],
  groups: [],
  readSchemaFromFile: false,
  fields: [mkField('id', 'int', []), mkField('name', 'string', ['c']), mkField('hp', 'int', ['e'])]
}

async function writeFixture(dir: string, multiLevel: boolean): Promise<LubanConf> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Trowops')
  if (multiLevel) {
    ws.getRow(1).values = ['##var', 'id', 'nest']
    ws.getRow(2).values = ['##var', 'id', 'a']
    ws.getRow(3).values = ['##type', 'int', 'int']
    ws.getRow(4).values = [null, 1, 2]
  } else {
    ws.getRow(1).values = ['##var', 'id', 'name', 'hp', 'gold']
    ws.getRow(2).values = ['##type', 'int', 'string', 'int', 'int']
    ws.getRow(3).values = ['##group', '', 'c', 's', 'c,s']
    ws.getRow(4).values = [null, 1, 'a', 10, 100]
    ws.getRow(5).values = [null, 2, 'b', 20, 200]
  }
  await wb.xlsx.writeFile(join(dir, 'Trowops.xlsx'))
  return {
    root: dir,
    dataDir: dir,
    groups: [],
    schemaFiles: [],
    targets: [],
    xargs: []
  }
}

describe('行增删 + 列分组（自建临时表）', () => {
  let dir = ''
  let conf: LubanConf

  async function setup(multiLevel = false): Promise<void> {
    dir = mkdtempSync(join(tmpdir(), 'luban-rowops-'))
    conf = await writeFixture(dir, multiLevel)
  }

  afterEach(() => {
    closeOpenedTable(TABLE_ID)
    if (dir) forceReleaseWorkbook(join(dir, 'Trowops.xlsx'))
    rmSync(dir || 'x', { recursive: true, force: true })
  })

  it('列分组：schema 声明优先，无 schema 字段时回退 ##group 行', async () => {
    await setup()
    const data = await openTableData(ROWOPS_TABLE, conf)
    expect(data.columns.map((c) => c.groups)).toEqual([[], ['c'], ['e'], ['c', 's']])
    expect(data.rowOps).toEqual({ canAdd: true, canDelete: true })
  })

  it('新增空白行只存在于内存，删除数据行才改动工作簿', async () => {
    await setup()
    const file = join(dir, 'Trowops.xlsx')
    expect((await openTableData(ROWOPS_TABLE, conf)).rows.map((r) => r.rowNumber)).toEqual([4, 5])

    await addBlankRow(TABLE_ID)
    await addBlankRow(TABLE_ID)
    const withBlanks = await openTableData(ROWOPS_TABLE, conf)
    expect(withBlanks.rows.map((r) => r.rowNumber)).toEqual([4, 5, 6, 7])
    expect(withBlanks.rows[2].cells.every((c) => c === null)).toBe(true)
    expect(isDirty(file)).toBe(false)

    // 删空白尾行：行数回退，文件仍不脏
    await deleteDataRow(TABLE_ID, 7)
    expect((await openTableData(ROWOPS_TABLE, conf)).rows.map((r) => r.rowNumber)).toEqual([4, 5, 6])
    expect(isDirty(file)).toBe(false)

    // 删真实数据行：下方行上移，空白尾行跟着前移
    await deleteDataRow(TABLE_ID, 5)
    const afterDelete = await openTableData(ROWOPS_TABLE, conf)
    expect(afterDelete.rows.map((r) => r.rowNumber)).toEqual([4, 5])
    expect(afterDelete.rows[0].cells[0]).toBe(1)
    expect(isDirty(file)).toBe(true)

    await saveWorkbook(file)
    closeOpenedTable(TABLE_ID)
    forceReleaseWorkbook(file)
    const re = new ExcelJS.Workbook()
    await re.xlsx.readFile(file)
    const ws = re.getWorksheet('Trowops')!
    expect(ws.getRow(4).getCell(2).value).toBe(1)
    expect(ws.getRow(5).getCell(2).value).toBeNull()
  })

  it('多级表头禁用增删行', async () => {
    await setup(true)
    const data = await openTableData(ROWOPS_TABLE, conf)
    expect(data.rowOps.canAdd).toBe(false)
    await expect(addBlankRow(TABLE_ID)).rejects.toThrow(/多级表头/)
  })
})
