import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LubanProject } from '@shared/types/project'
import type { SchemaModel } from '@shared/types/schema'
import { mapSchemaJson } from './schema-json-mapper'

const execFileAsync = promisify(execFile)

/** v5 增强通道：dotnet Luban.dll -c schema-json 导出官方结构化 Schema */
export async function runSchemaJson(project: LubanProject): Promise<SchemaModel> {
  const { runtime, confPath, conf } = project
  if (!runtime.available) {
    throw new Error('Luban 运行时不可用，无法执行 schema-json')
  }
  const target = conf.targets.find((t) => t.name === 'all')?.name ?? conf.targets[0]?.name
  if (!target) throw new Error('luban.conf 未定义 targets')

  const outDir = mkdtempSync(join(tmpdir(), 'luban-studio-schema-'))
  try {
    await execFileAsync(
      runtime.dotnetCommand,
      [
        runtime.lubanDllPath,
        '-t',
        target,
        '-c',
        'schema-json',
        '--conf',
        confPath,
        '-x',
        `outputCodeDir=${outDir}`
      ],
      { timeout: 120_000, cwd: conf.root }
    )
    const schemaFile = join(outDir, 'schema.json')
    if (!existsSync(schemaFile)) {
      throw new Error('schema-json 运行完成但未产出 schema.json')
    }
    return mapSchemaJson(JSON.parse(readFileSync(schemaFile, 'utf-8')))
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}
