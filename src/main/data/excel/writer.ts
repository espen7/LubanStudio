import type ExcelJS from 'exceljs'
import type { CellValue } from '@shared/types/data'
import type { FieldSchema } from '@shared/types/schema'
import { parseBoolText, parseCellText, type BoolForm } from './cell-io'

export interface PendingEdit {
  rowNumber: number
  excelCol: number
  field: FieldSchema
  text: string | null
  /** 该列/行按内容判定为 bool 时的写回形态（跟随原有形态），优先于字段类型声明 */
  boolForm?: BoolForm
}

/** 只对目标单元格赋 value，不动 style（保真核心约束）；返回写入的规范值供界面回填 */
export function applyEdits(
  wb: ExcelJS.Workbook,
  sheetName: string,
  edits: PendingEdit[]
): CellValue[] {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) throw new Error(`Sheet 不存在: ${sheetName}`)
  return edits.map((e) => {
    const cell = ws.getRow(e.rowNumber).getCell(e.excelCol)
    const value = e.boolForm ? parseBoolText(e.text, e.boolForm) : parseCellText(e.field, e.text)
    cell.value = value
    return value
  })
}
