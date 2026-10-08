import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { detectRuntime } from './discovery'
import { DEFAULT_SETTINGS } from '@shared/types/settings'

const EXAMPLES_ROOT = join(__dirname, '../../../.sandbox/luban_examples')

describe('detectRuntime（真实环境）', () => {
  it('发现 PATH 上的 dotnet ≥8 与 examples 自带的 Tools/Luban', async () => {
    const runtime = await detectRuntime(EXAMPLES_ROOT, DEFAULT_SETTINGS)
    expect(runtime.dotnetCommand).toBe('dotnet')
    expect(runtime.dotnetVersion && Number(runtime.dotnetVersion.split('.')[0]) >= 8).toBe(true)
    expect(runtime.lubanDllPath).toBe(join(EXAMPLES_ROOT, 'Tools', 'Luban', 'Luban.dll'))
    expect(runtime.lubanVersion).toBe('5.1.0')
    expect(runtime.available).toBe(true)
    expect(runtime.problems).toHaveLength(0)
  })

  it('无 Luban.dll 的目录给出 problems 且 available=false', async () => {
    const runtime = await detectRuntime(join(tmpdirSafe()), DEFAULT_SETTINGS)
    expect(runtime.available).toBe(false)
    expect(runtime.problems.some((p) => p.includes('未找到 Luban.dll'))).toBe(true)
  })

  it('settings 覆盖 lubanDll 生效', async () => {
    const runtime = await detectRuntime(EXAMPLES_ROOT, {
      ...DEFAULT_SETTINGS,
      lubanDllOverride: join(EXAMPLES_ROOT, 'Tools', 'Luban', 'Luban.dll')
    })
    expect(runtime.lubanDllPath).toContain('Luban.dll')
    expect(runtime.lubanVersion).toBe('5.1.0')
  })
})

function tmpdirSafe(): string {
  return process.env.TEMP ?? 'C:\\Windows\\Temp'
}
