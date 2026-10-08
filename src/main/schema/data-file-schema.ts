import ExcelJS from 'exceljs'
import { join, relative } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import type { RawBean, RawField, RawTable } from './raw-defs'
import type { LubanConf } from '@shared/types/project'

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
  }
  return ''
}

export interface DataFileHeader {
  sheetName: string
  varRow: number
  typeRow: number
  dataFirstRow: number
  fields: RawField[]
  multiLevel: boolean
}

/** 从数据 xlsx 的表头块（##var/##type/##group/##）提取字段定义（readSchemaFromFile 场景） */
export async function readDataFileSchema(file: string, warnings: string[]): Promise<DataFileHeader | null> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  for (const ws of wb.worksheets) {
    if (ws.rowCount === 0) continue
    let varRow = 0
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const a = cellText(ws.getRow(r).getCell(1).value).trim()
      if (a === '##var' || (a === '##' && r === 1)) {
        varRow = r
        break
      }
    }
    if (!varRow) continue

    let typeRow = 0
    let groupRow = 0
    let commentRow = 0
    for (let r = varRow + 1; r <= Math.min(ws.rowCount, varRow + 6); r++) {
      const a = cellText(ws.getRow(r).getCell(1).value).trim()
      if (a === '##type') typeRow = r
      else if (a === '##group') groupRow = r
      else if (a.startsWith('##')) {
        if (!commentRow) commentRow = r
      } else break
    }

    const varValues = ws.getRow(varRow).values
    const multiLevel =
      Array.isArray(varValues) &&
      varValues.some(
        (c) => typeof c === 'object' && c !== null && 'master' in (c as object)
      )
    if (multiLevel) {
      warnings.push(`${file}: 检测到多级表头（合并单元格），字段按展平处理`)
    }

    const fields: RawField[] = []
    ws.getRow(varRow).eachCell({ includeEmpty: false }, (cell, col) => {
      if (col === 1) return
      const name = cellText(cell.value).trim()
      if (!name || name.startsWith('#')) return
      const type = typeRow ? cellText(ws.getRow(typeRow).getCell(col).value).trim() : ''
      const groups = groupRow
        ? cellText(ws.getRow(groupRow).getCell(col).value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      let comment: string | undefined
      if (commentRow) {
        const c = cellText(ws.getRow(commentRow).getCell(col).value).trim()
        if (c) comment = c
      }
      fields.push({ name, rawType: type, groups, comment })
    })

    const headerLast = Math.max(varRow, typeRow, groupRow, commentRow)
    return {
      sheetName: ws.name,
      varRow,
      typeRow,
      dataFirstRow: headerLast + 1,
      fields,
      multiLevel
    }
  }
  warnings.push(`${file}: 未找到 ##var 表头块`)
  return null
}

/** 扫描 dataDir 下的 `#` 前缀数据文件（定义与数据合一），生成隐式表与 bean */
export async function scanAutoImportFiles(
  conf: LubanConf,
  warnings: string[]
): Promise<{ tables: RawTable[]; beans: RawBean[] }> {
  const tables: RawTable[] = []
  const beans: RawBean[] = []
  if (!existsSync(conf.dataDir)) return { tables, beans }

  const queue: string[] = [conf.dataDir]
  while (queue.length > 0) {
    const dir = queue.shift()!
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.') || name.startsWith('_') || name.startsWith('~')) continue
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) {
        queue.push(p)
        continue
      }
      if (!name.startsWith('#') || !/\.xlsx$/i.test(name)) continue

      // 目录决定模块；文件名（去 # 与扩展名）在首个 `.` 或 `-` 处截断：
      // 根目录 `#demo.item.xlsx` → 模块 demo / 名 item；`#A1-描述.xlsx` → 名 A1；子目录则模块取目录
      const dirPart = relative(conf.dataDir, dir).replaceAll('\\', '/')
      const baseName = name.slice(1).replace(/\.xlsx$/i, '')
      const cutAt = ['.', '-']
        .map((ch) => baseName.indexOf(ch))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0] ?? baseName.length
      const head = baseName.slice(0, cutAt)
      const tail = cutAt < baseName.length ? baseName.slice(cutAt + 1).split('-')[0] : ''
      let module: string
      let beanName: string
      if (dirPart) {
        module = dirPart.replaceAll('/', '.')
        beanName = head
      } else if (cutAt < baseName.length && baseName[cutAt] === '.') {
        module = head
        beanName = tail
      } else {
        module = ''
        beanName = head
      }

      const header = await readDataFileSchema(p, warnings)
      if (!header) continue

      beans.push({
        id: module ? `${module}.${beanName}` : beanName,
        module,
        name: beanName,
        abstract: false,
        comment: undefined,
        groups: [],
        fields: header.fields
      })
      tables.push({
        id: module ? `${module}.Tb${beanName}` : `Tb${beanName}`,
        module,
        name: `Tb${beanName}`,
        mode: 'map',
        valueType: module ? `${module}.${beanName}` : beanName,
        input: name,
        groups: [],
        readSchemaFromFile: true
      })
    }
  }
  return { tables, beans }
}
