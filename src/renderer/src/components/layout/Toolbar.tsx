import { FolderOpen, CircleCheck, Upload, RefreshCw, Settings2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export function Toolbar(): React.JSX.Element {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <ToolbarButton icon={<FolderOpen size={15} />} label="打开项目" />
      <ToolbarButton icon={<CircleCheck size={15} />} label="校验" />
      <ToolbarButton icon={<Upload size={15} />} label="导出" />
      <div className="mx-1 h-4 w-px bg-line" />
      <ToolbarButton icon={<RefreshCw size={15} />} label="重载 Schema" />
      <div className="flex-1" />
      <ToolbarButton icon={<Settings2 size={15} />} label="设置" />
    </div>
  )
}

function ToolbarButton({
  icon,
  label
}: {
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled
      title={label}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-sm px-2 text-muted',
        'cursor-not-allowed'
      )}
    >
      {icon}
      <span className="text-[12px]">{label}</span>
    </button>
  )
}
