import ExcelJS from 'exceljs'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseLubanConf } from '../project/conf-parser'
import { buildSchemaFromSources } from '../schema/normalizer'
import { openTableData } from './table-data'
import { getWorkbook, markDirty, saveWorkbook, forceReleaseWorkbook } from './excel/workbook'
import { applyEdits } from './excel/writer'
import type { FieldSchema } from '@shared/types/schema'
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
