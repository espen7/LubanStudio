import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LubanConf, LubanConfGroup, LubanConfSchemaFile, LubanConfTarget } from '@shared/types/project'

function asStringArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`luban.conf: ${what} 应为字符串数组`)
  }
  return v
}

function parseGroups(v: unknown): LubanConfGroup[] {
  if (!Array.isArray(v)) {
    throw new Error('luban.conf: groups 应为数组')
  }
  return v.map((g, i) => {
    if (typeof g !== 'object' || g === null) {
      throw new Error(`luban.conf: groups[${i}] 应为对象`)
    }
    const names = asStringArray((g as Record<string, unknown>).names, `groups[${i}].names`)
    return { names, default: (g as Record<string, unknown>).default === true }
  })
}

function parseSchemaFiles(v: unknown, root: string): LubanConfSchemaFile[] {
  if (!Array.isArray(v)) {
    throw new Error('luban.conf: schemaFiles 应为数组')
  }
  return v.map((f, i) => {
    if (typeof f !== 'object' || f === null) {
      throw new Error(`luban.conf: schemaFiles[${i}] 应为对象`)
    }
    const rec = f as Record<string, unknown>
    if (typeof rec.fileName !== 'string') {
      throw new Error(`luban.conf: schemaFiles[${i}].fileName 应为字符串`)
    }
    const type = rec.type
    if (type !== undefined && type !== '' && type !== 'table' && type !== 'bean' && type !== 'enum') {
      throw new Error(`luban.conf: schemaFiles[${i}].type 非法: ${String(type)}`)
    }
    return {
      fileName: join(root, String(rec.fileName)),
      type: (type ?? '') as LubanConfSchemaFile['type']
    }
  })
}

function parseTargets(v: unknown): LubanConfTarget[] {
  if (!Array.isArray(v)) {
    throw new Error('luban.conf: targets 应为数组')
  }
  return v.map((t, i) => {
    if (typeof t !== 'object' || t === null) {
      throw new Error(`luban.conf: targets[${i}] 应为对象`)
    }
    const rec = t as Record<string, unknown>
    if (typeof rec.name !== 'string' || typeof rec.manager !== 'string') {
      throw new Error(`luban.conf: targets[${i}] 缺少 name/manager`)
    }
    return {
      name: rec.name,
      manager: rec.manager,
      groups: asStringArray(rec.groups, `targets[${i}].groups`),
      topModule: typeof rec.topModule === 'string' ? rec.topModule : undefined
    }
  })
}

export function parseLubanConf(confPath: string): LubanConf {
  const root = dirname(confPath)

  if (!existsSync(confPath)) {
    throw new Error(`找不到 ${confPath}`)
  }
  if (existsSync(join(root, 'root.xml'))) {
    throw new Error('检测到 root.xml：这是 Luban 1.x/2.x 项目，当前版本暂不支持，请升级到 Luban 3+')
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(confPath, 'utf-8').replace(/^\uFEFF/, ''))
  } catch (e) {
    throw new Error(`luban.conf 不是合法 JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('luban.conf 顶层应为对象')
  }
  const rec = raw as Record<string, unknown>

  const dataDir = typeof rec.dataDir === 'string' ? rec.dataDir : ''
  if (!dataDir) {
    throw new Error('luban.conf: 缺少 dataDir')
  }

  return {
    root,
    groups: parseGroups(rec.groups),
    schemaFiles: parseSchemaFiles(rec.schemaFiles, root),
    dataDir: join(root, dataDir),
    targets: parseTargets(rec.targets),
    xargs: Array.isArray(rec.xargs) ? rec.xargs : []
  }
}
