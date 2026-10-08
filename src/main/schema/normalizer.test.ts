import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseLubanConf } from '../project/conf-parser'
import { buildSchemaFromSources } from './normalizer'

const SANDBOX = join(__dirname, '../../../.sandbox')
const MINI = join(SANDBOX, 'luban_examples/MiniTemplate')
const DATATABLES = join(SANDBOX, 'luban_examples/DataTables')

const hasSandbox = existsSync(MINI)

describe.skipIf(!hasSandbox)('自研解析 vs 官方 schema-json（MiniTemplate）', () => {
  it('表/bean/enum 数量与关键字段一致', async () => {
    const conf = parseLubanConf(join(MINI, 'luban.conf'))
    const model = await buildSchemaFromSources(conf)
    const official = require(join('../../../docs/samples/v5/mini-schema.json')) as {
      tables: { fullName: string; valueType: string; mode: string; index: string | null }[]
      beans: { fullName: string; fields: { name: string; type: string }[] }[]
      enums: unknown[]
    }

    expect(model.tables.map((t) => t.id).sort()).toEqual(
      official.tables.map((t) => t.fullName).sort()
    )
    expect(model.beans.map((b) => b.id).sort()).toEqual(
      official.beans.map((b) => b.fullName).sort()
    )
    expect(model.enums.length).toBe(official.enums.length)

    for (const ot of official.tables) {
      const t = model.tables.find((x) => x.id === ot.fullName)!
      expect(t.valueType).toBe(ot.valueType)
      expect(t.mode).toBe(ot.mode)
      expect(t.index ?? null).toBe(ot.index)
    }
    for (const ob of official.beans) {
      const b = model.beans.find((x) => x.id === ob.fullName)!
      expect(b.fields.map((f) => f.name)).toEqual(ob.fields.map((f) => f.name))
      expect(b.fields.map((f) => f.rawType)).toEqual(ob.fields.map((f) => f.type))
    }
  })
})

describe.skipIf(!hasSandbox)('自研解析 vs 官方 schema-json（DataTables 全量）', () => {
  it('53 表全量 id/mode/valueType/index 一致', async () => {
    const conf = parseLubanConf(join(DATATABLES, 'luban.conf'))
    const model = await buildSchemaFromSources(conf)
    const official = require(join('../../../docs/samples/v5/datatables-schema.json')) as {
      tables: { fullName: string; valueType: string; mode: string; index: string | null }[]
      beans: { fullName: string }[]
      enums: { fullName: string }[]
    }

    const ours = new Map(model.tables.map((t) => [t.id, t]))
    const missing: string[] = []
    const mismatch: string[] = []
    for (const ot of official.tables) {
      const t = ours.get(ot.fullName)
      if (!t) {
        missing.push(ot.fullName)
        continue
      }
      if (t.valueType !== ot.valueType) mismatch.push(`${ot.fullName} valueType ${t.valueType} != ${ot.valueType}`)
      if (t.mode !== ot.mode) mismatch.push(`${ot.fullName} mode ${t.mode} != ${ot.mode}`)
      if ((t.index ?? null) !== (ot.index || null)) mismatch.push(`${ot.fullName} index ${t.index} != ${ot.index}`)
    }
    expect(missing).toEqual([])
    expect(mismatch).toEqual([])
    expect(model.tables.length).toBe(official.tables.length)

    const officialBeans = new Set(official.beans.map((b: { fullName: string }) => b.fullName))
    const ourBeanIds = new Set(model.beans.map((b) => b.id))
    const beansMissing = [...officialBeans].filter((id) => !ourBeanIds.has(id))
    expect(beansMissing).toEqual([])
    expect(model.enums.length).toBe(official.enums.length)
  })
})
