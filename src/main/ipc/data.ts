import { handle } from './register'
import { getCurrentProject } from '@main/project/workspace'
import { getCachedSchema, loadSchema } from './schema'
import { openTableData, getOpenedTable, closeOpenedTable } from '@main/data/table-data'
import { getWorkbook, markDirty, saveWorkbook, releaseWorkbook, forceReleaseWorkbook } from '@main/data/excel/workbook'
import { applyEdits } from '@main/data/excel/writer'
import { isEditableField } from '@main/data/excel/cell-io'
import type { CellEdit, DataCloseRequest } from '@shared/types/data'

export function registerDataIpc(): void {
  handle('data:open', async (req) => {
    const project = getCurrentProject()
    if (!project) throw new Error('未打开项目')
    const model = getCachedSchema() ?? (await loadSchema())
    const table = model.tables.find((t) => t.id === req.tableId)
    if (!table) throw new Error(`Schema 中不存在表: ${req.tableId}`)
    return openTableData(table, project.conf)
  })

  handle('data:update-cell', async (req: CellEdit) => {
    const opened = getOpenedTable(req.tableId)
    let field = opened.fieldByCol.get(req.excelCol)
    if (!field && opened.fieldByRow && opened.valueCol === req.excelCol) {
      field = opened.fieldByRow.get(req.rowNumber)
    }
    if (!field) throw new Error(`列 ${req.excelCol} 不可编辑`)
    if (!isEditableField(field)) {
      throw new Error(`字段 ${field.name}（${field.rawType || '未知类型'}）是只读类型，不能编辑`)
    }
    const { wb } = await getWorkbook(opened.file)
    applyEdits(wb, opened.sheetName, [
      { rowNumber: req.rowNumber, excelCol: req.excelCol, field, text: req.text }
    ])
    markDirty(opened.file)
    return { applied: true }
  })

  handle('data:save', async (req) => {
    const opened = getOpenedTable(req.tableId)
    const backupPath = await saveWorkbook(opened.file)
    return { saved: true, backupPath }
  })

  handle('data:close', (req: DataCloseRequest) => {
    const opened = getOpenedTable(req.tableId)
    const released = req.force ? true : releaseWorkbook(opened.file)
    if (req.force) forceReleaseWorkbook(opened.file)
    if (released) closeOpenedTable(req.tableId)
  })
}
