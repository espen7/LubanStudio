import { existsSync } from 'node:fs'
import { join, isAbsolute } from 'node:path'
import type { LubanConf } from '@shared/types/project'
import type {
  BeanSchema,
  EnumSchema,
  FieldOptions,
  FieldSchema,
  SchemaModel,
  TableInput,
  TableSchema,
  TypeRef
} from '@shared/types/schema'
import { parseType, resolveRefs } from './type-parser'
import { parseXmlDefineDir } from './xml-parser'
import {
  parseExcelBeanDefines,
  parseExcelEnumDefines,
  parseExcelTableDefines
} from './excel-def-parser'
import { readDataFileSchema, scanAutoImportFiles } from './data-file-schema'
import type { RawBean, RawEnum, RawField, RawTable } from './raw-defs'

function parseInput(raw: string): TableInput[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf('@')
      return at >= 0
        ? { tableName: part.slice(0, at), file: part.slice(at + 1) }
        : { tableName: '', file: part }
    })
}

/** input 描述的文件路径相对 dataDir（Luban 约定）。磁盘文件名本身可带 `#`
 * 前缀（自动注册文件），优先按原样解析，不存在再尝试剥 `#` 的形态 */
export function resolveDataFile(conf: LubanConf, file: string): string {
  if (isAbsolute(file)) return file
  const raw = join(conf.dataDir, file)
  if (existsSync(raw)) return raw
  const clean = file.replace(/^#/, '')
  return isAbsolute(clean) ? clean : join(conf.dataDir, clean)
}

/** 命名空间解析：先当前模块精确匹配，再全局短名唯一匹配，多义/未找到返回 null */
function makeLookup(
  enumIds: Set<string>,
  beanIds: Set<string>
): (module: string) => (ref: string) => TypeRef | null {
  const shortEnum = new Map<string, string[]>()
  for (const id of enumIds) {
    const short = id.slice(id.lastIndexOf('.') + 1)
    shortEnum.set(short, [...(shortEnum.get(short) ?? []), id])
  }
  const shortBean = new Map<string, string[]>()
  for (const id of beanIds) {
    const short = id.slice(id.lastIndexOf('.') + 1)
    shortBean.set(short, [...(shortBean.get(short) ?? []), id])
  }
  return (module: string) => (ref: string): TypeRef | null => {
    const tryIds = [module ? `${module}.${ref}` : ref, ref]
    for (const id of tryIds) {
      if (enumIds.has(id)) return { kind: 'enum', ref: id }
      if (beanIds.has(id)) return { kind: 'bean', ref: id }
    }
    const e = shortEnum.get(ref)
    if (e?.length === 1) return { kind: 'enum', ref: e[0] }
    const b = shortBean.get(ref)
    if (b?.length === 1) return { kind: 'bean', ref: b[0] }
    return null
  }
}

function makeField(
  raw: RawField,
  module: string,
  lookupIn: (module: string) => (ref: string) => TypeRef | null
): FieldSchema {
  let parsed: { type: TypeRef; options: FieldOptions }
  try {
    parsed = parseType(raw.rawType)
  } catch (e) {
    parsed = {
      type: { kind: 'unresolved', ref: raw.rawType },
      options: { attrs: { parseError: e instanceof Error ? e.message : String(e) } }
    }
  }
  return {
    name: raw.name,
    type: resolveRefs(parsed.type, lookupIn(module)),
    rawType: raw.rawType,
    options: {
      sep: parsed.options.sep,
      ref: parsed.options.ref,
      path: parsed.options.path,
      default: parsed.options.default,
      attrs: parsed.options.attrs
    },
    groups: raw.groups,
    comment: raw.comment
  }
}

/** 合并继承链字段（父在前，父类短名按同模块约定补找） */
function collectBeanFields(id: string, byId: Map<string, RawBean>): RawField[] {
  const chain: RawBean[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    chain.unshift(cur)
    const parentName = cur.parent
    cur = parentName
      ? (byId.get(parentName) ?? (cur.module ? byId.get(`${cur.module}.${parentName}`) : undefined))
      : undefined
  }
  const out: RawField[] = []
  const names = new Set<string>()
  for (const b of chain) {
    for (const f of b.fields) {
      if (!names.has(f.name)) {
        names.add(f.name)
        out.push(f)
      }
    }
  }
  return out
}

function collectUnresolved(type: TypeRef, out: Set<string>): void {
  if (type.kind === 'unresolved') out.add(type.ref)
  else if (type.kind === 'nullable') collectUnresolved(type.inner, out)
  else if (type.kind === 'list' || type.kind === 'array' || type.kind === 'set') {
    collectUnresolved(type.element, out)
  } else if (type.kind === 'map') {
    collectUnresolved(type.key, out)
    collectUnresolved(type.value, out)
  }
}

export async function buildSchemaFromSources(conf: LubanConf): Promise<SchemaModel> {
  const warnings: string[] = []
  const rawBeans: RawBean[] = []
  const rawEnums: RawEnum[] = []
  const rawTables: RawTable[] = []

  for (const sf of conf.schemaFiles) {
    try {
      if (sf.type === '') {
        const r = parseXmlDefineDir(sf.fileName, warnings)
        rawBeans.push(...r.beans)
        rawEnums.push(...r.enums)
        rawTables.push(...r.tables)
      } else if (sf.type === 'table') {
        rawTables.push(...(await parseExcelTableDefines(sf.fileName, warnings)))
      } else if (sf.type === 'bean') {
        rawBeans.push(...(await parseExcelBeanDefines(sf.fileName, warnings)))
      } else if (sf.type === 'enum') {
        rawEnums.push(...(await parseExcelEnumDefines(sf.fileName, warnings)))
      }
    } catch (e) {
      warnings.push(`解析 ${sf.fileName} 失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const auto = await scanAutoImportFiles(conf, warnings)
  rawTables.push(...auto.tables)
  rawBeans.push(...auto.beans)

  const beanById = new Map(rawBeans.map((b) => [b.id, b]))
  const enumIds0 = new Set(rawEnums.map((e) => e.id))
  const beanIds0 = new Set(rawBeans.map((b) => b.id))
  const lookup0 = makeLookup(enumIds0, beanIds0)

  // 表的 value 常写短名（官方 schema-json 会解析成全名）：统一成全名注册；
  // readSchemaFromFile 的表 bean 尚未注册，直接用模块拼全名
  for (const t of rawTables) {
    const resolved = lookup0(t.module)(t.valueType)
    if (resolved && (resolved.kind === 'bean' || resolved.kind === 'enum')) {
      t.valueType = resolved.ref
    } else if (t.readSchemaFromFile && t.module && !t.valueType.includes('.')) {
      t.valueType = `${t.module}.${t.valueType}`
    }
  }

  // readSchemaFromFile 且 bean 无字段定义的表：从数据文件表头补隐式 bean
  for (const t of rawTables) {
    if (!t.readSchemaFromFile) continue
    const existing = beanById.get(t.valueType)
    if (existing && existing.fields.length > 0) continue
    const input = parseInput(t.input)[0]
    if (!input) continue
    const dataFile = resolveDataFile(conf, input.file)
    if (!existsSync(dataFile)) {
      warnings.push(`表 ${t.id} 的数据文件不存在: ${input.file}`)
      continue
    }
    const header = await readDataFileSchema(dataFile, warnings)
    if (!header) continue
    const dot = t.valueType.lastIndexOf('.')
    const implicit: RawBean = {
      id: t.valueType,
      module: dot > 0 ? t.valueType.slice(0, dot) : '',
      name: dot > 0 ? t.valueType.slice(dot + 1) : t.valueType,
      abstract: false,
      groups: [],
      fields: header.fields
    }
    if (existing) {
      existing.fields = implicit.fields
    } else {
      rawBeans.push(implicit)
      beanById.set(implicit.id, implicit)
    }
  }

  const dupCheck = (items: { id: string }[], what: string): void => {
    const seen = new Set<string>()
    for (const it of items) {
      if (seen.has(it.id)) warnings.push(`${what} 重名: ${it.id}`)
      seen.add(it.id)
    }
  }

  // v5 variant：同名表按 variant 重复定义，取首个（IDE 不区分变体）
  const tableById = new Map<string, RawTable>()
  for (const t of rawTables) {
    if (!tableById.has(t.id)) tableById.set(t.id, t)
  }

  // 组过滤：非 default 组专属表（如 t/editor 组）不进入常规 Schema 视图
  const defaultGroups = new Set(
    conf.groups.filter((g) => g.default).flatMap((g) => g.names)
  )
  const visibleTables = [...tableById.values()].filter((t) => {
    if (t.groups.length === 0) return true
    return t.groups.some((g) => defaultGroups.has(g))
  })
  dupCheck(rawBeans, 'bean')
  dupCheck(rawEnums, 'enum')
  dupCheck(rawTables, 'table')

  const lookupIn = makeLookup(
    new Set(rawEnums.map((e) => e.id)),
    new Set(rawBeans.map((b) => b.id))
  )

  const beans: BeanSchema[] = rawBeans.map((b) => ({
    id: b.id,
    module: b.module,
    name: b.name,
    parent: b.parent,
    abstract: b.abstract,
    sep: b.sep,
    comment: b.comment,
    fields: collectBeanFields(b.id, beanById).map((f) => makeField(f, b.module, lookupIn))
  }))

  const enums: EnumSchema[] = rawEnums.map((e) => ({
    id: e.id,
    module: e.module,
    name: e.name,
    flags: e.flags,
    unique: e.unique,
    comment: e.comment,
    items: e.items
  }))

  const tables: TableSchema[] = visibleTables.map((t) => {
    const valueBean = beanById.get(t.valueType)
    const rawFields = valueBean
      ? collectBeanFields(valueBean.id, beanById)
      : [{ name: 'value', rawType: t.valueType, groups: [], comment: undefined }]
    const fields = rawFields.map((f) => makeField(f, t.module, lookupIn))
    const index =
      t.mode === 'map' && !t.index
        ? (fields.find((f) => f.name === 'id') ?? fields[0])?.name
        : t.index
    return {
      id: t.id,
      module: t.module,
      name: t.name,
      mode: t.mode,
      index,
      valueType: t.valueType,
      inputs: parseInput(t.input),
      groups: t.groups,
      comment: t.comment,
      readSchemaFromFile: t.readSchemaFromFile,
      fields
    }
  })

  const unresolved = new Set<string>()
  for (const t of tables) for (const f of t.fields) collectUnresolved(f.type, unresolved)
  for (const u of unresolved) {
    if (!u) continue
    warnings.push(`类型未解析（跨模块短名多义或拼写问题）: ${u}`)
  }

  return {
    source: 'xml',
    tables,
    beans,
    enums,
    warnings,
    generatedAt: Date.now()
  }
}
