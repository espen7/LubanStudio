import { Braces } from 'lucide-react'

export function SchemaPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center border-b border-line px-2 text-[12px] text-muted">
        Schema
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 text-muted">
        <Braces size={28} strokeWidth={1.5} />
        <p className="text-center text-[12px] leading-5">选择表后展示字段结构</p>
      </div>
    </div>
  )
}
