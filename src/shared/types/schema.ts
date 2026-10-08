export type SchemaSource = 'xml' | 'excel-def' | 'schema-json'

export type TypeRef =
  | { kind: 'primitive'; name: string }
  | { kind: 'enum'; ref: string }
  | { kind: 'bean'; ref: string }
  | { kind: 'unresolved'; ref: string }
  | { kind: 'nullable'; inner: TypeRef }
  | { kind: 'list' | 'array' | 'set'; element: TypeRef }
  | { kind: 'map'; key: TypeRef; value: TypeRef }

export interface RefOption {
  table: string
  field?: string
  nullable: boolean
}

export interface FieldOptions {
  sep?: string
  ref?: RefOption
  path?: string
  default?: string
  /** 类型串 `!` 后缀：必填，不允许用默认值填充 */
  required?: boolean
  /** 其余校验器/属性原样保留（range/set/size/escape/...） */
  attrs: Record<string, string>
}

export interface FieldSchema {
  name: string
  type: TypeRef
  rawType: string
  options: FieldOptions
  groups: string[]
  comment?: string
}

export type TableMode = 'map' | 'list' | 'one'

export interface TableInput {
  tableName: string
  file: string
}

export interface TableSchema {
  id: string
  module: string
  name: string
  mode: TableMode
  index?: string
  valueType: string
  inputs: TableInput[]
  groups: string[]
  comment?: string
  readSchemaFromFile: boolean
  fields: FieldSchema[]
}

export interface BeanSchema {
  id: string
  module: string
  name: string
  parent?: string
  abstract: boolean
  sep?: string
  comment?: string
  fields: FieldSchema[]
}

export interface EnumItem {
  name: string
  alias?: string
  value: number | string
  comment?: string
}

export interface EnumSchema {
  id: string
  module: string
  name: string
  flags: boolean
  unique: boolean
  comment?: string
  items: EnumItem[]
}

export interface SchemaModel {
  source: SchemaSource
  tables: TableSchema[]
  beans: BeanSchema[]
  enums: EnumSchema[]
  warnings: string[]
  generatedAt: number
}

export function emptyOptions(): FieldOptions {
  return { attrs: {} }
}
