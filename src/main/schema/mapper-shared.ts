import type { TableInput } from '@shared/types/schema'

/** input 描述串 → TableInput[]（"表名@文件" / 目录，多段逗号分隔；xml 与 schema-json 共用） */
export function parseInput(raw: string): TableInput[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf('@')
      return at >= 0
        ? { tableName: part.slice(0, at), file: part.slice(at + 1) }
        : { tableName: '', file: part }
    })
}
