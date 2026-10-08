import ExcelJS from 'exceljs'
import type { TableMode } from '@shared/types/schema'
import type { RawBean, RawEnum, RawTable } from './raw-defs'

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
    if ('formula' in v) return String(v.formula)
  }
  return ''
}

interface ColumnHeader {
  col: number
  name: string
  sub: string
}

/** 解析 `##var`（列名行 / *展开子列名行）与 `##` 注释行，返回列头与数据起始行 */
async function readHeader(ws: ExcelJS.Worksheet): Promise<{ columns: ColumnHeader[]; dataFirstRow: number }> {
  const columns: ColumnHeader[] = []
  let dataFirstRow = 0
  let mainDone = false
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = cellText(ws.getRow(r).getCell(1).value).trim()
    if (a === '##var' && !mainDone) {
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        if (col === 1) return
        columns.push({ col, name: cellText(cell.value).trim(), sub: '' })
      })
      mainDone = true
      dataFirstRow = r + 1
      continue
    }
    if (a === '##var' && mainDone) {
      // *展开子列名行（name/alias/type/...）
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        if (col === 1) return
        const c = columns.find((x) => x.col === col)
        if (c) c.sub = cellText(cell.value).trim()
      })
      dataFirstRow = r + 1
      continue
    }
    if (a.startsWith('##')) {
      dataFirstRow = r + 1
      continue
    }
    if (r > 1 && a === '' && dataFirstRow > 0) {
      // 数据行从首个非 ## 行开始（A 列为空）
      dataFirstRow = Math.min(dataFirstRow, r)
      break
    }
  }
  return { columns, dataFirstRow }
}

function splitGroups(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function openSheet(file: string): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  return wb.worksheets[0]
}

export async function parseExcelTableDefines(
  file: string,
  warnings: string[]
): Promise<RawTable[]> {
  const ws = await openSheet(file)
  const { columns, dataFirstRow } = await readHeader(ws)
  const col = (name: string): ColumnHeader | undefined =>
    columns.find((c) => c.name === name && !c.name.startsWith('*'))

  const tables: RawTable[] = []
  for (let r = dataFirstRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fullName = cellText(row.getCell(col('full_name')?.col ?? 2).value).trim()
    if (!fullName) continue
    const dot = fullName.lastIndexOf('.')
    const module = dot > 0 ? fullName.slice(0, dot) : ''
    const name = dot > 0 ? fullName.slice(dot + 1) : fullName
    const modeRaw = cellText(row.getCell(col('mode')?.col ?? 7).value).trim()
    const rsffRaw = cellText(row.getCell(col('read_schema_from_file')?.col ?? 4).value).trim()
    tables.push({
      id: fullName,
      module,
      name,
      mode: (modeRaw || 'map') as TableMode,
      index: cellText(row.getCell(col('index')?.col ?? 6).value).trim() || undefined,
      valueType: cellText(row.getCell(col('value_type')?.col ?? 3).value).trim(),
      input: cellText(row.getCell(col('input')?.col ?? 5).value).trim(),
      groups: splitGroups(cellText(row.getCell(col('group')?.col ?? 8).value)),
      comment: cellText(row.getCell(col('comment')?.col ?? 9).value).trim() || undefined,
      readSchemaFromFile: rsffRaw === 'true' || rsffRaw === 'TRUE'
    })
  }
  if (tables.length === 0) warnings.push(`${file}: 未发现表定义行`)
  return tables
}

export async function parseExcelBeanDefines(
  file: string,
  warnings: string[]
): Promise<RawBean[]> {
  const ws = await openSheet(file)
  const { columns, dataFirstRow } = await readHeader(ws)
  const col = (name: string): ColumnHeader | undefined =>
    columns.find((c) => c.name === name && !c.name.startsWith('*'))
  const fieldCols = columns.filter((c) => c.name.startsWith('*'))

  const beans: RawBean[] = []
  let current: RawBean | null = null
  for (let r = dataFirstRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fullName = cellText(row.getCell(col('full_name')?.col ?? 2).value).trim()
    const fieldName = cellText(
      row.getCell(fieldCols.find((c) => c.sub === 'name')?.col ?? 0).value
    ).trim()
    if (!fullName && !fieldName) continue

    if (fullName) {
      const dot = fullName.lastIndexOf('.')
      const module = dot > 0 ? fullName.slice(0, dot) : ''
      current = {
        id: fullName,
        module,
        name: dot > 0 ? fullName.slice(dot + 1) : fullName,
        parent: cellText(row.getCell(col('parent')?.col ?? 3).value).trim() || undefined,
        abstract: false,
        sep: cellText(row.getCell(col('sep')?.col ?? 5).value).trim() || undefined,
        comment: cellText(row.getCell(col('comment')?.col ?? 6).value).trim() || undefined,
        groups: splitGroups(cellText(row.getCell(col('group')?.col ?? 8).value)),
        fields: []
      }
      beans.push(current)
    }
    if (fieldName && current) {
      const rawType = cellText(
        row.getCell(fieldCols.find((c) => c.sub === 'type')?.col ?? 0).value
      ).trim()
      current.fields.push({
        name: fieldName,
        rawType,
        groups: splitGroups(
          cellText(row.getCell(fieldCols.find((c) => c.sub === 'group')?.col ?? 0).value)
        ),
        comment:
          cellText(row.getCell(fieldCols.find((c) => c.sub === 'comment')?.col ?? 0).value).trim() ||
          undefined
      })
    }
  }
  if (beans.length === 0) warnings.push(`${file}: 未发现 bean 定义行`)
  return beans
}

export async function parseExcelEnumDefines(
  file: string,
  warnings: string[]
): Promise<RawEnum[]> {
  const ws = await openSheet(file)
  const { columns, dataFirstRow } = await readHeader(ws)
  const col = (name: string): ColumnHeader | undefined =>
    columns.find((c) => c.name === name && !c.name.startsWith('*'))
  const itemCols = columns.filter((c) => c.name.startsWith('*'))

  const enums: RawEnum[] = []
  let current: RawEnum | null = null
  for (let r = dataFirstRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fullName = cellText(row.getCell(col('full_name')?.col ?? 2).value).trim()
    const itemName = cellText(
      row.getCell(itemCols.find((c) => c.sub === 'name')?.col ?? 0).value
    ).trim()
    if (!fullName && !itemName) continue

    if (fullName) {
      const dot = fullName.lastIndexOf('.')
      const module = dot > 0 ? fullName.slice(0, dot) : ''
      const flagsRaw = cellText(row.getCell(col('flags')?.col ?? 3).value).trim()
      const uniqueRaw = cellText(row.getCell(col('unique')?.col ?? 4).value).trim()
      current = {
        id: fullName,
        module,
        name: dot > 0 ? fullName.slice(dot + 1) : fullName,
        flags: flagsRaw === 'true' || flagsRaw === 'TRUE',
        unique: uniqueRaw === 'true' || uniqueRaw === 'TRUE',
        comment: cellText(row.getCell(col('comment')?.col ?? 5).value).trim() || undefined,
        items: []
      }
      enums.push(current)
    }
    if (itemName && current) {
      const rawValue = cellText(
        row.getCell(itemCols.find((c) => c.sub === 'value')?.col ?? 0).value
      ).trim()
      const num = Number(rawValue)
      current.items.push({
        name: itemName,
        alias:
          cellText(row.getCell(itemCols.find((c) => c.sub === 'alias')?.col ?? 0).value).trim() ||
          undefined,
        value: rawValue !== '' && !Number.isNaN(num) ? num : rawValue,
        comment:
          cellText(row.getCell(itemCols.find((c) => c.sub === 'comment')?.col ?? 0).value).trim() ||
          undefined
      })
    }
  }
  if (enums.length === 0) warnings.push(`${file}: 未发现 enum 定义行`)
  return enums
}
