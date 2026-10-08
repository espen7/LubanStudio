import { handle } from './register'
import { getCurrentProject } from '@main/project/workspace'
import { getCachedSchema, loadSchema } from './schema'
import {
  openTableData,
  getOpenedTable,
  closeOpenedTable,
  listOpenedOnFile,
  addBlankRow,
  deleteDataRow
} from '@main/data/table-data'
import {
  getWorkbook,
  isDirty,
  markDirty,
  saveWorkbook,
  releaseWorkbook,
  forceReleaseWorkbook
} from '@main/data/excel/workbook'
import { applyEdits } from '@main/data/excel/writer'
import { isEditableField } from '@main/data/excel/cell-io'
import type { CellEdit, DataCloseRequest, RowDeleteRequest, TableData } from '@shared/types/data'

async function reopen(tableId: string): Promise<TableData> {
  const project = getCurrentProject()
  if (!project) throw new Error('未打开项目')
  const model = getCachedSchema() ?? (await loadSchema())
  const table = model.tables.find((t) => t.id === tableId)
  if (!table) throw new Error(`Schema 中不存在表: ${tableId}`)
  return openTableData(table, project.conf)
}

export function registerDataIpc(): void {
  handle('data:open', async (req) => reopen(req.tableId))

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

  handle('data:add-row', async (req) => {
    await addBlankRow(req.tableId)
    return reopen(req.tableId)
  })

  handle('data:delete-row', async (req: RowDeleteRequest) => {
    await deleteDataRow(req.tableId, req.rowNumber)
    return reopen(req.tableId)
  })

  handle('data:refresh', async (req) => {
    const t = getOpenedTable(req.tableId)
    if (isDirty(t.file)) {
      const others = listOpenedOnFile(t.file).filter((id) => id !== req.tableId)
      if (others.length > 0) {
        throw new Error(
          `该数据文件还有 ${others.length} 个其他表处于打开状态且有未保存的修改，刷新会一并丢弃；请先保存它们`
        )
      }
    }
    closeOpenedTable(req.tableId)
    forceReleaseWorkbook(t.file)
    return reopen(req.tableId)
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
