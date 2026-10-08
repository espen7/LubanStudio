import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useEditorStore } from '@renderer/stores/editorStore'

export function EditorTabs(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const activate = useEditorStore((s) => s.activate)
  const close = useEditorStore((s) => s.close)

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-line bg-panel">
      {tabs.map((t) => (
        <div
          key={t.tableId}
          className={cn(
            'flex items-center gap-1.5 border-r border-line pl-3 pr-1.5 text-[12px]',
            activeId === t.tableId ? 'bg-app text-fg' : 'text-muted hover:text-fg'
          )}
        >
          <button type="button" onClick={(): void => activate(t.tableId)} className="py-1">
            <span className="flex items-center gap-1.5">
              {t.dirty && <span className="text-accent">●</span>}
              {t.tableName}
            </span>
          </button>
          <button
            type="button"
            onClick={(): void => void close(t.tableId)}
            className="rounded-sm p-0.5 hover:bg-line"
            title="关闭 (Ctrl+W)"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
