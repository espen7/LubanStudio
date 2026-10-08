import { create } from 'zustand'
import type { TableData } from '@shared/types/data'
import { useSchemaStore } from './schemaStore'

// 激活的 tab 即"当前查看的表"，Schema 面板与树高亮跟随它（与点树叶子行为一致）
const showTableInSchema = (tableId: string): void => {
  if (tableId) useSchemaStore.getState().selectTable(tableId)
}

export interface OpenTab {
  tableId: string
  tableName: string
  loading: boolean
  dirty: boolean
  error: string
}

/** 已修改未保存的单元格：tableId → Set<"rowNumber:excelCol"> */
export type DirtyCellMap = Record<string, Set<string>>

/** 网格当前选中单元格，用稳定身份（Excel 行号 + 列号）表达，不受列过滤影响 */
export interface CellPos {
  rowNumber: number
  excelCol: number
}

interface EditorState {
  tabs: OpenTab[]
  activeId: string
  data: Record<string, TableData>
  dirtyCells: DirtyCellMap
  /** tableId → 选中的 group 过滤（'' 表示不过滤） */
  groupFilter: Record<string, string>
  selection: Record<string, CellPos | undefined>
  open: (tableId: string, tableName: string) => Promise<void>
  activate: (tableId: string) => void
  setCellText: (tableId: string, rowNumber: number, excelCol: number, text: string) => Promise<void>
  setSelection: (tableId: string, pos: CellPos | undefined) => void
  setGroupFilter: (tableId: string, group: string) => void
  refresh: (tableId: string) => Promise<boolean>
  addRow: (tableId: string) => Promise<void>
  deleteRow: (tableId: string) => Promise<void>
  save: (tableId: string) => Promise<string | null>
  close: (tableId: string) => Promise<void>
  closeOthers: (tableId: string) => Promise<void>
  closeAll: () => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => {
  // 释放 main 侧 workbook 并清理本地状态；preferActive 用于批量关闭后保住被右键的 tab
  const closeTabs = async (ids: string[], preferActive: string): Promise<void> => {
    if (!window.api) return
    for (const tableId of ids) {
      const tab = get().tabs.find((t) => t.tableId === tableId)
      await window.api.data.close({ tableId, force: !!tab?.dirty }).catch(() => undefined)
    }
    set((s) => {
      const tabs = s.tabs.filter((t) => !ids.includes(t.tableId))
      const data = { ...s.data }
      const dirtyCells = { ...s.dirtyCells }
      const groupFilter = { ...s.groupFilter }
      const selection = { ...s.selection }
      for (const id of ids) {
        delete data[id]
        delete dirtyCells[id]
        delete groupFilter[id]
        delete selection[id]
      }
      let activeId = s.activeId
      if (ids.includes(activeId)) {
        activeId = tabs.some((t) => t.tableId === preferActive)
          ? preferActive
          : (tabs[tabs.length - 1]?.tableId ?? '')
      }
      return { tabs, data, dirtyCells, groupFilter, selection, activeId }
    })
    showTableInSchema(get().activeId)
  }

  const confirmDiscard = (targets: OpenTab[]): boolean => {
    const dirtyNames = targets.filter((t) => t.dirty).map((t) => t.tableName)
    if (dirtyNames.length === 0) return true
    const suffix = dirtyNames.length > 1 ? '确定全部丢弃并关闭？' : '确定丢弃并关闭？'
    return window.confirm(`${dirtyNames.join('、')} 有未保存的修改，${suffix}`)
  }

  const setError = (tableId: string, msg: string): void =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, error: msg } : t)) }))

  const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

  return {
  tabs: [],
  activeId: '',
  data: {},
  dirtyCells: {},
  groupFilter: {},
  selection: {},

  open: async (tableId, tableName) => {
    if (!window.api) return
    const existing = get().tabs.find((t) => t.tableId === tableId)
    if (existing) {
      set({ activeId: tableId })
      showTableInSchema(tableId)
      return
    }
    set((s) => ({
      tabs: [...s.tabs, { tableId, tableName, loading: true, dirty: false, error: '' }],
      activeId: tableId
    }))
    showTableInSchema(tableId)
    try {
      const data = await window.api.data.open(tableId)
      set((s) => ({
        data: { ...s.data, [tableId]: data },
        tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, loading: false } : t))
      }))
    } catch (e) {
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.tableId === tableId
            ? { ...t, loading: false, error: e instanceof Error ? e.message : String(e) }
            : t
        )
      }))
    }
  },

  activate: (tableId) => {
    set({ activeId: tableId })
    showTableInSchema(tableId)
  },

  setSelection: (tableId, pos) => {
    set((s) => ({ selection: { ...s.selection, [tableId]: pos } }))
  },

  setGroupFilter: (tableId, group) => {
    set((s) => ({
      groupFilter: { ...s.groupFilter, [tableId]: group },
      selection: { ...s.selection, [tableId]: undefined }
    }))
  },

  refresh: async (tableId) => {
    if (!window.api) return false
    const tab = get().tabs.find((t) => t.tableId === tableId)
    if (!tab) return false
    if (tab.dirty && !window.confirm(`${tab.tableName} 有未保存的修改，刷新会丢弃它们，确定？`)) return false
    try {
      const data = await window.api.data.refresh(tableId)
      set((s) => ({
        data: { ...s.data, [tableId]: data },
        tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, dirty: false, error: '' } : t)),
        dirtyCells: { ...s.dirtyCells, [tableId]: new Set<string>() },
        selection: { ...s.selection, [tableId]: undefined }
      }))
      return true
    } catch (e) {
      setError(tableId, errMsg(e))
      return false
    }
  },

  addRow: async (tableId) => {
    if (!window.api) return
    try {
      const data = await window.api.data.addRow(tableId)
      const last = data.rows[data.rows.length - 1]
      const firstCol = data.columns[0]?.excelCol
      set((s) => ({
        data: { ...s.data, [tableId]: data },
        selection:
          last && firstCol !== undefined
            ? { ...s.selection, [tableId]: { rowNumber: last.rowNumber, excelCol: firstCol } }
            : s.selection
      }))
    } catch (e) {
      setError(tableId, errMsg(e))
    }
  },

  deleteRow: async (tableId) => {
    if (!window.api) return
    const pos = get().selection[tableId]
    const data = get().data[tableId]
    if (!pos || !data) return
    const row = data.rows.find((r) => r.rowNumber === pos.rowNumber)
    const hadContent = !!row && row.cells.some((c) => c !== null && c !== '')
    try {
      const fresh = await window.api.data.deleteRow({ tableId, rowNumber: pos.rowNumber })
      // 下方行整体上移，脏格标记的行号跟着修正，删掉那行自身的标记
      const shifted = new Set<string>()
      for (const key of get().dirtyCells[tableId] ?? []) {
        const [r, col] = key.split(':')
        const rowNumber = Number(r)
        if (rowNumber === pos.rowNumber) continue
        shifted.add(`${rowNumber > pos.rowNumber ? rowNumber - 1 : rowNumber}:${col}`)
      }
      set((s) => ({
        data: { ...s.data, [tableId]: fresh },
        dirtyCells: { ...s.dirtyCells, [tableId]: shifted },
        selection: { ...s.selection, [tableId]: undefined },
        tabs: hadContent
          ? s.tabs.map((t) => (t.tableId === tableId ? { ...t, dirty: true } : t))
          : s.tabs
      }))
    } catch (e) {
      setError(tableId, errMsg(e))
    }
  },

  setCellText: async (tableId, rowNumber, excelCol, text) => {
    if (!window.api) return
    const data = get().data[tableId]
    if (!data) return
    const key = `${rowNumber}:${excelCol}`
    // 乐观更新：本地先显示输入文本，main 侧解析失败再回滚
    const prev = data
    const rows = data.rows.map((r) => {
      if (r.rowNumber !== rowNumber) return r
      const idx = data.columns.findIndex((c) => c.excelCol === excelCol)
      const cells = [...r.cells]
      cells[idx] = text === '' ? null : text
      return { ...r, cells }
    })
    set((s) => ({
      data: { ...s.data, [tableId]: { ...data, rows } },
      tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, dirty: true } : t)),
      dirtyCells: {
        ...s.dirtyCells,
        [tableId]: new Set(s.dirtyCells[tableId]).add(key)
      }
    }))
    try {
      await window.api.data.updateCell({ tableId, rowNumber, excelCol, text: text === '' ? null : text })
    } catch (e) {
      set((s) => {
        const rollback = new Set(s.dirtyCells[tableId])
        rollback.delete(key)
        return {
          data: { ...s.data, [tableId]: prev },
          tabs: s.tabs.map((t) =>
            t.tableId === tableId
              ? { ...t, error: e instanceof Error ? e.message : String(e) }
              : t
          ),
          dirtyCells: { ...s.dirtyCells, [tableId]: rollback }
        }
      })
    }
  },

  save: async (tableId) => {
    if (!window.api) return null
    const tab = get().tabs.find((t) => t.tableId === tableId)
    if (!tab) return null
    try {
      const result = await window.api.data.save(tableId)
      // 保存后重读以获得 main 侧解析后的规范值（workbook 已缓存，开销小）
      const data = await window.api.data.open(tableId)
      set((s) => ({
        data: { ...s.data, [tableId]: data },
        tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, dirty: false, error: '' } : t)),
        dirtyCells: { ...s.dirtyCells, [tableId]: new Set() }
      }))
      return result.backupPath ?? null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set((s) => ({
        tabs: s.tabs.map((t) => (t.tableId === tableId ? { ...t, error: msg } : t))
      }))
      return null
    }
  },

  close: async (tableId) => {
    const tab = get().tabs.find((t) => t.tableId === tableId)
    if (!tab) return
    if (!confirmDiscard([tab])) return
    await closeTabs([tableId], '')
  },

  closeOthers: async (tableId) => {
    const targets = get().tabs.filter((t) => t.tableId !== tableId)
    if (targets.length === 0) return
    if (!confirmDiscard(targets)) return
    await closeTabs(targets.map((t) => t.tableId), tableId)
  },

  closeAll: async () => {
    const targets = get().tabs
    if (targets.length === 0) return
    if (!confirmDiscard(targets)) return
    await closeTabs(targets.map((t) => t.tableId), '')
  }
  }
})
