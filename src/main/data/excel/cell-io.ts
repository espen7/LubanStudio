import type ExcelJS from 'exceljs'
import type { FieldSchema, TypeRef } from '@shared/types/schema'

const NUMBER_TYPES = new Set([
  'int', 'long', 'short', 'byte', 'uint', 'ulong', 'ushort', 'sbyte', 'float', 'double'
])
const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'uint', 'ulong', 'ushort', 'sbyte'])

export type CellKind = 'number' | 'bool' | 'string' | 'list' | 'readonly'

/** 类型分类：决定 GDG 单元格编辑器形态与解析规则 */
export function classifyType(type: TypeRef): CellKind {
  switch (type.kind) {
    case 'primitive': {
      const n = type.name.toLowerCase()
      if (NUMBER_TYPES.has(n)) return 'number'
      if (n === 'bool' || n === 'boolean') return 'bool'
      return 'string'
    }
    case 'enum':
      return 'string'
    case 'nullable':
      return classifyType(type.inner)
    case 'list':
    case 'array':
    case 'set':
      return isEditableElement(type.element) ? 'list' : 'readonly'
    default:
      return 'readonly'
  }
}

function isEditableElement(t: TypeRef): boolean {
  switch (t.kind) {
    case 'primitive':
    case 'enum':
      return true
    case 'nullable':
      return isEditableElement(t.inner)
    default:
      return false
  }
}

/** 字段是否可编辑（bean/map/tuple/text/unresolved 均只读） */
export function isEditableField(field: FieldSchema): boolean {
  return classifyType(field.type) !== 'readonly'
}

const DATE_NAMES = new Set(['date', 'time', 'datetime'])

function parseNumber(typeName: string, text: string): number {
  const n = Number(text.trim())
  if (!Number.isFinite(n)) throw new Error(`'${text}' 不是 ${typeName} 类型值`)
  if (INT_TYPES.has(typeName) && !Number.isInteger(n)) throw new Error(`'${text}' 不是 ${typeName} 整数值`)
  return n
}

/** 用户输入文本 → Excel 单元格值；解析失败抛错（不静默写坏数据） */
export function parseCellText(field: FieldSchema, text: string | null): ExcelJS.CellValue {
  if (text === null || text === '') return null
  const kind = classifyType(field.type)
  switch (kind) {
    case 'number': {
      const prim = primitiveName(field.type)
      return parseNumber(prim ?? 'int', text)
    }
    case 'bool': {
      const t = text.trim().toLowerCase()
      if (t === 'true' || t === '1') return true
      if (t === 'false' || t === '0') return false
      throw new Error(`'${text}' 不是 bool 类型值`)
    }
    case 'string': {
      const prim = primitiveName(field.type)
      // date/time/datetime 保持文本写回，避免格式漂移
      if (prim && DATE_NAMES.has(prim.toLowerCase())) return text
      return text
    }
    case 'list':
      // sep 列表按原始分隔串整体写回，逐项校验留给前端校验层
      return text
    case 'readonly':
      throw new Error(`字段 ${field.name}（${field.rawType}）是只读类型，不能编辑`)
  }
}

function primitiveName(type: TypeRef): string | null {
  if (type.kind === 'primitive') return type.name
  if (type.kind === 'nullable') return primitiveName(type.inner)
  return null
}

/** 编辑器输入是否可能被接受（GDG 按键过滤用）；不做完整校验 */
export function isCharAllowed(field: FieldSchema, ch: string): boolean {
  const kind = classifyType(field.type)
  if (kind === 'number') return /^[0-9eE+\-.]$/.test(ch)
  if (kind === 'bool') return /^[a-zA-Z01]$/.test(ch)
  return true
}
