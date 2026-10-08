import ExcelJS from 'exceljs'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FieldSchema } from '@shared/types/schema'
import { parseType } from '@main/schema/type-parser'
import { applyEdits } from './writer'
import { backupPathFor, getWorkbook, markDirty, saveWorkbook, releaseWorkbook, forceReleaseWorkbook } from './workbook'

const dirs: string[] = []

function makeTmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'luban-m4-'))
  dirs.push(d)
  return d
}

function intField(): FieldSchema {
  const { type, options } = parseType('int')
  return {
    name: 'count',
    type,
    rawType: 'int',
    options: { attrs: options.attrs },
    groups: []
  }
}

async function buildFixture(path: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  const ws1 = wb.addWorksheet('T1')
  ws1.getCell('B2').value = 10
  ws1.getCell('B2').font = { bold: true }
  ws1.getCell('C2').value = { formula: 'B2*2', result: 20 }
  ws1.getCell('D2').value = 'keep'
  ws1.getCell('E2').numFmt = '0.00'
  const ws2 = wb.addWorksheet('T2')
  ws2.getCell('A1').value = 'other sheet'
  await wb.xlsx.writeFile(path)
}

describe('applyEdits', () => {
  it('只改目标值，样式与公式原样保留', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('T')
    ws.getCell('B2').value = 10
    ws.getCell('B2').font = { bold: true }
    ws.getCell('C2').value = { formula: 'B2*2', result: 20 }
    ws.getCell('D2').value = 'keep'

    applyEdits(wb, 'T', [{ rowNumber: 2, excelCol: 2, field: intField(), text: '99' }])

    expect(ws.getCell('B2').value).toBe(99)
    expect(ws.getCell('B2').font?.bold).toBe(true)
    expect(ws.getCell('C2').value).toEqual({ formula: 'B2*2', result: 20 })
    expect(ws.getCell('D2').value).toBe('keep')
  })

  it('非法值抛错不落盘', () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('T')
    ws.getCell('B2').value = 10
    expect(() =>
      applyEdits(wb, 'T', [{ rowNumber: 2, excelCol: 2, field: intField(), text: 'abc' }])
    ).toThrow(/不是 int/)
    expect(ws.getCell('B2').value).toBe(10)
  })
})

describe('workbook 会话缓存与备份', () => {
  afterEach(() => {
    for (const d of dirs) forceReleaseWorkbook(join(d, 'a.xlsx'))
  })

  it('首存生成 .luban-bak，重存不覆盖备份，未脏保存为 no-op', async () => {
    const dir = makeTmpDir()
    const file = join(dir, 'a.xlsx')
    await buildFixture(file)

    const { wb } = await getWorkbook(file)
    applyEdits(wb, 'T1', [{ rowNumber: 2, excelCol: 2, field: intField(), text: '99' }])
    markDirty(file)

    const backupPath = await saveWorkbook(file)
    expect(backupPath).toBe(backupPathFor(file))
    expect(existsSync(backupPath!)).toBe(true)

    // 备份是编辑前的原值
    const bak = new ExcelJS.Workbook()
    await bak.xlsx.readFile(backupPath!)
    expect(bak.getWorksheet('T1')!.getCell('B2').value).toBe(10)

    // 原文件已是新值，且样式/公式/其余 sheet 完好
    const re = new ExcelJS.Workbook()
    await re.xlsx.readFile(file)
    const t1 = re.getWorksheet('T1')!
    expect(t1.getCell('B2').value).toBe(99)
    expect(t1.getCell('B2').font?.bold).toBe(true)
    expect(t1.getCell('C2').value).toEqual({ formula: 'B2*2', result: 20 })
    expect(t1.getCell('D2').value).toBe('keep')
    expect(t1.getCell('E2').numFmt).toBe('0.00')
    expect(re.getWorksheet('T2')!.getCell('A1').value).toBe('other sheet')

    // 已保存（不脏）：再次保存 no-op
    expect(await saveWorkbook(file)).toBeUndefined()

    // 干净可释放；脏的不可释放
    expect(releaseWorkbook(file)).toBe(true)
    await getWorkbook(file)
    markDirty(file)
    expect(releaseWorkbook(file)).toBe(false)
    forceReleaseWorkbook(file)
  })

  it('备份文件名形如 a.luban-bak.xlsx', () => {
    expect(backupPathFor(join('x', 'a.xlsx'))).toBe(join('x', 'a.luban-bak.xlsx'))
  })
})

describe('saveWorkbook 写出的文件字节有效', () => {
  it('xlsx 头为 PK zip 魔数', async () => {
    const dir = makeTmpDir()
    const file = join(dir, 'a.xlsx')
    await buildFixture(file)
    const { wb } = await getWorkbook(file)
    applyEdits(wb, 'T1', [{ rowNumber: 2, excelCol: 2, field: intField(), text: '5' }])
    markDirty(file)
    await saveWorkbook(file)
    const head = readFileSync(file).subarray(0, 2).toString('latin1')
    expect(head).toBe('PK')
  })
})
