import { useEffect, useState } from 'react'
import { Table2 } from 'lucide-react'
import { useEditorStore } from '@renderer/stores/editorStore'
import { EditorTabs } from './EditorTabs'
import { GridView } from './GridView'

export function EditorArea(): React.JSX.Element {
  const tabs = useEditorStore((s) => s.tabs)
  const activeId = useEditorStore((s) => s.activeId)
  const data = useEditorStore((s) => s.data[activeId])
  const save = useEditorStore((s) => s.save)
  const close = useEditorStore((s) => s.close)
  const activate = useEditorStore((s) => s.activate)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (activeId) {
          void save(activeId).then((backup) => {
            setNotice(backup ? `已保存，备份: ${backup}` : '已保存')
          })
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (activeId) void close(activeId)
      } else if (e.ctrlKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault()
        if (tabs.length < 2) return
        const idx = tabs.findIndex((t) => t.tableId === activeId)
        const cur = idx === -1 ? 0 : idx
        const next = e.key === 'PageDown' ? (cur + 1) % tabs.length : (cur - 1 + tabs.length) % tabs.length
        activate(tabs[next].tableId)
      }
    }
    // 捕获阶段：GDG 网格聚焦时其内部 keydown 处理可能吞掉冒泡，快捷键需优先于它
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeId, tabs, save, close, activate])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const activeTab = tabs.find((t) => t.tableId === activeId)

  return (
    <div className="flex h-full min-w-0 flex-col bg-panel">
      <EditorTabs />
      {!activeTab || tabs.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-muted">
          <Table2 size={28} strokeWidth={1.5} />
          <p className="text-[12px]">在左侧项目树中选择表以打开编辑</p>
          <p className="text-[11px]">
            <kbd className="rounded-sm border border-line px-1 font-mono">Ctrl</kbd>
            {' + '}
            <kbd className="rounded-sm border border-line px-1 font-mono">S</kbd> 保存
          </p>
        </div>
      ) : activeTab.error ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6">
          <p className="text-[12px] text-error">{activeTab.error}</p>
        </div>
      ) : activeTab.loading || !data ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-muted">
          加载中…
        </div>
      ) : (
        <>
          <GridView tableId={activeId} />
          {(notice || activeTab.error || data.warnings.length > 0) && (
            <div className="shrink-0 border-t border-line px-2 py-1 text-[11px] leading-4">
              {activeTab.error && <div className="text-error">{activeTab.error}</div>}
              {notice && <div className="text-fg">{notice}</div>}
              {data.warnings.slice(0, 2).map((w, i) => (
                <div key={i} className="truncate text-warn" title={w}>
                  {w}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
