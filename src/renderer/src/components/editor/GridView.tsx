import '@glideapps/glide-data-grid/dist/index.css'
import {
  DataEditor,
  GridCellKind,
  type DrawCellCallback,
  type EditableGridCell,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type Theme
} from '@glideapps/glide-data-grid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@renderer/stores/editorStore'
import { editToText, toGridCell, toGridColumns } from './grid-adapter'

const dataGridTheme: Partial<Theme> = {
  baseFontStyle: '15px',
  headerFontStyle: '600 13px',
  fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif'
}

export function GridView({ tableId }: { tableId: string }): React.JSX.Element {
  const data = useEditorStore((s) => s.data[tableId])
  const dirtyCells = useEditorStore((s) => s.dirtyCells[tableId])
  const setCellText = useEditorStore((s) => s.setCellText)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const [gridSelection, setGridSelection] = useState<GridSelection | undefined>(undefined)
  const dirtyRef = useRef(dirtyCells)
  dirtyRef.current = dirtyCells

  useEffect(() => {
    setGridSelection(undefined)
    setColWidths({})
  }, [tableId])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect
      setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = useMemo(
    () => (data ? toGridColumns(data.columns, colWidths) : []),
    [data, colWidths]
  )

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (!data) return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }
      const binding = data.columns[col]
      const rowData = data.rows[row]
      if (!binding || !rowData) {
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }
      }
      return toGridCell(binding, rowData.cells[col] ?? null, rowData.cellEditable?.[col])
    },
    [data]
  )

  const onCellEdited = useCallback(
    (cell: Item, newVal: EditableGridCell): void => {
      if (!data) return
      const binding = data.columns[cell[0]]
      const rowData = data.rows[cell[1]]
      if (!binding || !rowData) return
      if (!(rowData.cellEditable ? rowData.cellEditable[cell[0]] : binding.editable)) return
      void setCellText(data.tableId, rowData.rowNumber, binding.excelCol, editToText(newVal))
    },
    [data, setCellText]
  )

  const onColumnResize = useCallback((col: GridColumn, newSize: number): void => {
    const id = String(col.id)
    setColWidths((prev) => ({ ...prev, [id]: newSize }))
  }, [])

  const drawCell = useCallback<DrawCellCallback>(
    (args, drawContent) => {
      drawContent()
      const dirty = dirtyRef.current
      if (!dirty || !data) return
      const binding = data.columns[args.col]
      const rowData = data.rows[args.row]
      if (!binding || !rowData) return
      if (dirty.has(`${rowData.rowNumber}:${binding.excelCol}`)) {
        const { ctx, rect } = args
        ctx.fillStyle = 'rgba(79, 93, 255, 0.14)'
        ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2)
      }
    },
    [data]
  )

  return (
    <div ref={containerRef} className="min-h-0 flex-1">
      {data && size.width > 0 && size.height > 0 && (
        <DataEditor
          width={size.width}
          height={size.height}
          columns={columns}
          rows={data.rows.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onColumnResize={onColumnResize}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          drawCell={drawCell}
          rowMarkers="number"
          rowMarkerWidth={52}
          freezeColumns={0}
          smoothScrollX
          smoothScrollY
          theme={dataGridTheme}
          getRowThemeOverride={(row): Partial<Theme> => (row % 2 === 0 ? { bgCell: '#f7f7f8' } : {})}
        />
      )}
    </div>
  )
}
