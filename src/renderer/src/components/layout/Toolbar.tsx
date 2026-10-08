import { useEffect } from 'react'
import { FolderOpen, CircleCheck, Upload, RefreshCw, Settings2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useProjectStore } from '@renderer/stores/projectStore'

export function Toolbar(): React.JSX.Element {
  const openProject = useProjectStore((s) => s.openProject)
  const opening = useProjectStore((s) => s.opening)
  const project = useProjectStore((s) => s.project)

  useEffect(() => {
    void useProjectStore.getState().loadRecent()
  }, [])

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <ToolbarButton
        icon={<FolderOpen size={15} />}
        label="打开项目"
        disabled={opening}
        onClick={(): void => void openProject()}
      />
      <ToolbarButton icon={<CircleCheck size={15} />} label="校验" disabled={!project} />
      <ToolbarButton icon={<Upload size={15} />} label="导出" disabled={!project} />
      <div className="mx-1 h-4 w-px bg-line" />
      <ToolbarButton icon={<RefreshCw size={15} />} label="重载 Schema" disabled={!project} />
      <div className="flex-1" />
      <ToolbarButton icon={<Settings2 size={15} />} label="设置" />
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  disabled = true,
  onClick
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-sm px-2 text-[12px]',
        disabled
          ? 'cursor-not-allowed text-muted'
          : 'text-fg hover:bg-app active:bg-app'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
