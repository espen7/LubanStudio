import type { CellValue } from '@shared/types/data'
import type { FieldSchema, TypeRef } from '@shared/types/schema'
import { parseType } from '@main/schema/type-parser'

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
export function parseCellText(field: FieldSchema, text: string | null): CellValue {
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

/**
 * bool 判定与写回形态。
 * 判定不依赖外部 schema：先看 Excel 自己的 ##type 行，##type 缺失/不可解析时
 * 再看整列实际值（不少项目就用 1/0 表示 bool）。
 * 写回跟随该列原有形态，避免把 1/0 列改成布尔单元格。
 */
export type BoolForm = 'boolean' | 'number' | 'string'

/** ##type 文本对 bool 的判定；unknown = 没有可用类型信息，交给列值 */
export function boolKindFromTypeText(rawType: string): 'bool' | 'other' | 'unknown' {
  const t = rawType.trim()
  if (!t) return 'unknown'
  try {
    const { type } = parseType(t)
    if (type.kind === 'unresolved') return 'unknown'
    return classifyType(type) === 'bool' ? 'bool' : 'other'
  } catch {
    return 'unknown'
  }
}

function boolish(v: CellValue): boolean {
  if (v === null || v === '') return true
  if (typeof v === 'boolean') return true
  if (typeof v === 'number') return v === 0 || v === 1
  const t = String(v).trim().toLowerCase()
  return t === 'true' || t === 'false' || t === '0' || t === '1'
}

/**
 * 列值是否整体呈 bool 形态；是则返回其存储形态，否则 null。
 * requireMixed=true 时列内必须同时出现真值和假值——用于类型未知的列，
 * 避免把全 0 的 int/枚举列当成 bool。
 */
export function boolFormFromValues(values: CellValue[], requireMixed = false): BoolForm | null {
  let nBool = 0
  let nNum = 0
  let nStr = 0
  let nTrue = 0
  let nFalse = 0
  for (const v of values) {
    if (!boolish(v)) return null
    if (v === null || v === '') continue
    if (typeof v === 'boolean') nBool++
    else if (typeof v === 'number') nNum++
    else nStr++
    if (toBoolValue(v)) nTrue++
    else nFalse++
  }
  if (nBool + nNum + nStr === 0) return null
  if (requireMixed && (nTrue === 0 || nFalse === 0)) return null
  if (nBool >= nNum && nBool >= nStr) return 'boolean'
  if (nNum >= nStr) return 'number'
  return 'string'
}

/** bool 列的单元格值 → 布尔（编辑器据此渲染勾选框）；解释不了的值原样留给校验层 */
export function toBoolValue(raw: CellValue): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1 ? true : raw === 0 ? false : null
  const t = String(raw).trim().toLowerCase()
  if (t === 'true' || t === '1') return true
  if (t === 'false' || t === '0') return false
  return null
}

/** 勾选框/文本输入 → 该列原有形态的 Excel 值 */
export function parseBoolText(text: string | null, form: BoolForm): CellValue {
  if (text === null || text === '') return null
  const t = text.trim().toLowerCase()
  if (t !== 'true' && t !== 'false' && t !== '1' && t !== '0') {
    throw new Error(`'${text}' 不是 bool 类型值`)
  }
  const b = t === 'true' || t === '1'
  if (form === 'number') return b ? 1 : 0
  if (form === 'string') return String(b)
  return b
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
