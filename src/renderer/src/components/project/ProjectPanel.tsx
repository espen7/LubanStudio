import { Search, FolderOpen } from 'lucide-react'

export function ProjectPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
        <Search size={13} className="shrink-0 text-muted" />
        <input
          type="text"
          placeholder="筛选表 / 结构 / 枚举"
          disabled
          className="h-6 w-full rounded-sm border border-line bg-app px-1.5 text-[12px] text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-muted">
        <FolderOpen size={28} strokeWidth={1.5} />
        <p className="text-center text-[12px] leading-5">
          未打开项目
          <br />
          通过工具栏「打开项目」选择 luban.conf
        </p>
      </div>
    </div>
  )
}
