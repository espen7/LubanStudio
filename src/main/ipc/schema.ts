import { handle } from './register'
import { getCurrentProject } from '@main/project/workspace'
import { buildSchemaFromSources } from '@main/schema/normalizer'
import { runSchemaJson } from '@main/schema/schema-json'
import type { SchemaModel } from '@shared/types/schema'

let cached: SchemaModel | null = null

export function getCachedSchema(): SchemaModel | null {
  return cached
}

function lubanMajor(version?: string): number {
  return Number.parseInt(version?.split('.')[0] ?? '0', 10)
}

export async function loadSchema(): Promise<SchemaModel> {
  const project = getCurrentProject()
  if (!project) throw new Error('未打开项目')

  let model: SchemaModel | null = null
  const useSchemaJson =
    project.runtime.available && lubanMajor(project.runtime.lubanVersion) >= 5
  if (useSchemaJson) {
    try {
      model = await runSchemaJson(project)
    } catch {
      // 落到自研解析，并在 warnings 中说明
    }
  }
  if (!model) {
    model = await buildSchemaFromSources(project.conf)
    if (useSchemaJson) {
      model.warnings.unshift('schema-json 通道执行失败，已降级为自研解析')
    }
  }
  cached = model
  return model
}

export function registerSchemaIpc(): void {
  handle('schema:get', async () => {
    if (cached) return cached
    return loadSchema()
  })

  handle('schema:reload', () => loadSchema())
}
