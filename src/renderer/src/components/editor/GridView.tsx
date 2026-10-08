import '@glideapps/glide-data-grid/dist/index.css'
import {
  CompactSelection,
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
import { useSchemaStore } from '@renderer/stores/schemaStore'
import { editToText, toGridCell, toGridColumns } from './grid-adapter'

const dataGridTheme: Partial<Theme> = {
  baseFontStyle: '15px',
  headerFontStyle: '600 13px',
  fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif'
}

const emptyCell: GridCell = { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false }

export function GridView({ tableId }: { tableId: string }): React.JSX.Element {
  const data = useEditorStore((s) => s.data[tableId])
  const dirtyCells = useEditorStore((s) => s.dirtyCells[tableId])
  const setCellText = useEditorStore((s) => s.setCellText)
  const selection = useEditorStore((s) => s.selection[tableId])
  const setSelection = useEditorStore((s) => s.setSelection)
  const groupFilter = useEditorStore((s) => s.groupFilter[tableId])
  const indexField = useSchemaStore((s) =>
    s.model?.tables.find((t) => t.id === tableId)?.index
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [colWidths, setColWidths] = useState<Record<string, number>>({})
  const dirtyRef = useRef(dirtyCells)
  dirtyRef.current = dirtyCells

  useEffect(() => {
    setSelection(tableId, undefined)
    setColWidths({})
  }, [tableId, setSelection])

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

  // 可见列 → data.columns 下标；无 group 的列在任何过滤下都保留（Luban 语义），主键列始终保留
  const colIndex = useMemo(() => {
    const all = data?.columns.map((_, i) => i) ?? []
    const sel = groupFilter ?? []
    if (!data || sel.length === 0) return all
    return all.filter((i) => {
      const c = data.columns[i]
      if (indexField && c.fieldName === indexField) return true
      return c.groups.length === 0 || c.groups.some((g) => sel.includes(g))
    })
  }, [data, groupFilter, indexField])

  const columns = useMemo(
    () => (data ? toGridColumns(colIndex.map((i) => data.columns[i]), colWidths) : []),
    [data, colIndex, colWidths]
  )

  const selRow = useMemo(
    () => (data && selection ? data.rows.findIndex((r) => r.rowNumber === selection.rowNumber) : -1),
    [data, selection]
  )
  const selCol = useMemo(
    () =>
      data && selection
        ? colIndex.findIndex((i) => data.columns[i].excelCol === selection.excelCol)
        : -1,
    [data, selection, colIndex]
  )
  // 依赖只取行列下标，保证对象身份稳定，避免回灌给受控 DataEditor 时反复触发 onChange
  const gridSelection = useMemo<GridSelection | undefined>(() => {
    if (selRow < 0 || selCol < 0) return undefined
    return {
      current: {
        cell: [selCol, selRow],
        range: { x: selCol, y: selRow, width: 1, height: 1 },
        rangeStack: []
      },
      columns: CompactSelection.empty(),
      rows: CompactSelection.empty()
    }
  }, [selRow, selCol])

  const onGridSelectionChange = useCallback(
    (sel: GridSelection | undefined): void => {
      if (!data || !sel) {
        setSelection(tableId, undefined)
        return
      }
      // 点行号选中整行时没有 current.cell，退到 rows 首行 + 首个可见列
      const row = sel.current?.cell[1] ?? (sel.rows.length > 0 ? sel.rows.first() : undefined)
      const col = sel.current?.cell[0] ?? 0
      const rowData = row === undefined ? undefined : data.rows[row]
      const binding = col === undefined ? undefined : data.columns[colIndex[col]]
      if (!rowData || !binding) {
        setSelection(tableId, undefined)
        return
      }
      setSelection(tableId, { rowNumber: rowData.rowNumber, excelCol: binding.excelCol })
    },
    [data, colIndex, tableId, setSelection]
  )

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      if (!data) return emptyCell
      const src = colIndex[col]
      const binding = data.columns[src]
      const rowData = data.rows[row]
      if (!binding || !rowData) return emptyCell
      return toGridCell(binding, rowData.cells[src] ?? null, rowData.cellEditable?.[src])
    },
    [data, colIndex]
  )

  const onCellEdited = useCallback(
    (cell: Item, newVal: EditableGridCell): void => {
      if (!data) return
      const src = colIndex[cell[0]]
      const binding = data.columns[src]
      const rowData = data.rows[cell[1]]
      if (!binding || !rowData) return
      if (!(rowData.cellEditable ? rowData.cellEditable[src] : binding.editable)) return
      void setCellText(data.tableId, rowData.rowNumber, binding.excelCol, editToText(newVal))
    },
    [data, colIndex, setCellText]
  )

  const onColumnResize = useCallback((col: GridColumn, newSize: number): void => {
    const id = String(col.id)
    setColWidths((prev) => ({ ...prev, [id]: newSize }))
  }, [])

  const drawCell = useCallback<DrawCellCallback>(
    (args, drawContent) => {
      const binding = data?.columns[colIndex[args.col]]
      if (binding?.comment) {
        // 注释列按代码注释样式绘制（灰色斜体）。选中环在单元格之后绘制，跳过默认文本不影响选中态
        const { ctx, theme } = args
        const prevFont = ctx.font
        const prevFill = ctx.fillStyle
        ctx.font = `italic ${theme.baseFontStyle} ${theme.fontFamily}`
        ctx.fillStyle = theme.textMedium
        drawContent()
        ctx.font = prevFont
        ctx.fillStyle = prevFill
      } else {
        drawContent()
      }
      const dirty = dirtyRef.current
      if (!dirty || !data || !binding) return
      const rowData = data.rows[args.row]
      if (!rowData) return
      if (dirty.has(`${rowData.rowNumber}:${binding.excelCol}`)) {
        const { ctx, rect } = args
        ctx.fillStyle = 'rgba(79, 93, 255, 0.14)'
        ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2)
      }
    },
    [data, colIndex]
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
          onGridSelectionChange={onGridSelectionChange}
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
