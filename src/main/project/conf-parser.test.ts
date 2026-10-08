import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { parseLubanConf } from './conf-parser'

const MINI = join(__dirname, '../../../.sandbox/luban_examples/MiniTemplate/luban.conf')

describe('parseLubanConf（真实 MiniTemplate）', () => {
  it('解析五组顶层 key', () => {
    const conf = parseLubanConf(MINI)
    expect(conf.root).toBe(join(MINI, '..'))
    expect(conf.groups.map((g) => g.names)).toEqual([['c'], ['s'], ['e']])
    expect(conf.groups.every((g) => g.default)).toBe(true)
    expect(conf.schemaFiles).toHaveLength(4)
    expect(conf.schemaFiles[0]).toEqual({
      fileName: join(conf.root, 'Defines'),
      type: ''
    })
    expect(conf.schemaFiles[1].type).toBe('table')
    expect(conf.dataDir).toBe(join(conf.root, 'Data'))
    expect(conf.targets.map((t) => t.name)).toEqual(['server', 'client', 'all'])
    expect(conf.targets[0].groups).toEqual(['s'])
    expect(conf.xargs).toEqual([])
  })
})

describe('parseLubanConf（异常输入）', () => {
  it('文件不存在时报错', () => {
    expect(() => parseLubanConf(join(tmpdir(), 'no-such-luban.conf'))).toThrow('找不到')
  })

  it('1.x/2.x 项目（root.xml）识别并拒绝', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luban-legacy-'))
    writeFileSync(join(dir, 'luban.conf'), '{}')
    writeFileSync(join(dir, 'root.xml'), '<root/>')
    expect(() => parseLubanConf(join(dir, 'luban.conf'))).toThrow('1.x/2.x')
  })

  it('缺少 dataDir 报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luban-nodata-'))
    writeFileSync(join(dir, 'luban.conf'), JSON.stringify({ groups: [], schemaFiles: [], targets: [] }))
    expect(() => parseLubanConf(join(dir, 'luban.conf'))).toThrow('dataDir')
  })

  it('BOM 头容忍', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luban-bom-'))
    const body = JSON.stringify({ groups: [], schemaFiles: [], dataDir: 'Data', targets: [] })
    writeFileSync(join(dir, 'luban.conf'), '\uFEFF' + body)
    mkdirSync(join(dir, 'Data'))
    const conf = parseLubanConf(join(dir, 'luban.conf'))
    expect(conf.dataDir).toBe(join(dir, 'Data'))
  })

  it('非法 type 报错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'luban-badtype-'))
    writeFileSync(
      join(dir, 'luban.conf'),
      JSON.stringify({
        groups: [],
        schemaFiles: [{ fileName: 'a.xlsx', type: 'wat' }],
        dataDir: 'Data',
        targets: []
      })
    )
    expect(() => parseLubanConf(join(dir, 'luban.conf'))).toThrow('type 非法')
  })
})
