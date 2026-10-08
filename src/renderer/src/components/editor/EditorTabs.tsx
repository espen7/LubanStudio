import { useEffect, useRef, useState } from 'react'
import { Table2, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useEditorStore } from '@renderer/stores/editorStore'

interface TabMenu {
  x: number
  y: number
  tableId: string
}

export function EditorTabs(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const activate = useEditorStore((s) => s.activate)
  const close = useEditorStore((s) => s.close)
  const closeOthers = useEditorStore((s) => s.closeOthers)
  const closeAll = useEditorStore((s) => s.closeAll)
  const [menu, setMenu] = useState<TabMenu | null>(null)
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

  const menuItem = (
    label: string,
    hint: string,
    disabled: boolean,
    run: () => Promise<void>
  ): React.JSX.Element => (
    <button
      type="button"
      disabled={disabled}
      onClick={(): void => {
        setMenu(null)
        void run()
      }}
      className={cn(
        'flex w-full items-center justify-between gap-6 px-3 py-1 text-left text-[12px]',
        disabled ? 'cursor-default text-muted opacity-50' : 'text-fg hover:bg-app'
      )}
    >
      <span className="truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] text-muted">{hint}</span>}
    </button>
  )

  const menuTab = menu ? tabs.find((t) => t.tableId === menu.tableId) : undefined

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-0.5 border-b border-line bg-panel pl-1.5">
      {tabs.map((t) => {
        const active = activeId === t.tableId
        return (
          <div
            key={t.tableId}
            onContextMenu={(e): void => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, tableId: t.tableId })
            }}
            className={cn(
              'group relative flex min-w-0 max-w-44 items-center gap-1 rounded-t-md pl-2.5 pr-1 text-[12px]',
              active
                ? 'bg-app text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-app'
                : 'text-muted hover:bg-line/40 hover:text-fg'
            )}
          >
            <button
              type="button"
              onClick={(): void => activate(t.tableId)}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
              title={t.tableName}
            >
              <Table2
                size={13}
                className={cn('shrink-0', active ? 'text-accent' : 'text-muted group-hover:text-fg')}
              />
              <span className="truncate">{t.tableName}</span>
            </button>
            <button
              type="button"
              onClick={(): void => void close(t.tableId)}
              className="rounded-sm p-0.5 hover:bg-line"
              title="关闭 (Ctrl+W)"
            >
              {t.dirty ? (
                <>
                  <span className="block text-[10px] leading-none text-accent group-hover:hidden">
                    ●
                  </span>
                  <X size={12} className="hidden group-hover:block" />
                </>
              ) : (
                <X size={12} className={cn(!active && 'hidden group-hover:block')} />
              )}
            </button>
          </div>
        )
      })}
      {menu && menuTab && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-48 rounded-md border border-line bg-panel py-1 shadow-lg"
          style={{
            left: Math.min(menu.x, window.innerWidth - 220),
            top: Math.min(menu.y, window.innerHeight - 130)
          }}
        >
          {menuItem(`关闭 ${menuTab.tableName}`, 'Ctrl+W', false, () => close(menuTab.tableId))}
          {menuItem('关闭其他', '', tabs.length < 2, () => closeOthers(menuTab.tableId))}
          {menuItem('关闭所有', '', false, () => closeAll())}
        </div>
      )}
    </div>
  )
}
