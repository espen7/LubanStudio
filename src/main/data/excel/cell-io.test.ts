import { describe, expect, it } from 'vitest'
import type { FieldSchema, TypeRef } from '@shared/types/schema'
import { parseType } from '@main/schema/type-parser'
import {
  boolFormFromValues,
  boolKindFromTypeText,
  classifyType,
  isEditableField,
  parseBoolText,
  parseCellText,
  toBoolValue
} from './cell-io'

function mkField(rawType: string, resolved?: TypeRef, name = 'f'): FieldSchema {
  const { type, options } = parseType(rawType)
  return {
    name,
    type: resolved ?? type,
    rawType,
    options: {
      sep: options.sep,
      ref: options.ref,
      path: options.path,
      default: options.default,
      attrs: options.attrs
    },
    groups: []
  }
}

describe('classifyType', () => {
  it('数值类型归 number', () => {
    expect(classifyType(mkField('int').type)).toBe('number')
    expect(classifyType(mkField('double').type)).toBe('number')
    expect(classifyType(mkField('long').type)).toBe('number')
  })

  it('bool/string/enum 归各自类别', () => {
    expect(classifyType(mkField('bool').type)).toBe('bool')
    expect(classifyType(mkField('string').type)).toBe('string')
    expect(classifyType(mkField('DemoEnum', { kind: 'enum', ref: 'item.DemoEnum' }).type)).toBe('string')
  })

  it('可空与 sep 列表可编辑，bean/map 不可', () => {
    expect(classifyType(mkField('int?').type)).toBe('number')
    expect(classifyType(mkField('(list#sep=,),int').type)).toBe('list')
    expect(classifyType(mkField('(list#sep=,),TestBean').type)).toBe('readonly')
    expect(
      classifyType(mkField('DemoBean', { kind: 'bean', ref: 'item.TestBean' }).type)
    ).toBe('readonly')
    expect(
      classifyType({ kind: 'map', key: { kind: 'primitive', name: 'int' }, value: { kind: 'primitive', name: 'string' } })
    ).toBe('readonly')
    expect(isEditableField(mkField('DemoBean', { kind: 'bean', ref: 'item.TestBean' }))).toBe(false)
    expect(isEditableField(mkField('int'))).toBe(true)
  })
})

describe('parseCellText', () => {
  it('整数/浮点解析', () => {
    expect(parseCellText(mkField('int'), '42')).toBe(42)
    expect(parseCellText(mkField('int'), '-3')).toBe(-3)
    expect(parseCellText(mkField('float'), '1.5')).toBe(1.5)
  })

  it('整数收到小数抛错', () => {
    expect(() => parseCellText(mkField('int'), '4.5')).toThrow(/不是 int/)
    expect(() => parseCellText(mkField('int'), 'abc')).toThrow(/不是 int/)
  })

  it('bool 解析与抛错', () => {
    expect(parseCellText(mkField('bool'), 'true')).toBe(true)
    expect(parseCellText(mkField('bool'), 'false')).toBe(false)
    expect(() => parseCellText(mkField('bool'), 'x')).toThrow(/不是 bool/)
  })

  it('空输入返回 null（可空与不可空一致，校验层负责必填）', () => {
    expect(parseCellText(mkField('int?'), '')).toBeNull()
    expect(parseCellText(mkField('int?'), null)).toBeNull()
    expect(parseCellText(mkField('int'), '')).toBeNull()
  })

  it('string/enum/date 保持文本', () => {
    expect(parseCellText(mkField('string'), 'hi')).toBe('hi')
    expect(parseCellText(mkField('DemoEnum', { kind: 'enum', ref: 'item.DemoEnum' }), 'A')).toBe('A')
    expect(parseCellText(mkField('datetime'), '2024-01-01 10:00:00')).toBe('2024-01-01 10:00:00')
  })

  it('sep 列表按整体文本写回', () => {
    expect(parseCellText(mkField('(list#sep=,),int'), '1,2,3')).toBe('1,2,3')
  })

  it('只读类型抛错', () => {
    expect(() => parseCellText(mkField('DemoBean', { kind: 'bean', ref: 'item.TestBean' }), 'x')).toThrow(/只读/)
  })
})

describe('bool 按内容判定', () => {
  it('##type 文本判定 bool，int 明确否掉，缺失或不可解析为未知', () => {
    expect(boolKindFromTypeText('bool')).toBe('bool')
    expect(boolKindFromTypeText('bool?')).toBe('bool')
    expect(boolKindFromTypeText('int')).toBe('other')
    expect(boolKindFromTypeText('')).toBe('unknown')
    expect(boolKindFromTypeText('hero.BattleHero')).toBe('unknown')
  })

  it('整列都落在 bool 取值域才算 bool 列，并给出存储形态', () => {
    expect(boolFormFromValues([1, 0, 1])).toBe('number')
    expect(boolFormFromValues([true, false])).toBe('boolean')
    expect(boolFormFromValues(['true', 'false'])).toBe('string')
    expect(boolFormFromValues([1, null, '', 0])).toBe('number')
    expect(boolFormFromValues([1, 0, 2])).toBeNull()
    expect(boolFormFromValues(['yolo'])).toBeNull()
    expect(boolFormFromValues([null, ''])).toBeNull()
  })

  it('类型未知时的兜底要求真假值都出现，全 0/全 1 列不算 bool', () => {
    expect(boolFormFromValues([0, 0, null], true)).toBeNull()
    expect(boolFormFromValues([1, 1], true)).toBeNull()
    expect(boolFormFromValues([1, 0], true)).toBe('number')
  })

  it('bool 列取值归一为布尔，解释不了的交给校验层', () => {
    expect(toBoolValue(1)).toBe(true)
    expect(toBoolValue(0)).toBe(false)
    expect(toBoolValue('TRUE')).toBe(true)
    expect(toBoolValue(false)).toBe(false)
    expect(toBoolValue(2)).toBeNull()
    expect(toBoolValue(null)).toBeNull()
  })

  it('写回跟随该列原有形态', () => {
    expect(parseBoolText('true', 'number')).toBe(1)
    expect(parseBoolText('false', 'number')).toBe(0)
    expect(parseBoolText('true', 'string')).toBe('true')
    expect(parseBoolText('1', 'boolean')).toBe(true)
    expect(parseBoolText('', 'boolean')).toBeNull()
    expect(() => parseBoolText('yolo', 'boolean')).toThrow(/不是 bool/)
  })
})
