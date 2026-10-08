import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseDataHeader, readCellValue } from './header'

function buildSheet(rows: ExcelJS.CellValue[][]): ExcelJS.Worksheet {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('T')
  for (let i = 0; i < rows.length; i++) {
    const row = ws.getRow(i + 1)
    rows[i].forEach((v, j) => {
      if (v !== undefined) row.getCell(j + 1).value = v
    })
  }
  return ws
}

describe('parseDataHeader', () => {
  it('单级表头：列绑定、忽略列、数据起始行', () => {
    const warnings: string[] = []
    const ws = buildSheet([
      ['##'],
      ['##var', 'id', 'name', '#备注', ''],
      ['##type', 'int', 'string', '', ''],
      ['##', '主键', '名称', '', ''],
      [undefined, 1, 'a', 'x', 'y'],
      [undefined, 2, 'b', 'x', 'y']
    ])
    const header = parseDataHeader(ws, warnings)
    expect(header).not.toBeNull()
    expect(header!.multiLevel).toBe(false)
    expect(header!.dataFirstRow).toBe(5)
    expect(header!.columns).toEqual([
      { excelCol: 2, label: 'id', name: 'id', rawType: 'int', groups: [], comment: '主键' },
      { excelCol: 3, label: 'name', name: 'name', rawType: 'string', groups: [], comment: '名称' }
    ])
  })

  it('##group 行解析分组', () => {
    const warnings: string[] = []
    const ws = buildSheet([
      ['##var', 'id', 'name'],
      ['##type', 'int', 'string'],
      ['##group', '', 'a,b'],
      [undefined, 1, 'x']
    ])
    const header = parseDataHeader(ws, warnings)!
    expect(header.columns[0].groups).toEqual([])
    expect(header.columns[1].groups).toEqual(['a', 'b'])
    expect(header.dataFirstRow).toBe(4)
  })

  it('多级表头：合并单元格父字段展平', () => {
    const warnings: string[] = []
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('T')
    ws.getCell('A2').value = '##var'
    ws.getCell('A3').value = '##var'
    ws.getCell('A4').value = '##type'
    ws.getCell('B2').value = 'pos'
    ws.mergeCells('B2:D2')
    ws.getCell('E2').value = 'name'
    ws.getCell('B3').value = 'x'
    ws.getCell('C3').value = 'y'
    ws.getCell('D3').value = 'z'
    ws.getCell('B4').value = 'int'
    ws.getCell('C4').value = 'int'
    ws.getCell('D4').value = 'int'
    ws.getCell('E4').value = 'string'
    ws.getCell('B5').value = 1

    const header = parseDataHeader(ws, warnings)!
    expect(header.multiLevel).toBe(true)
    expect(header.dataFirstRow).toBe(5)
    expect(header.columns.map((c) => [c.label, c.name])).toEqual([
      ['pos.x', 'x'],
      ['pos.y', 'y'],
      ['pos.z', 'z'],
      ['name', 'name']
    ])
    expect(warnings.some((w) => w.includes('多级表头'))).toBe(true)
  })

  it('无表头块返回 null', () => {
    const warnings: string[] = []
    const ws = buildSheet([[undefined, 1, 'a']])
    expect(parseDataHeader(ws, warnings)).toBeNull()
    expect(warnings.length).toBe(0)
  })
})

describe('readCellValue', () => {
  it('公式取结果，日期转 ISO，空为 null', () => {
    const ws = buildSheet([[{ formula: '1+1', result: 2 }, new Date('2024-01-01T00:00:00Z')]])
    expect(readCell(ws, 1, 1)).toBe(2)
    expect(readCell(ws, 1, 2)).toBe('2024-01-01T00:00:00.000Z')
    expect(readCell(ws, 1, 3)).toBeNull()
  })
})

function readCell(ws: ExcelJS.Worksheet, row: number, col: number): string | number | boolean | null {
  return readCellValue(ws.getRow(row).getCell(col))
}
