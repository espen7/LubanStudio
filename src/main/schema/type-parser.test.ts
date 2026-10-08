import { describe, expect, it } from 'vitest'
import { parseType, resolveRefs } from './type-parser'

describe('parseType（真实语料）', () => {
  it('原生类型', () => {
    for (const p of ['bool', 'byte', 'short', 'int', 'uint', 'long', 'float', 'double', 'string', 'datetime', 'text', 'bigint', 'uint8', 'vec2', 'vec3', 'vec4']) {
      expect(parseType(p).type).toEqual({ kind: 'primitive', name: p })
    }
  })

  it('可空', () => {
    expect(parseType('int?').type).toEqual({
      kind: 'nullable',
      inner: { kind: 'primitive', name: 'int' }
    })
    expect(parseType('DemoEnum?').type).toEqual({
      kind: 'nullable',
      inner: { kind: 'unresolved', ref: 'DemoEnum' }
    })
    expect(parseType('text?').type).toEqual({
      kind: 'nullable',
      inner: { kind: 'primitive', name: 'text' }
    })
  })

  it('容器逗号形态', () => {
    expect(parseType('list,int').type).toEqual({
      kind: 'list',
      element: { kind: 'primitive', name: 'int' }
    })
    expect(parseType('array,DemoDynamic').type).toEqual({
      kind: 'array',
      element: { kind: 'unresolved', ref: 'DemoDynamic' }
    })
    expect(parseType('set,int').type).toEqual({
      kind: 'set',
      element: { kind: 'primitive', name: 'int' }
    })
    expect(parseType('map,string,int').type).toEqual({
      kind: 'map',
      key: { kind: 'primitive', name: 'string' },
      value: { kind: 'primitive', name: 'int' }
    })
    expect(parseType('map,DemoEnum,int').type).toEqual({
      kind: 'map',
      key: { kind: 'unresolved', ref: 'DemoEnum' },
      value: { kind: 'primitive', name: 'int' }
    })
  })

  it('容器括号形态（含属性）', () => {
    expect(parseType('(list#sep=,),string').type).toEqual({
      kind: 'list',
      element: { kind: 'primitive', name: 'string' }
    })
    expect(parseType('(list#sep=,),string').options.sep).toBe(',')
    expect(parseType('(list#(size=[1, 3])),int').options.attrs.size).toBe('[1, 3]')
    expect(parseType('(map#(size=(1, 3))),int,int').type).toEqual({
      kind: 'map',
      key: { kind: 'primitive', name: 'int' },
      value: { kind: 'primitive', name: 'int' }
    })
  })

  it('map 分号形态（属性含逗号时）', () => {
    const r = parseType('map#sep=,;int#ref=test.TbFullTypes;int#ref=test.TbFullTypes')
    expect(r.type).toEqual({
      kind: 'map',
      key: { kind: 'primitive', name: 'int' },
      value: { kind: 'primitive', name: 'int' }
    })
    expect(r.options.sep).toBe(',')
    expect(r.options.ref).toEqual({ table: 'test.TbFullTypes', nullable: false })
  })

  it('元素级属性：sep / ref / set / range / 多属性链', () => {
    expect(parseType('list,DemoE2#sep=,').options.sep).toBe(',')
    expect(parseType('(list#sep=|),(int#ref=test.TbTestBeRef)').type).toEqual({
      kind: 'list',
      element: { kind: 'primitive', name: 'int' }
    })
    expect(parseType('list,int#set=1,2,3,4,5').options.attrs.set).toBe('1,2,3,4,5')
    expect(parseType('double#(range=[0.01, 0.02])').options.attrs.range).toBe('[0.01, 0.02]')
    expect(parseType('bool#kind=cat#type=sss').options.attrs).toEqual({
      kind: 'cat',
      type: 'sss'
    })
  })

  it('ref 三形态', () => {
    expect(parseType('string#ref=ai.TbBlackboard').options.ref).toEqual({
      table: 'ai.TbBlackboard',
      nullable: false
    })
    expect(parseType('string#ref=ai.TbBlackboard?').options.ref).toEqual({
      table: 'ai.TbBlackboard',
      nullable: true
    })
    expect(parseType('long#ref=id2@test.TbMultiIndexList').options.ref).toEqual({
      field: 'id2',
      table: 'test.TbMultiIndexList',
      nullable: false
    })
  })

  it('path / escape / 嵌套容器', () => {
    expect(parseType('string#path=unity').options.path).toBe('unity')
    expect(parseType('string#escape=1').options.attrs.escape).toBe('1')
    expect(parseType('(array#sep=;),DemoDynamic#sep=,').options.sep).toBe(';')
    expect(parseType('set,(int#ref=test.TbTestBeRef)').options.ref).toEqual({
      table: 'test.TbTestBeRef',
      nullable: false
    })
  })

  it('异常输入', () => {
    expect(() => parseType('')).toThrow('空')
    expect(() => parseType('(list#sep=,)int')).toThrow()
    expect(() => parseType('map,int')).toThrow('两个元素')
    expect(() => parseType('list,int,string')).toThrow('一个元素')
  })
})

describe('resolveRefs', () => {
  const lookup = (ref: string): { kind: 'enum'; ref: string } | { kind: 'bean'; ref: string } | null => {
    if (ref === 'DemoEnum' || ref === 'x.DemoEnum') return { kind: 'enum', ref: 'x.DemoEnum' }
    if (ref === 'DemoDynamic' || ref === 'y.DemoDynamic') return { kind: 'bean', ref: 'y.DemoDynamic' }
    return null
  }

  it('unresolved 归类', () => {
    expect(resolveRefs({ kind: 'unresolved', ref: 'DemoEnum' }, lookup)).toEqual({
      kind: 'enum',
      ref: 'x.DemoEnum'
    })
    expect(resolveRefs({ kind: 'unresolved', ref: 'DemoDynamic' }, lookup)).toEqual({
      kind: 'bean',
      ref: 'y.DemoDynamic'
    })
    expect(resolveRefs({ kind: 'unresolved', ref: 'Nope' }, lookup).kind).toBe('unresolved')
  })

  it('递归进容器', () => {
    expect(resolveRefs({ kind: 'list', element: { kind: 'unresolved', ref: 'DemoEnum' } }, lookup)).toEqual({
      kind: 'list',
      element: { kind: 'enum', ref: 'x.DemoEnum' }
    })
  })
})
