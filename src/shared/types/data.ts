/** 一个 Excel 列与 Schema 字段的绑定关系 */
export interface ColumnBinding {
  /** Excel 列号（1-based，A=1），写回定位用 */
  excelCol: number
  /** 对应 TableSchema.fields 的字段名；文件有列但 schema 无此字段时为 null（只读展示） */
  fieldName: string | null
  /** 表头展示文本（多级表头展平为 parent.child） */
  label: string
  typeText: string
  /** 字段分组（luban group）；空数组 = 全组可见 */
  groups: string[]
  editable: boolean
  readOnlyReason?: string
  /** 注释列（横向表 ## 列）：编辑器按代码注释样式弱化绘制 */
  comment?: boolean
}

/** 行增删能力：横向表（行=字段）与多级表头不支持 */
export interface RowOps {
  canAdd: boolean
  canDelete: boolean
  reason?: string
}

/** 单元格值：按 Schema 类型归一后的 string/number/boolean/null（日期与公式结果统一转 string；bool 列的 1/0 归一为布尔） */
export type CellValue = string | number | boolean | null

export interface DataRow {
  /** Excel 实际行号（1-based），写回与错误定位共用 */
  rowNumber: number
  cells: CellValue[]
  /** 行级可编辑覆写（横向表：值列按每行字段类型判定）；不填时以列级 editable 为准 */
  cellEditable?: boolean[]
}

export interface TableData {
  tableId: string
  tableName: string
  file: string
  sheetName: string
  columns: ColumnBinding[]
  rows: DataRow[]
  warnings: string[]
  rowOps: RowOps
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

export interface RowAddRequest {
  tableId: string
}

export interface RowDeleteRequest {
  tableId: string
  rowNumber: number
}
