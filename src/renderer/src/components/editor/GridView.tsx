import '@glideapps/glide-data-grid/dist/index.css'
import { DataEditor, GridCellKind, type EditableGridCell, type GridCell, type Item, type Theme } from '@glideapps/glide-data-grid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditorStore } from '@renderer/stores/editorStore'
import { editToText, toGridCell, toGridColumns } from './grid-adapter'

export function GridView({ tableId }: { tableId: string }): React.JSX.Element {
  const data = useEditorStore((s) => s.data[tableId])
  const setCellText = useEditorStore((s) => s.setCellText)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

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

  const columns = useMemo(() => (data ? toGridColumns(data.columns) : []), [data])

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
          rowMarkers="number"
          rowMarkerWidth={52}
          freezeColumns={0}
          smoothScrollX
          smoothScrollY
          getRowThemeOverride={(row): Partial<Theme> => (row % 2 === 0 ? { bgCell: '#f7f7f8' } : {})}
        />
      )}
    </div>
  )
}
