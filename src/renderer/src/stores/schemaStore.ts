import { create } from 'zustand'
import type { SchemaModel } from '@shared/types/schema'

interface SchemaState {
  model: SchemaModel | null
  loading: boolean
  error: string
  selectedTableId: string
  selectedDefId: string
  filter: string
  load: () => Promise<void>
  reload: () => Promise<void>
  selectTable: (id: string) => void
  selectDef: (id: string) => void
  setFilter: (v: string) => void
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  model: null,
  loading: false,
  error: '',
  selectedTableId: '',
  selectedDefId: '',
  filter: '',

  load: async () => {
    if (!window.api) return
    if (get().loading) return
    set({ loading: true, error: '' })
    try {
      const model = await window.api.schema.get()
      set({ model, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  reload: async () => {
    if (!window.api) return
    set({ loading: true, error: '' })
    try {
      const model = await window.api.schema.reload()
      set({ model, loading: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false })
    }
  },

  selectTable: (id) => set({ selectedTableId: id, selectedDefId: '' }),
  selectDef: (id) => set({ selectedDefId: id, selectedTableId: '' }),
  setFilter: (v) => set({ filter: v })
}))
