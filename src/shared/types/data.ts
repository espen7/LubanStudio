/** 一个 Excel 列与 Schema 字段的绑定关系 */
export interface ColumnBinding {
  /** Excel 列号（1-based，A=1），写回定位用 */
  excelCol: number
  /** 对应 TableSchema.fields 的字段名；文件有列但 schema 无此字段时为 null（只读展示） */
  fieldName: string | null
  /** 表头展示文本（多级表头展平为 parent.child） */
  label: string
  typeText: string
  editable: boolean
  readOnlyReason?: string
}

/** 单元格原始值：string/number/boolean/null（日期与公式结果统一转 string） */
export type CellValue = string | number | boolean | null

export interface DataRow {
  /** Excel 实际行号（1-based），写回与错误定位共用 */
  rowNumber: number
  cells: CellValue[]
}

export interface TableData {
  tableId: string
  tableName: string
  file: string
  sheetName: string
  columns: ColumnBinding[]
  rows: DataRow[]
  warnings: string[]
}

/** 编辑请求：值统一为用户输入文本，null 表示清空；类型解析在 main 侧按 TypeRef 进行 */
export interface CellEdit {
  tableId: string
  rowNumber: number
  excelCol: number
  text: string | null
}

export interface DataSaveResult {
  saved: boolean
  backupPath?: string
}

export interface DataCloseRequest {
  tableId: string
  /** 脏表强制丢弃内存改动 */
  force?: boolean
}
