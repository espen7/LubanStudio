import type ExcelJS from 'exceljs'
import type { FieldSchema } from '@shared/types/schema'
import { parseCellText } from './cell-io'

export interface PendingEdit {
  rowNumber: number
  excelCol: number
  field: FieldSchema
  text: string | null
}

/** 只对目标单元格赋 value，不动 style（保真核心约束） */
export function applyEdits(wb: ExcelJS.Workbook, sheetName: string, edits: PendingEdit[]): void {
  const ws = wb.getWorksheet(sheetName)
  if (!ws) throw new Error(`Sheet 不存在: ${sheetName}`)
  for (const e of edits) {
    const cell = ws.getRow(e.rowNumber).getCell(e.excelCol)
    cell.value = parseCellText(e.field, e.text)
  }
}
