import type ExcelJS from 'exceljs'

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
  }
  return ''
}

export interface HeaderColumn {
  excelCol: number
  /** 展平后的表头标签（多级为 parent.child） */
  label: string
  /** 叶子字段名（单级=列名；多级=最后一段），用于匹配 Schema 字段 */
  name: string
  /** ##type 行的原始类型文本 */
  rawType: string
  /** ##group 行的分组 */
  groups: string[]
  comment?: string
}

export interface DataHeader {
  sheetName: string
  dataFirstRow: number
  multiLevel: boolean
  columns: HeaderColumn[]
}

/** 横向表（转置，one 表常用）：标记行一行含 ##column#var/##type/##group/##，每行一个字段 */
export interface HorizontalHeader {
  sheetName: string
  /** 标记行行号 */
  headerRow: number
  varCol: number
  typeCol: number
  groupCol: number
  commentCol: number
  /** 无标记的值列（取第一个） */
  valueCol: number
}

/** 取单元格文本；合并单元格取 master 值（多级表头父字段跨列合并） */
function mergedText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  const cell = ws.getRow(row).getCell(col)
  const master = cell.isMerged ? cell.master : cell
  return cellText(master?.value).trim()
}

export function parseDataHeader(ws: ExcelJS.Worksheet, warnings: string[]): DataHeader | null {
  const lastScanRow = Math.min(ws.rowCount, 20)
  let firstVarRow = 0
  let firstRowIsMarker = false
  for (let r = 1; r <= lastScanRow; r++) {
    const a = mergedText(ws, r, 1)
    if (a === '##var') {
      firstVarRow = r
      break
    }
    if (a === '##' && r === 1) {
      firstVarRow = r
      firstRowIsMarker = true
      break
    }
  }
  if (!firstVarRow) return null

  // 连续的 ##var 行（多级表头会有多行）；首行的 ## 只是标记，不算 var 行
  const varRows: number[] = firstRowIsMarker ? [] : [firstVarRow]
  let typeRow = 0
  let groupRow = 0
  let commentRow = 0
  for (let r = firstVarRow + 1; r <= Math.min(ws.rowCount, firstVarRow + 8); r++) {
    const a = mergedText(ws, r, 1)
    if (a === '##var') varRows.push(r)
    else if (a === '##type') typeRow = r
    else if (a === '##group') groupRow = r
    else if (a.startsWith('##')) {
      if (!commentRow) commentRow = r
    } else break
  }
  if (varRows.length === 0) return null

  // ##type/##group/##comment 也可能排在 ##var 之上（部分项目先写类型再写变量名），
  // 只向上补齐下方没找到的标记行；遇到非标记行即停
  for (let r = firstVarRow - 1; r >= 1; r--) {
    const a = mergedText(ws, r, 1)
    if (a === '##type') {
      if (!typeRow) typeRow = r
    } else if (a === '##group') {
      if (!groupRow) groupRow = r
    } else if (a === '##comment') {
      if (!commentRow) commentRow = r
    } else break
  }

  const multiLevel = varRows.length > 1
  if (multiLevel) warnings.push(`${ws.name}: 多级表头（嵌套 bean），列只读展示`)

  // 列范围：所有 ##var 行中最右的非空 cell（首行可能是 ## 标记行，只有 A 列）
  let lastCol = 1
  for (const r of varRows) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (_cell, col) => {
      if (col > lastCol) lastCol = col
    })
  }

  const columns: HeaderColumn[] = []
  for (let col = 2; col <= lastCol; col++) {
    const parts = varRows.map((r) => mergedText(ws, r, col)).filter(Boolean)
    if (parts.length === 0) continue
    const name = parts[parts.length - 1]
    if (name.startsWith('#')) continue
    columns.push({
      excelCol: col,
      label: parts.join('.'),
      name,
      rawType: typeRow ? mergedText(ws, typeRow, col) : '',
      groups: groupRow
        ? cellText(ws.getRow(groupRow).getCell(col).value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      comment: commentRow ? mergedText(ws, commentRow, col) || undefined : undefined
    })
  }

  const headerLast = Math.max(...varRows, typeRow, groupRow, commentRow)
  return { sheetName: ws.name, dataFirstRow: headerLast + 1, multiLevel, columns }
}

/** 识别横向表标记行（`##column#var` 等标记横排一行）；不是横向表返回 null */
export function parseHorizontalHeader(ws: ExcelJS.Worksheet): HorizontalHeader | null {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    let headerRow = 0
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'string' && cell.value.trim().startsWith('##column')) {
        headerRow = r
      }
    })
    if (!headerRow) continue

    let varCol = 0
    let typeCol = 0
    let groupCol = 0
    let commentCol = 0
    let valueCol = 0
    const unmarked: number[] = []
    for (let c = 1; c <= ws.columnCount; c++) {
      const text = cellText(ws.getRow(headerRow).getCell(c).value).trim()
      if (!text) {
        unmarked.push(c)
        continue
      }
      if (text.startsWith('##column')) {
        if (!varCol) varCol = c
      } else if (text.startsWith('##type')) {
        typeCol = c
      } else if (text.startsWith('##group')) {
        groupCol = c
      } else if (text.startsWith('##')) {
        if (!commentCol) commentCol = c
      } else {
        unmarked.push(c)
      }
    }
    // 值列 = 第一个「未标记且数据区有内容」的列（标记行夹在标记列之间的空列也算）
    for (const c of unmarked) {
      for (let r = headerRow + 1; r <= ws.actualRowCount; r++) {
        if (ws.getRow(r).getCell(c).value !== null && ws.getRow(r).getCell(c).value !== undefined) {
          valueCol = c
          break
        }
      }
      if (valueCol) break
    }
    if (!varCol || !valueCol) return null
    return {
      sheetName: ws.name,
      headerRow,
      varCol,
      typeCol,
      groupCol,
      commentCol,
      valueCol
    }
  }
  return null
}

/** 单元格读值 → 展示值（日期/公式/富文本统一转 string） */
export function readCellValue(cell: ExcelJS.Cell): string | number | boolean | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) {
      const r = v.result as ExcelJS.CellValue
      if (r === null || r === undefined) return null
      if (typeof r === 'string' || typeof r === 'number' || typeof r === 'boolean') return r
      if (r instanceof Date) return r.toISOString()
      return String(r)
    }
    if ('text' in v) return String(v.text)
    if ('formula' in v) return String(v.formula)
  }
  return String(v)
}
