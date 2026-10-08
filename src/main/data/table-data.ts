import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import type ExcelJS from 'exceljs'
import type { LubanConf } from '@shared/types/project'
import type { CellValue, ColumnBinding, DataRow, TableData } from '@shared/types/data'
import type { FieldSchema, TableSchema } from '@shared/types/schema'
import { getWorkbook } from './excel/workbook'
import { parseDataHeader, parseHorizontalHeader, readCellValue, type HorizontalHeader } from './excel/header'
import { classifyType, isEditableField } from './excel/cell-io'
import { resolveDataFile } from '@main/schema/normalizer'

interface OpenedTable {
  file: string
  sheetName: string
  fieldByCol: Map<number, FieldSchema>
  /** 横向表：行号 → 行字段（值列编辑用；不可编辑行也记录，用于报错提示） */
  fieldByRow?: Map<number, FieldSchema>
  /** 横向表值列 */
  valueCol?: number
}

const opened = new Map<string, OpenedTable>()

export function getOpenedTable(tableId: string): OpenedTable {
  const t = opened.get(tableId)
  if (!t) throw new Error(`表未打开: ${tableId}`)
  return t
}

export function closeOpenedTable(tableId: string): void {
  opened.delete(tableId)
}

/** input.file 形如 `a.xlsx` 或 `a.xlsx@Sheet2`；文件名里的 @ 只有扩展名后一段才算 sheet */
function splitSheetRef(file: string): { file: string; sheetName?: string } {
  const dot = file.lastIndexOf('.')
  const at = file.indexOf('@', dot)
  if (at < 0) return { file }
  return { file: file.slice(0, at), sheetName: file.slice(at + 1) }
}

function pickWorksheet(
  wb: ExcelJS.Workbook,
  data: { sheetName?: string; tableName: string; file: string },
  warnings: string[]
): ExcelJS.Worksheet {
  if (data.sheetName) {
    const ws = wb.getWorksheet(data.sheetName)
    if (!ws) throw new Error(`${data.file} 中不存在 Sheet: ${data.sheetName}`)
    return ws
  }
  const candidates = [data.tableName].filter(Boolean)
  for (const candidate of candidates) {
    const ws = wb.getWorksheet(candidate)
    if (ws) return ws
  }
  const first = wb.worksheets[0]
  if (candidates.length > 0) {
    warnings.push(`${data.file}: 未匹配到 Sheet「${data.tableName}」，使用第一个 Sheet「${first.name}」`)
  }
  return first
}

export async function openTableData(table: TableSchema, conf: LubanConf): Promise<TableData> {
  if (table.inputs.length === 0) throw new Error(`表 ${table.id} 没有数据文件`)
  const warnings: string[] = []
  const { tableName, file: rawFile } = table.inputs[0]
  if (extname(rawFile).toLowerCase() !== '.xlsx') {
    throw new Error(`暂只支持 Excel 数据文件，${table.id} 的数据源是 ${rawFile}`)
  }
  const { file, sheetName } = splitSheetRef(rawFile)
  const abs = resolveDataFile(conf, file)
  if (!existsSync(abs)) throw new Error(`数据文件不存在: ${abs}`)

  const { wb, warnings: loadWarnings } = await getWorkbook(abs)
  warnings.push(...loadWarnings)
  const ws = pickWorksheet(wb, { sheetName, tableName, file }, warnings)

  const horizontal = parseHorizontalHeader(ws)
  const fieldByName = new Map(table.fields.map((f) => [f.name, f]))
  if (horizontal) {
    return buildHorizontalTableData(table, ws, horizontal, fieldByName, abs, warnings)
  }

  const header = parseDataHeader(ws, warnings)
  if (!header) {
    throw new Error(`${file}: 未找到 ##var 表头块或横向表标记行（Sheet「${ws.name}」）`)
  }
  const columns: ColumnBinding[] = header.columns.map((c) => {
    const field = fieldByName.get(c.name)
    if (!field) {
      return {
        excelCol: c.excelCol,
        fieldName: null,
        label: c.label,
        typeText: c.rawType,
        editable: false,
        readOnlyReason: 'Schema 中无此字段'
      }
    }
    if (header.multiLevel) {
      return {
        excelCol: c.excelCol,
        fieldName: field.name,
        label: c.label,
        typeText: field.rawType,
        editable: false,
        readOnlyReason: '多级表头只读'
      }
    }
    if (!isEditableField(field)) {
      return {
        excelCol: c.excelCol,
        fieldName: field.name,
        label: c.label,
        typeText: field.rawType,
        editable: false,
        readOnlyReason: readOnlyReason(field)
      }
    }
    return {
      excelCol: c.excelCol,
      fieldName: field.name,
      label: c.label,
      typeText: field.rawType,
      editable: true
    }
  })

  const fieldByCol = new Map<number, FieldSchema>()
  for (const c of columns) {
    if (c.fieldName) {
      const f = fieldByName.get(c.fieldName)
      if (f) fieldByCol.set(c.excelCol, f)
    }
  }

  const rows: DataRow[] = []
  for (let r = header.dataFirstRow; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r)
    const cells: CellValue[] = columns.map((c) => readCellValue(row.getCell(c.excelCol)))
    if (cells.every((v) => v === null || v === '')) continue
    rows.push({ rowNumber: r, cells })
  }

  opened.set(table.id, { file: abs, sheetName: ws.name, fieldByCol })
  return {
    tableId: table.id,
    tableName: table.name,
    file: abs,
    sheetName: ws.name,
    columns,
    rows,
    warnings
  }
}

/** 横向表（one 表转置格式）：行=字段，值列编辑。列固定为 字段/类型/分组/值/注释 */
function buildHorizontalTableData(
  table: TableSchema,
  ws: ExcelJS.Worksheet,
  hh: HorizontalHeader,
  fieldByName: Map<string, FieldSchema>,
  abs: string,
  warnings: string[]
): TableData {
  warnings.push(
    `${ws.name}: 横向表（one 单例格式），每行一个字段；支持编辑「值」列`
  )

  const columns: ColumnBinding[] = [
    { excelCol: hh.varCol, fieldName: null, label: '字段', typeText: '', editable: false },
    { excelCol: hh.typeCol, fieldName: null, label: '类型', typeText: '', editable: false }
  ]
  if (hh.groupCol) {
    columns.push({ excelCol: hh.groupCol, fieldName: null, label: '分组', typeText: '', editable: false })
  }
  columns.push({
    excelCol: hh.valueCol,
    fieldName: null,
    label: '值',
    typeText: '',
    editable: true,
    readOnlyReason: undefined
  })
  if (hh.commentCol) {
    columns.push({ excelCol: hh.commentCol, fieldName: null, label: '注释', typeText: '', editable: false })
  }

  const rows: DataRow[] = []
  const fieldByRow = new Map<number, FieldSchema>()
  for (let r = hh.headerRow + 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r)
    const name = String(readCellValue(row.getCell(hh.varCol)) ?? '').trim()
    if (!name || name.startsWith('#')) continue
    const typeText = hh.typeCol ? String(readCellValue(row.getCell(hh.typeCol)) ?? '') : ''
    const groupText = hh.groupCol ? String(readCellValue(row.getCell(hh.groupCol)) ?? '') : ''
    const comment = hh.commentCol ? String(readCellValue(row.getCell(hh.commentCol)) ?? '') : ''
    const value = readCellValue(row.getCell(hh.valueCol))
    const field = fieldByName.get(name)
    fieldByRow.set(
      r,
      field ?? {
        name,
        type: { kind: 'unresolved', ref: typeText },
        rawType: typeText,
        options: { attrs: {} },
        groups: []
      }
    )
    rows.push({
      rowNumber: r,
      cells: columns.map((c) => {
        if (c.excelCol === hh.varCol) return name
        if (c.excelCol === hh.typeCol) return typeText
        if (c.excelCol === hh.groupCol) return groupText
        if (c.excelCol === hh.valueCol) return value
        return comment
      }),
      cellEditable: columns.map((c) =>
        c.excelCol === hh.valueCol ? (field ? isEditableField(field) : false) : false
      )
    })
  }

  opened.set(table.id, { file: abs, sheetName: ws.name, fieldByCol: new Map(), fieldByRow, valueCol: hh.valueCol })
  return {
    tableId: table.id,
    tableName: table.name,
    file: abs,
    sheetName: ws.name,
    columns,
    rows,
    warnings
  }
}

function readOnlyReason(field: FieldSchema): string {
  const kind = classifyType(field.type)
  if (kind === 'readonly') {
    return field.type.kind === 'bean'
      ? '嵌套结构只读'
      : field.type.kind === 'unresolved'
        ? `类型未解析: ${field.type.ref}`
        : '复杂类型只读'
  }
  return '只读'
}
