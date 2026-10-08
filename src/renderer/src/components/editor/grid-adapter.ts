import { GridCellKind } from '@glideapps/glide-data-grid'
import type { GridColumn, GridCell, EditableGridCell } from '@glideapps/glide-data-grid'
import type { CellValue, ColumnBinding } from '@shared/types/data'

export function toGridColumns(columns: ColumnBinding[], widthOverride?: Record<string, number>): GridColumn[] {
  return columns.map((c) => ({
    id: String(c.excelCol),
    title: c.label,
    width: widthOverride?.[String(c.excelCol)] ?? 132
  }))
}

export function toGridCell(column: ColumnBinding, value: CellValue, cellEditable?: boolean): GridCell {
  const editable = cellEditable ?? column.editable
  if (editable && typeof value === 'number') {
    return {
      kind: GridCellKind.Number,
      data: value,
      displayData: String(value),
      allowOverlay: true
    }
  }
  if (editable && typeof value === 'boolean') {
    return {
      kind: GridCellKind.Boolean,
      data: value,
      allowOverlay: false
    }
  }
  const display = value === null ? '' : String(value)
  return {
    kind: GridCellKind.Text,
    data: display,
    displayData: display,
    allowOverlay: true,
    readonly: !editable
  }
}

/** 编辑器提交值 → 用户输入文本（解析归 main 侧按 TypeRef 做） */
export function editToText(newVal: EditableGridCell): string {
  if (newVal.kind === GridCellKind.Number) return String(newVal.data)
  if (newVal.kind === GridCellKind.Boolean) return newVal.data ? 'true' : 'false'
  if (newVal.kind === GridCellKind.Text || newVal.kind === GridCellKind.Markdown) {
    return typeof newVal.data === 'string' ? newVal.data : ''
  }
  if (newVal.kind === GridCellKind.Uri) return newVal.data
  return ''
}

export function cellTitle(column: ColumnBinding): string {
  if (column.editable) return column.label
  return `${column.label}（${column.readOnlyReason ?? '只读'}）`
}
