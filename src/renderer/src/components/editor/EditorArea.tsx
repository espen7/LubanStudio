import { Table2 } from 'lucide-react'

export function EditorArea(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center border-b border-line px-2 text-[12px] text-muted">
        表页签
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-muted">
        <Table2 size={28} strokeWidth={1.5} />
        <p className="text-[12px]">在左侧项目树中选择表以打开编辑</p>
        <p className="text-[11px]">
          <kbd className="rounded-sm border border-line px-1 font-mono">Ctrl</kbd>
          {' + '}
          <kbd className="rounded-sm border border-line px-1 font-mono">S</kbd> 保存
        </p>
      </div>
    </div>
  )
}
