import ExcelJS from 'exceljs'
import { copyFileSync, existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const MAX_OPEN = 8

interface Entry {
  wb: ExcelJS.Workbook
  file: string
  dirty: boolean
  lastUsed: number
  warnings: string[]
}

const cache = new Map<string, Entry>()

export function backupPathFor(file: string): string {
  return join(dirname(file), basename(file).replace(/(\.xlsx)$/i, '.luban-bak$1'))
}

function detectWarnings(wb: ExcelJS.Workbook, file: string): string[] {
  const warnings: string[] = []
  const imageCount = wb.worksheets.reduce((n, ws) => n + ws.getImages().length, 0)
  if (imageCount > 0) {
    warnings.push(`${basename(file)}: 包含 ${imageCount} 个图片/绘制对象，保存可能丢失，请检查 .luban-bak 备份`)
  }
  return warnings
}

function evict(): void {
  if (cache.size <= MAX_OPEN) return
  const candidates = [...cache.values()].filter((e) => !e.dirty).sort((a, b) => a.lastUsed - b.lastUsed)
  const overflow = cache.size - MAX_OPEN
  for (const e of candidates.slice(0, overflow)) cache.delete(e.file)
}

export async function getWorkbook(file: string): Promise<{ wb: ExcelJS.Workbook; warnings: string[] }> {
  const hit = cache.get(file)
  if (hit) {
    hit.lastUsed = Date.now()
    return { wb: hit.wb, warnings: hit.warnings }
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const warnings = detectWarnings(wb, file)
  cache.set(file, { wb, file, dirty: false, lastUsed: Date.now(), warnings })
  evict()
  return { wb, warnings }
}

export function markDirty(file: string): void {
  const hit = cache.get(file)
  if (hit) hit.dirty = true
}

export function isDirty(file: string): boolean {
  return cache.get(file)?.dirty ?? false
}

/** 保存；首次保存先落 .luban-bak 备份。返回备份路径（未新建则 undefined） */
export async function saveWorkbook(file: string): Promise<string | undefined> {
  const entry = cache.get(file)
  if (!entry) throw new Error(`文件未在会话中打开: ${file}`)
  if (!entry.dirty) return undefined
  let backupPath: string | undefined
  const bp = backupPathFor(file)
  if (!existsSync(bp)) {
    copyFileSync(file, bp)
    backupPath = bp
  }
  await entry.wb.xlsx.writeFile(file)
  entry.dirty = false
  return backupPath
}

/** 未脏才释放；返回是否真正移除 */
export function releaseWorkbook(file: string): boolean {
  const entry = cache.get(file)
  if (!entry) return true
  if (entry.dirty) return false
  cache.delete(file)
  return true
}

export function forceReleaseWorkbook(file: string): void {
  cache.delete(file)
}
