import type { TableMode } from '@shared/types/schema'

/** 三路来源（xml / excel-def / schema-json）归一前的中间产物，类型串保持原始形态 */
export interface RawField {
  name: string
  rawType: string
  groups: string[]
  comment?: string
}

export interface RawBean {
  id: string
  module: string
  name: string
  parent?: string
  abstract: boolean
  sep?: string
  comment?: string
  groups: string[]
  fields: RawField[]
}

export interface RawEnumItem {
  name: string
  alias?: string
  value: number | string
  comment?: string
}

export interface RawEnum {
  id: string
  module: string
  name: string
  flags: boolean
  unique: boolean
  comment?: string
  items: RawEnumItem[]
}

export interface RawTable {
  id: string
  module: string
  name: string
  mode: TableMode
  index?: string
  valueType: string
  /** 原始 input 描述（"表名@文件" / 目录 / 多段） */
  input: string
  groups: string[]
  comment?: string
  readSchemaFromFile: boolean
}
