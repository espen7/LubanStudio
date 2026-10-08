import { XMLParser } from 'fast-xml-parser'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RawBean, RawEnum, RawField, RawTable } from './raw-defs'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseAttributeValue: false,
  isArray: (name): boolean => ['module', 'bean', 'enum', 'table', 'var'].includes(name)
})

type XmlAttrs = Record<string, string>
interface XmlNode {
  '#text'?: string
  [key: string]: unknown
}

function attrsOf(node: unknown): XmlAttrs {
  if (typeof node !== 'object' || node === null) return {}
  const out: XmlAttrs = {}
  for (const [k, v] of Object.entries(node as XmlNode)) {
    if (k.startsWith('@')) {
      out[k.slice(1)] = typeof v === 'string' ? v : String(v ?? '')
    }
  }
  return out
}

function childrenOf(node: unknown, tag: string): unknown[] {
  if (typeof node !== 'object' || node === null) return []
  const v = (node as XmlNode)[tag]
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function fieldFromVar(node: unknown): { name: string; type: string; groups: string[]; comment?: string } {
  const a = attrsOf(node)
  const groups = a.group ? a.group.split(',').map((s) => s.trim()).filter(Boolean) : []
  return { name: a.name ?? '', type: a.type ?? '', groups, comment: a.comment || undefined }
}

function parseEnum(node: unknown, module: string): RawEnum {
  const a = attrsOf(node)
  const items = childrenOf(node, 'var').map((v) => {
    const va = attrsOf(v)
    const rawValue = va.value ?? ''
    const num = Number(rawValue)
    return {
      name: va.name ?? '',
      alias: va.alias || undefined,
      value: rawValue !== '' && !Number.isNaN(num) ? num : rawValue,
      comment: va.comment || undefined
    }
  })
  return {
    id: module ? `${module}.${a.name}` : (a.name ?? ''),
    module,
    name: a.name ?? '',
    flags: a.flags === 'true',
    unique: a.unique === 'true',
    comment: a.comment || undefined,
    items
  }
}

function parseBean(node: unknown, module: string): RawBean[] {
  const a = attrsOf(node)
  const out: RawBean[] = []
  const fields: RawField[] = []
  for (const child of childrenOf(node, 'var')) {
    const f = fieldFromVar(child)
    fields.push({ name: f.name, rawType: f.type, groups: f.groups, comment: f.comment })
  }
  out.push({
    id: module ? `${module}.${a.name}` : (a.name ?? ''),
    module,
    name: a.name ?? '',
    parent: a.parent || undefined,
    abstract: false,
    sep: a.sep || undefined,
    comment: a.comment || undefined,
    groups: a.group ? a.group.split(',').map((s) => s.trim()).filter(Boolean) : [],
    fields
  })
  // 多态子类：嵌套 <bean>
  for (const child of childrenOf(node, 'bean')) {
    out.push(...parseBean(child, module))
  }
  return out
}

function parseTable(node: unknown, module: string): RawTable {
  const a = attrsOf(node)
  const mode = (a.mode || 'map') as RawTable['mode']
  return {
    id: module ? `${module}.${a.name}` : (a.name ?? ''),
    module,
    name: a.name ?? '',
    mode,
    index: a.index || undefined,
    valueType: a.value ?? '',
    input: a.input ?? '',
    groups: a.group ? a.group.split(',').map((s) => s.trim()).filter(Boolean) : [],
    comment: a.comment || undefined,
    readSchemaFromFile: a.readSchemaFromFile === 'true' || a.readSchemaFromFile === '1'
  }
}

function walk(node: unknown, module: string, acc: { beans: RawBean[]; enums: RawEnum[]; tables: RawTable[] }): void {
  for (const m of childrenOf(node, 'module')) {
    const ma = attrsOf(m)
    const sub = ma.name ? (module ? `${module}.${ma.name}` : ma.name) : module
    walk(m, sub, acc)
  }
  for (const e of childrenOf(node, 'enum')) acc.enums.push(parseEnum(e, module))
  for (const b of childrenOf(node, 'bean')) acc.beans.push(...parseBean(b, module))
  for (const t of childrenOf(node, 'table')) acc.tables.push(parseTable(t, module))
}

/** 解析单个 XML 定义文件 */
export function parseXmlDefine(content: string): {
  beans: RawBean[]
  enums: RawEnum[]
  tables: RawTable[]
} {
  const doc = parser.parse(content) as XmlNode
  const root = (doc.module as unknown[] | undefined)?.[0]
  const acc = { beans: [] as RawBean[], enums: [] as RawEnum[], tables: [] as RawTable[] }
  if (root) {
    const ra = attrsOf(root)
    walk(root, ra.name ?? '', acc)
  } else {
    // 无 <module> 包裹的裸定义文件
    walk(doc, '', acc)
  }
  return acc
}

/** 递归收集目录下所有 .xml 定义文件并解析 */
export function parseXmlDefineDir(
  dir: string,
  warnings: string[]
): { beans: RawBean[]; enums: RawEnum[]; tables: RawTable[] } {
  const acc = { beans: [] as RawBean[], enums: [] as RawEnum[], tables: [] as RawTable[] }
  if (!existsSync(dir)) {
    warnings.push(`schemaFiles 目录不存在: ${dir}`)
    return acc
  }
  const queue = [dir]
  while (queue.length > 0) {
    const d = queue.shift()!
    for (const name of readdirSync(d)) {
      if (name.startsWith('.') || name.startsWith('_')) continue
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) queue.push(p)
      else if (name.toLowerCase().endsWith('.xml')) {
        try {
          const r = parseXmlDefine(readFileSync(p, 'utf-8'))
          acc.beans.push(...r.beans)
          acc.enums.push(...r.enums)
          acc.tables.push(...r.tables)
        } catch (e) {
          warnings.push(`解析 ${p} 失败: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }
  return acc
}
