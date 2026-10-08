import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Filter, Minus, Plus, RotateCw } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useEditorStore } from '@renderer/stores/editorStore'
import { useProjectStore } from '@renderer/stores/projectStore'

interface Menu {
  x: number
  y: number
}

export function EditorToolbar({
  tableId,
  onNotice
}: {
  tableId: string
  onNotice: (msg: string) => void
}): React.JSX.Element {
  const data = useEditorStore((s) => s.data[tableId])
  const selected = useEditorStore((s) => s.selection[tableId])
  const groupFilter = useEditorStore((s) => s.groupFilter[tableId]) ?? ''
  const refresh = useEditorStore((s) => s.refresh)
  const addRow = useEditorStore((s) => s.addRow)
  const deleteRow = useEditorStore((s) => s.deleteRow)
  const setGroupFilter = useEditorStore((s) => s.setGroupFilter)
  const project = useProjectStore((s) => s.project)
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

  // 候选组：luban.conf 声明的组在前，再补数据里出现过的组；带命中列数便于判断过滤效果
  const options = useMemo(() => {
    if (!data) return []
    const names: string[] = []
    for (const g of project?.conf.groups ?? []) {
      for (const n of g.names) if (!names.includes(n)) names.push(n)
    }
    for (const c of data.columns) {
      for (const g of c.groups) if (!names.includes(g)) names.push(g)
    }
    return names.map((name) => ({
      name,
      count: data.columns.filter((c) => c.groups.length === 0 || c.groups.includes(name)).length
    }))
  }, [data, project])

  if (!data) return <div className="h-8 shrink-0 border-b border-line bg-panel" />

  const rowOps = data.rowOps
  const active = groupFilter || ''

  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <ToolButton
        icon={<RotateCw size={15} />}
        label="刷新（从磁盘重新读取，丢弃未保存改动）"
        onClick={(): void => {
          void refresh(tableId).then((ok) => {
            if (ok) onNotice('已重新读取磁盘内容')
          })
        }}
      />
      <Divider />
      <ToolButton
        icon={<Plus size={15} />}
        label={rowOps.canAdd ? '新增行' : rowOps.reason ?? '该表不支持新增行'}
        disabled={!rowOps.canAdd}
        onClick={(): void => void addRow(tableId)}
      />
      <ToolButton
        icon={<Minus size={15} />}
        label={
          !rowOps.canDelete
            ? rowOps.reason ?? '该表不支持删除行'
            : !selected
              ? '先在表格中选中要删除的行'
              : '删除选中行'
        }
        disabled={!rowOps.canDelete || !selected}
        onClick={(): void => void deleteRow(tableId)}
      />
      <Divider />
      <button
        type="button"
        title="按分组过滤列"
        onClick={(e): void => {
          const rect = e.currentTarget.getBoundingClientRect()
          setMenu({ x: rect.left, y: rect.bottom + 2 })
        }}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px]',
          active ? 'bg-app text-accent' : 'text-fg hover:bg-app active:bg-app'
        )}
      >
        <Filter size={15} />
        {active ? `分组: ${active}` : '全部分组'}
      </button>
      {active && (
        <button
          type="button"
          title="清除分组过滤"
          onClick={(): void => setGroupFilter(tableId, '')}
          className="flex h-7 items-center rounded-sm px-1.5 text-[11px] text-muted hover:bg-app hover:text-fg"
        >
          清除
        </button>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-40 rounded-md border border-line bg-panel py-1 shadow-lg"
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - 40 * (options.length + 1))
          }}
        >
          <MenuItem
            label="全部分组"
            checked={!active}
            onClick={(): void => {
              setGroupFilter(tableId, '')
              setMenu(null)
            }}
          />
          {options.map((o) => (
            <MenuItem
              key={o.name}
              label={`${o.name}（${o.count} 列）`}
              checked={active === o.name}
              onClick={(): void => {
                setGroupFilter(tableId, o.name)
                setMenu(null)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolButton({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-sm',
        disabled ? 'cursor-not-allowed text-muted opacity-50' : 'text-fg hover:bg-app active:bg-app'
      )}
    >
      {icon}
    </button>
  )
}

function Divider(): React.JSX.Element {
  return <div className="mx-1 h-4 w-px bg-line" />
}

function MenuItem({
  label,
  checked,
  onClick
}: {
  label: string
  checked: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-6 w-full items-center gap-2 px-3 text-left text-[12px]',
        checked ? 'text-accent' : 'text-fg hover:bg-app'
      )}
    >
      <span className={cn('w-3 shrink-0', !checked && 'opacity-0')}>
        <Check size={12} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}
