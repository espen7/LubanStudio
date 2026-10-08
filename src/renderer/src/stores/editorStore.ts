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

interface EditorState {
  tabs: OpenTab[]
  activeId: string
  data: Record<string, TableData>
  dirtyCells: DirtyCellMap
  open: (tableId: string, tableName: string) => Promise<void>
  activate: (tableId: string) => void
  setCellText: (tableId: string, rowNumber: number, excelCol: number, text: string) => Promise<void>
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
      for (const id of ids) {
        delete data[id]
        delete dirtyCells[id]
      }
      let activeId = s.activeId
      if (ids.includes(activeId)) {
        activeId = tabs.some((t) => t.tableId === preferActive)
          ? preferActive
          : (tabs[tabs.length - 1]?.tableId ?? '')
      }
      return { tabs, data, dirtyCells, activeId }
    })
    showTableInSchema(get().activeId)
  }

  const confirmDiscard = (targets: OpenTab[]): boolean => {
    const dirtyNames = targets.filter((t) => t.dirty).map((t) => t.tableName)
    if (dirtyNames.length === 0) return true
    const suffix = dirtyNames.length > 1 ? '确定全部丢弃并关闭？' : '确定丢弃并关闭？'
    return window.confirm(`${dirtyNames.join('、')} 有未保存的修改，${suffix}`)
  }

  return {
  tabs: [],
  activeId: '',
  data: {},
  dirtyCells: {},

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
