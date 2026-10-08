import type {
  BeanSchema,
  EnumItem,
  EnumSchema,
  FieldSchema,
  SchemaModel,
  TableInput,
  TableSchema,
  TypeRef
} from '@shared/types/schema'
import { parseType, resolveRefs } from './type-parser'
import type { RawBean, RawEnum, RawField, RawTable } from './raw-defs'
import { parseInput } from './mapper-shared'

interface JsonField {
  name: string
  type: string
  comment?: string
  groups?: string[]
}

interface JsonBean {
  fullName: string
  name: string
  namespace: string
  isAbstract?: boolean
  parent?: string
  sep?: string
  comment?: string
  groups?: string[]
  fields?: JsonField[]
}

interface JsonEnum {
  fullName: string
  name: string
  namespace: string
  isFlags?: boolean
  unique?: boolean
  comment?: string
  items?: { name: string; alias?: string; value: number | string; comment?: string }[]
}

interface JsonTable {
  fullName: string
  name: string
  namespace: string
  valueType: string
  mode: 'map' | 'list' | 'one'
  index?: string | null
  inputFiles?: string[]
  groups?: string[]
  comment?: string
  readSchemaFromFile?: boolean
}

interface SchemaJson {
  tables: JsonTable[]
  beans: JsonBean[]
  enums: JsonEnum[]
}

function toRawBean(b: JsonBean): RawBean {
  return {
    id: b.fullName,
    module: b.namespace,
    name: b.name,
    parent: b.parent,
    abstract: b.isAbstract === true,
    sep: b.sep,
    comment: b.comment,
    groups: b.groups ?? [],
    fields: (b.fields ?? []).map<RawField>((f) => ({
      name: f.name,
      rawType: f.type,
      groups: f.groups ?? [],
      comment: f.comment
    }))
  }
}

function toRawEnum(e: JsonEnum): RawEnum {
  return {
    id: e.fullName,
    module: e.namespace,
    name: e.name,
    flags: e.isFlags === true,
    unique: e.unique === true,
    comment: e.comment,
    items: (e.items ?? []).map<EnumItem>((it) => ({
      name: it.name,
      alias: it.alias,
      value: it.value,
      comment: it.comment
    }))
  }
}

function toRawTable(t: JsonTable): RawTable {
  return {
    id: t.fullName,
    module: t.namespace,
    name: t.name,
    mode: t.mode ?? 'map',
    index: t.index || undefined,
    valueType: t.valueType,
    input: (t.inputFiles ?? []).join(','),
    groups: t.groups ?? [],
    comment: t.comment,
    readSchemaFromFile: t.readSchemaFromFile === true
  }
}

/** 官方 schema-json → SchemaModel（唯一接触官方 JSON 形状的地方） */
export function mapSchemaJson(json: SchemaJson): SchemaModel {
  const rawBeans = json.beans.map(toRawBean)
  const rawEnums = json.enums.map(toRawEnum)
  const rawTables = json.tables.map(toRawTable)

  const beanById = new Map(rawBeans.map((b) => [b.id, b]))
  const lookupIn = makeJsonLookup(rawEnums, rawBeans)

  const makeField = (raw: RawField, module: string): FieldSchema => {
    let parsed
    try {
      parsed = parseType(raw.rawType)
    } catch (e) {
      parsed = {
        type: { kind: 'unresolved', ref: raw.rawType } as TypeRef,
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

  const collectFields = (id: string): RawField[] => {
    const chain: RawBean[] = []
    const seen = new Set<string>()
    let cur = beanById.get(id)
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.unshift(cur)
      cur = cur.parent ? beanById.get(cur.parent) : undefined
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

  const beans: BeanSchema[] = rawBeans.map((b) => ({
    id: b.id,
    module: b.module,
    name: b.name,
    parent: b.parent,
    abstract: b.abstract,
    sep: b.sep,
    comment: b.comment,
    fields: collectFields(b.id).map((f) => makeField(f, b.module))
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

  const tables: TableSchema[] = rawTables.map((t) => {
    const valueBean = beanById.get(t.valueType)
    const rawFields = valueBean
      ? collectFields(valueBean.id)
      : [{ name: 'value', rawType: t.valueType, groups: [], comment: undefined }]
    const fields = rawFields.map((f) => makeField(f, t.module))
    return {
      id: t.id,
      module: t.module,
      name: t.name,
      mode: t.mode,
      index: t.index,
      valueType: t.valueType,
      inputs: parseInput(t.input),
      groups: t.groups,
      comment: t.comment,
      readSchemaFromFile: t.readSchemaFromFile,
      fields
    }
  })

  return {
    source: 'schema-json',
    tables,
    beans,
    enums,
    warnings: [],
    generatedAt: Date.now()
  }
}

function makeJsonLookup(
  rawEnums: RawEnum[],
  rawBeans: RawBean[]
): (module: string) => (ref: string) => TypeRef | null {
  const enumIds = new Set(rawEnums.map((e) => e.id))
  const beanIds = new Set(rawBeans.map((b) => b.id))
  return (module: string) => (ref: string): TypeRef | null => {
    for (const id of [module ? `${module}.${ref}` : ref, ref]) {
      if (enumIds.has(id)) return { kind: 'enum', ref: id }
      if (beanIds.has(id)) return { kind: 'bean', ref: id }
    }
    return null
  }
}

export type { TableInput }
