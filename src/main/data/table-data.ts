import { existsSync } from 'node:fs'
import { extname } from 'node:path'
import type ExcelJS from 'exceljs'
import type { LubanConf } from '@shared/types/project'
import type { CellValue, ColumnBinding, DataRow, RowOps, TableData } from '@shared/types/data'
import type { FieldSchema, TableSchema } from '@shared/types/schema'
import { getWorkbook, markDirty } from './excel/workbook'
import { parseDataHeader, parseHorizontalHeader, readCellValue, type HorizontalHeader } from './excel/header'
import {
  boolFormFromValues,
  boolKindFromTypeText,
  classifyType,
  isEditableField,
  toBoolValue,
  type BoolForm
} from './excel/cell-io'
import { resolveDataFile } from '@main/schema/normalizer'

interface OpenedTable {
  file: string
  sheetName: string
  fieldByCol: Map<number, FieldSchema>
  /** 横向表：行号 → 行字段（值列编辑用；不可编辑行也记录，用于报错提示） */
  fieldByRow?: Map<number, FieldSchema>
  /** 横向表值列 */
  valueCol?: number
  /** 首条数据行的 Excel 行号；表头行不可增删 */
  dataFirstRow: number
  /** 数据列的 Excel 列号，判空行用 */
  dataCols: number[]
  /** 判定为 bool 的列 → 写回形态（list 表按列） */
  boolByCol?: Map<number, BoolForm>
  /** 判定为 bool 的字段行 → 写回形态（横向表值列按行） */
  boolByRow?: Map<number, BoolForm>
  rowOps: RowOps
}

const opened = new Map<string, OpenedTable>()

/**
 * 会话内新增的空白尾行（tableId → 应展示为空白行的最后一行）。
 * 空白行不落盘（无 cell 即无 XML），所以只记行号；用户一旦填入内容它就变成普通数据行。
 */
const blankTailUntilRow = new Map<string, number>()

export function getOpenedTable(tableId: string): OpenedTable {
  const t = opened.get(tableId)
  if (!t) throw new Error(`表未打开: ${tableId}`)
  return t
}

export function closeOpenedTable(tableId: string): void {
  opened.delete(tableId)
  blankTailUntilRow.delete(tableId)
}

/** 同一数据文件上其他已打开的表（刷新前判断是否会波及它们） */
export function listOpenedOnFile(file: string): string[] {
  return [...opened.entries()].filter(([, t]) => t.file === file).map(([id]) => id)
}

function mustSheet(wb: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) throw new Error(`Sheet 不存在: ${sheetName}`)
  return ws
}

/**
 * bool 判定不依赖外部 schema：先看数据文件自己的 ##type 行，
 * 该行缺失或不可解析时退到整列实际值（有些项目用 1/0 表示 bool）。
 */
function detectBoolForm(typeText: string, values: CellValue[]): BoolForm | null {
  const declared = boolKindFromTypeText(typeText)
  if (declared === 'other') return null
  if (declared === 'bool') return boolFormFromValues(values) ?? 'boolean'
  // 类型未知时要求列内 0/1 都出现过，全 0 的 int/枚举列不是 bool
  return boolFormFromValues(values, true)
}

/** bool 单元格的值归一为布尔（编辑器据此渲染勾选框）；解释不了的值原样留给校验层 */
export function normalizeBool(raw: CellValue, form: BoolForm | null | undefined): CellValue {
  if (!form) return raw
  const b = toBoolValue(raw)
  return b === null ? raw : b
}

/** 从最下行往上找最后一条非空数据行（Excel 的 rowCount 常被空样式行灌水） */
function lastDataRow(ws: ExcelJS.Worksheet, from: number, cols: number[]): number {
  for (let r = ws.actualRowCount; r >= from; r--) {
    const row = ws.getRow(r)
    if (cols.some((c) => {
      const v = readCellValue(row.getCell(c))
      return v !== null && v !== ''
    })) {
      return r
    }
  }
  return from - 1
}

/** 追加一条空白尾行（内存态，Ctrl+S 前不写盘） */
export async function addBlankRow(tableId: string): Promise<void> {
  const t = getOpenedTable(tableId)
  if (!t.rowOps.canAdd) throw new Error(t.rowOps.reason ?? '该表不支持新增行')
  const { wb } = await getWorkbook(t.file)
  const ws = mustSheet(wb, t.sheetName)
  const last = lastDataRow(ws, t.dataFirstRow, t.dataCols)
  blankTailUntilRow.set(tableId, Math.max(last, blankTailUntilRow.get(tableId) ?? 0) + 1)
}

/** 删除一条数据行：真实行 splice 工作表并标脏，空白尾行只回退展示计数 */
export async function deleteDataRow(tableId: string, rowNumber: number): Promise<void> {
  const t = getOpenedTable(tableId)
  if (!t.rowOps.canDelete) throw new Error(t.rowOps.reason ?? '该表不支持删除行')
  if (rowNumber < t.dataFirstRow) throw new Error('表头行不能删除')
  const { wb } = await getWorkbook(t.file)
  const ws = mustSheet(wb, t.sheetName)
  if (rowNumber <= lastDataRow(ws, t.dataFirstRow, t.dataCols)) {
    ws.spliceRows(rowNumber, 1)
    markDirty(t.file)
  }
  const cur = blankTailUntilRow.get(tableId)
  if (cur !== undefined && cur >= rowNumber) blankTailUntilRow.set(tableId, cur - 1)
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
    // schema 声明的分组优先，文件 ##group 行兜底
    const groups = field?.groups.length ? field.groups : c.groups
    if (!field) {
      return {
        excelCol: c.excelCol,
        fieldName: null,
        label: c.label,
        typeText: c.rawType,
        groups,
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
        groups,
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
        groups,
        editable: false,
        readOnlyReason: readOnlyReason(field)
      }
    }
    return {
      excelCol: c.excelCol,
      fieldName: field.name,
      label: c.label,
      typeText: field.rawType,
      groups,
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

  const dataCols = columns.map((c) => c.excelCol)
  const rawRows: CellValue[][] = []
  const rowNumbers: number[] = []
  for (let r = header.dataFirstRow; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r)
    const cells: CellValue[] = columns.map((c) => readCellValue(row.getCell(c.excelCol)))
    if (cells.every((v) => v === null || v === '')) continue
    rawRows.push(cells)
    rowNumbers.push(r)
  }

  const boolByCol = new Map<number, BoolForm>()
  columns.forEach((c, i) => {
    // header.columns 与 columns 一一对应，##type 文本取自数据文件本身
    const form = detectBoolForm(header.columns[i].rawType, rawRows.map((r) => r[i]))
    if (form) boolByCol.set(c.excelCol, form)
  })
  const rows: DataRow[] = rawRows.map((rawCells, i) => ({
    rowNumber: rowNumbers[i],
    cells: rawCells.map((v, j) => normalizeBool(v, boolByCol.get(columns[j].excelCol)))
  }))
  const lastReal = rows.length ? rows[rows.length - 1].rowNumber : header.dataFirstRow - 1
  const blankUntil = blankTailUntilRow.get(table.id) ?? 0
  for (let r = lastReal + 1; r <= blankUntil; r++) {
    rows.push({ rowNumber: r, cells: columns.map(() => null) })
  }

  const rowOps: RowOps = header.multiLevel
    ? { canAdd: false, canDelete: false, reason: '多级表头（嵌套结构）暂不支持增删行' }
    : { canAdd: true, canDelete: true }

  opened.set(table.id, {
    file: abs,
    sheetName: ws.name,
    fieldByCol,
    dataFirstRow: header.dataFirstRow,
    dataCols,
    boolByCol,
    rowOps
  })
  return {
    tableId: table.id,
    tableName: table.name,
    file: abs,
    sheetName: ws.name,
    columns,
    rows,
    warnings,
    rowOps
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
    { excelCol: hh.varCol, fieldName: null, label: '字段', typeText: '', groups: [], editable: false },
    { excelCol: hh.typeCol, fieldName: null, label: '类型', typeText: '', groups: [], editable: false }
  ]
  if (hh.groupCol) {
    columns.push({ excelCol: hh.groupCol, fieldName: null, label: '分组', typeText: '', groups: [], editable: false })
  }
  columns.push({
    excelCol: hh.valueCol,
    fieldName: null,
    label: '值',
    typeText: '',
    groups: [],
    editable: true,
    readOnlyReason: undefined
  })
  if (hh.commentCol) {
    columns.push({
      excelCol: hh.commentCol,
      fieldName: null,
      label: '注释',
      typeText: '',
      groups: [],
      editable: false,
      comment: true
    })
  }

  const rows: DataRow[] = []
  const fieldByRow = new Map<number, FieldSchema>()
  const boolByRow = new Map<number, BoolForm>()
  for (let r = hh.headerRow + 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r)
    const name = String(readCellValue(row.getCell(hh.varCol)) ?? '').trim()
    if (!name || name.startsWith('#')) continue
    const typeText = hh.typeCol ? String(readCellValue(row.getCell(hh.typeCol)) ?? '') : ''
    const groupText = hh.groupCol ? String(readCellValue(row.getCell(hh.groupCol)) ?? '') : ''
    const comment = hh.commentCol ? String(readCellValue(row.getCell(hh.commentCol)) ?? '') : ''
    const value = readCellValue(row.getCell(hh.valueCol))
    const field = fieldByName.get(name)
    const boolForm = detectBoolForm(typeText, [value])
    if (boolForm) boolByRow.set(r, boolForm)
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
        if (c.excelCol === hh.valueCol) return normalizeBool(value, boolForm)
        return comment
      }),
      cellEditable: columns.map((c) =>
        c.excelCol === hh.valueCol ? (field ? isEditableField(field) : false) : false
      )
    })
  }

  const rowOps: RowOps = {
    canAdd: false,
    canDelete: false,
    reason: '横向表每行是一个字段，不支持增删行'
  }
  opened.set(table.id, {
    file: abs,
    sheetName: ws.name,
    fieldByCol: new Map(),
    fieldByRow,
    valueCol: hh.valueCol,
    boolByRow,
    dataFirstRow: hh.headerRow + 1,
    dataCols: [hh.varCol],
    rowOps
  })
  return {
    tableId: table.id,
    tableName: table.name,
    file: abs,
    sheetName: ws.name,
    columns,
    rows,
    warnings,
    rowOps
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
