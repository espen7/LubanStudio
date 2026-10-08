import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join, dirname, isAbsolute } from 'node:path'
import { readdir } from 'node:fs/promises'
import type { LubanRuntime } from '@shared/types/project'
import type { AppSettings } from '@shared/types/settings'

const execFileAsync = promisify(execFile)

function dotnetMajor(version: string): number {
  return Number.parseInt(version.split('.')[0] ?? '0', 10)
}

async function probeDotnet(command: string): Promise<{ version?: string; problem?: string }> {
  try {
    const { stdout } = await execFileAsync(command, ['--version'], { timeout: 15_000 })
    const version = stdout.trim().split('\n')[0] ?? ''
    if (!/^\d+(\.\d+)*/.test(version)) {
      return { problem: `dotnet --version 输出无法识别: ${version}` }
    }
    if (dotnetMajor(version) < 8) {
      return { version, problem: `dotnet 版本 ${version} 低于 Luban 要求的 8.0` }
    }
    return { version }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { problem: `无法执行 ${command}: ${msg}` }
  }
}

async function findLubanDll(confRoot: string): Promise<string> {
  const candidates = [
    join(confRoot, 'Tools', 'Luban', 'Luban.dll'),
    join(dirname(confRoot), 'Tools', 'Luban', 'Luban.dll'),
    join(confRoot, 'luban', 'Luban.dll')
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return walkForLubanDll(confRoot, 3)
}

async function walkForLubanDll(dir: string, depth: number): Promise<string> {
  if (depth < 0) return ''
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return ''
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    if (!e.isDirectory()) continue
    const candidate = join(dir, e.name, 'Luban.dll')
    if (existsSync(candidate)) return candidate
    const nested = await walkForLubanDll(join(dir, e.name), depth - 1)
    if (nested) return nested
  }
  return ''
}

async function probeLubanVersion(
  dotnetCommand: string,
  dllPath: string
): Promise<string | undefined> {
  // --version 把版本打到 stderr 且 exit 1（CommandLine 库的怪癖），忽略退出码、合并两流
  let combined = ''
  try {
    const { stdout, stderr } = await execFileAsync(dotnetCommand, [dllPath, '--version'], {
      timeout: 30_000
    })
    combined = `${stdout}\n${stderr}`
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    combined = `${err.stdout ?? ''}\n${err.stderr ?? ''}`
  }
  const m = /Luban (\d+\.\d+\.\d+)/.exec(combined)
  return m?.[1]
}

export async function detectRuntime(
  confRoot: string,
  settings: AppSettings
): Promise<LubanRuntime> {
  const problems: string[] = []

  const dotnetCommand = settings.dotnetCommandOverride || 'dotnet'
  const dotnet = await probeDotnet(dotnetCommand)
  if (dotnet.problem) problems.push(dotnet.problem)

  let lubanDllPath = ''
  if (settings.lubanDllOverride) {
    const p = isAbsolute(settings.lubanDllOverride)
      ? settings.lubanDllOverride
      : join(confRoot, settings.lubanDllOverride)
    if (existsSync(p)) {
      lubanDllPath = p
    } else {
      problems.push(`设置中的 Luban.dll 路径不存在: ${p}`)
    }
  }
  if (!lubanDllPath) {
    lubanDllPath = await findLubanDll(confRoot)
    if (!lubanDllPath) {
      problems.push(`在 ${confRoot} 附近未找到 Luban.dll（约定位置 Tools/Luban/，可在设置中指定）`)
    }
  }

  const available = !dotnet.problem && lubanDllPath !== ''
  const lubanVersion =
    available ? await probeLubanVersion(dotnetCommand, lubanDllPath) : undefined

  return {
    dotnetCommand,
    dotnetVersion: dotnet.version,
    lubanDllPath,
    lubanVersion,
    available,
    problems
  }
}
