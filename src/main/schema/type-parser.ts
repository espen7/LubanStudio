import type { FieldOptions, RefOption, TypeRef } from '@shared/types/schema'

const PRIMITIVES = new Set([
  'bool',
  'byte',
  'short',
  'ushort',
  'int',
  'uint',
  'long',
  'ulong',
  'float',
  'double',
  'string',
  'datetime',
  'text',
  'bigint',
  'uint8',
  'vec2',
  'vec3',
  'vec4',
  'fint16',
  'fint32',
  'fint64'
])

const CONTAINERS = new Set(['list', 'array', 'set', 'map'])

/** 值为逗号列表的属性（吞掉值内的分隔符） */
const LIST_VALUE_ATTRS = new Set(['set', 'range', 'size'])

interface Segments {
  head: string
  elements: string[]
}

/**
 * 顶层按分隔符切分：跳过括号内部；`#属性=值` 中，
 * 列表值属性（set/range/size）吞掉值内的分隔符，普通属性值在分隔符处结束。
 */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === '#' && depth === 0) {
      let j = i + 1
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++
      const name = s.slice(i + 1, j)
      if (s[j] === '(') {
        const close = matchBracket(s, j)
        if (close < 0) throw new Error(`属性括号不匹配: ${s}`)
        i = close + 1
        continue
      }
      if (s[j] === '=') {
        if (name === 'sep') {
          // sep 的值是单个分隔字符（可以是 , ; | 本身）
          i = j + 2
          continue
        }
        if (LIST_VALUE_ATTRS.has(name)) {
          const next = s.indexOf('#', j + 1)
          i = next < 0 ? s.length : next
          continue
        }
        i = j + 1
        continue
      }
      i = j
      continue
    } else if (c === sep && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
    i++
  }
  out.push(s.slice(start))
  return out
}

/** 匹配混合括号（数学区间 `(1, 10]` 等用 [ ] 收尾） */
function matchBracket(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') depth++
    else if (s[i] === ')' || s[i] === ']') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 拆出 `(container#attrs)` 或 `container#attrs` 头部与元素列表 */
function splitContainer(s: string): Segments | null {
  const trimmed = s.trim()
  if (trimmed.startsWith('(')) {
    const close = matchBracket(trimmed, 0)
    if (close < 0) throw new Error(`括号不匹配: ${s}`)
    const head = trimmed.slice(1, close)
    const rest = trimmed.slice(close + 1)
    const elements = rest.startsWith(',')
      ? splitTopLevel(rest.slice(1), ',').map((x) => x.trim()).filter(Boolean)
      : []
    return { head, elements }
  }
  for (const c of CONTAINERS) {
    if (trimmed === c || trimmed.startsWith(`${c}#`) || trimmed.startsWith(`${c},`)) {
      // map#...;K;V 分号形态
      if (trimmed.startsWith(`${c}#`) && trimmed.includes(';')) {
        const parts = splitTopLevel(trimmed, ';').map((x) => x.trim())
        return { head: parts[0], elements: parts.slice(1) }
      }
      if (trimmed.startsWith(`${c},`)) {
        const elements = splitTopLevel(trimmed.slice(c.length + 1), ',')
          .map((x) => x.trim())
          .filter(Boolean)
        return { head: c, elements }
      }
      // list#sep=|,int：属性链后跟 `,元素`，属性值内逗号已由 splitTopLevel 处理
      if (trimmed.startsWith(`${c}#`)) {
        const parts = splitTopLevel(trimmed, ',').map((x) => x.trim())
        if (parts.length > 1) return { head: parts[0], elements: parts.slice(1).filter(Boolean) }
      }
      return { head: trimmed, elements: [] }
    }
  }
  return null
}

function parseRefOption(v: string): RefOption {
  const nullable = v.endsWith('?')
  const body = nullable ? v.slice(0, -1) : v
  const at = body.indexOf('@')
  if (at >= 0) {
    return { field: body.slice(0, at), table: body.slice(at + 1), nullable }
  }
  return { table: body, nullable }
}

/** 解析 `#` 属性链：`#sep=,`、`#(range=[1,10])`、`#kind=cat#type=sss` */
function parseAttrs(s: string, options: FieldOptions): string {
  let rest = s
  while (rest.startsWith('#')) {
    rest = rest.slice(1)
    if (rest.startsWith('(')) {
      const close = matchBracket(rest, 0)
      if (close < 0) throw new Error(`属性括号不匹配: ${s}`)
      const body = rest.slice(1, close)
      const eq = body.indexOf('=')
      const name = (eq >= 0 ? body.slice(0, eq) : body).trim()
      const value = eq >= 0 ? body.slice(eq + 1).trim() : ''
      if (name) options.attrs[name] = value
      rest = rest.slice(close + 1)
      continue
    }
    const m = /^[A-Za-z0-9_]+/.exec(rest)
    const name = m?.[0] ?? ''
    rest = rest.slice(name.length)
    if (rest.startsWith('=')) {
      let value: string
      let next: number
      if (name === 'sep') {
        // sep 的值是单个分隔字符（可以是 , ; | 本身）
        value = rest.slice(1, 2)
        rest = rest.slice(2)
        options.attrs[name] = value
        continue
      }
      if (LIST_VALUE_ATTRS.has(name)) {
        next = rest.indexOf('#', 1)
      } else {
        // 普通属性值终止于下一个 `#` 或顶层 `,`
        let depth = 0
        next = -1
        for (let i = 1; i < rest.length; i++) {
          const c = rest[i]
          if (c === '(' || c === '[') depth++
          else if (c === ')' || c === ']') depth--
          else if (c === ',' && depth === 0) {
            next = i
            break
          }
        }
        if (next < 0) next = rest.indexOf('#', 1)
      }
      if (next >= 1) {
        value = rest.slice(1, next)
        rest = rest.slice(next)
      } else {
        value = rest.slice(1)
        rest = ''
      }
      options.attrs[name] = value.trim()
    } else if (name) {
      options.attrs[name] = ''
    }
  }
  return rest
}

function applyKnownAttrs(type: TypeRef, options: FieldOptions): void {
  if (options.attrs.sep !== undefined) {
    options.sep = options.attrs.sep
    delete options.attrs.sep
  }
  if (options.attrs.ref !== undefined) {
    options.ref = parseRefOption(options.attrs.ref)
    delete options.attrs.ref
  }
  if (options.attrs.path !== undefined) {
    options.path = options.attrs.path
    delete options.attrs.path
  }
  if (options.attrs.default !== undefined) {
    options.default = options.attrs.default
    delete options.attrs.default
  }
  void type
}

export interface ParsedType {
  type: TypeRef
  options: FieldOptions
}

export function parseType(raw: string): ParsedType {
  const options: FieldOptions = { attrs: {} }
  let s = raw.trim()
  if (!s) throw new Error('空类型串')

  const seg = splitContainer(s)
  if (seg) {
    const headAttrsAt = seg.head.indexOf('#')
    const containerName = (headAttrsAt >= 0 ? seg.head.slice(0, headAttrsAt) : seg.head).trim()
    if (!CONTAINERS.has(containerName)) {
      // 括号包裹的基础类型，如 `(int#ref=test.TbX)`：剥掉括号按基础类型 + 属性链处理
      return parseType(s.slice(1, -1))
    }
    if (headAttrsAt >= 0) {
      parseAttrs(seg.head.slice(headAttrsAt), options)
    }
    const elementResults = seg.elements.map((el) => parseType(el))
    // 元素级属性（ref/sep 等）上提到字段级：UI 展示与 M5 校验在字段粒度消费
    for (const er of elementResults) {
      Object.assign(options.attrs, er.options.attrs)
      if (er.options.sep !== undefined) options.sep = er.options.sep
      if (er.options.ref !== undefined) options.ref = er.options.ref
      if (er.options.path !== undefined) options.path = er.options.path
      if (er.options.default !== undefined) options.default = er.options.default
    }
    let type: TypeRef
    if (containerName === 'map') {
      if (elementResults.length !== 2) {
        throw new Error(`map 需要 key/value 两个元素: ${raw}`)
      }
      type = {
        kind: 'map',
        key: elementResults[0].type,
        value: elementResults[1].type
      }
    } else {
      if (elementResults.length !== 1) {
        throw new Error(`${containerName} 需要一个元素: ${raw}`)
      }
      type = {
        kind: containerName as 'list' | 'array' | 'set',
        element: elementResults[0].type
      }
    }
    applyKnownAttrs(type, options)
    return { type, options }
  }

  // 基础类型 + 可空/必填后缀 + 属性链
  const m = /^([A-Za-z_][A-Za-z0-9_.]*)/.exec(s)
  if (!m) throw new Error(`无法解析类型: ${raw}`)
  let name = m[1]
  s = s.slice(name.length)
  let nullable = false
  let required = false
  if (s.startsWith('?')) {
    nullable = true
    s = s.slice(1)
  }
  if (s.startsWith('!')) {
    required = true
    s = s.slice(1)
  }
  s = parseAttrs(s, options)
  if (s.trim()) throw new Error(`类型串有剩余内容: ${raw}（剩余 "${s}"）`)
  if (required) options.required = true

  let base: TypeRef = PRIMITIVES.has(name)
    ? { kind: 'primitive', name }
    : { kind: 'unresolved', ref: name }
  if (nullable) base = { kind: 'nullable', inner: base }
  applyKnownAttrs(base, options)
  return { type: base, options }
}

/** 用查找回调把 unresolved 归类（回调返回 enum/bean 形态，或 null 保持未解析） */
export function resolveRefs(
  type: TypeRef,
  lookup: (ref: string) => TypeRef | null
): TypeRef {
  switch (type.kind) {
    case 'unresolved':
      return lookup(type.ref) ?? type
    case 'nullable':
      return { kind: 'nullable', inner: resolveRefs(type.inner, lookup) }
    case 'list':
    case 'array':
    case 'set':
      return { kind: type.kind, element: resolveRefs(type.element, lookup) }
    case 'map':
      return {
        kind: 'map',
        key: resolveRefs(type.key, lookup),
        value: resolveRefs(type.value, lookup)
      }
    default:
      return type
  }
}
