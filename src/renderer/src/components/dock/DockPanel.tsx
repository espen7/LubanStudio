import { useState } from 'react'
import { CircleAlert, Terminal } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type DockTab = 'problems' | 'output'

export function DockPanel(): React.JSX.Element {
  const [tab, setTab] = useState<DockTab>('problems')

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-stretch border-b border-line">
        <DockTabButton
          active={tab === 'problems'}
          onClick={(): void => setTab('problems')}
          icon={<CircleAlert size={13} />}
          label="Problems"
          badge={0}
        />
        <DockTabButton
          active={tab === 'output'}
          onClick={(): void => setTab('output')}
          icon={<Terminal size={13} />}
          label="Output"
        />
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center text-[12px] text-muted">
        {tab === 'problems' ? '校验问题将显示在这里' : 'Luban CLI 输出将显示在这里'}
      </div>
    </div>
  )
}

function DockTabButton({
  active,
  onClick,
  icon,
  label,
  badge
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  badge?: number
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-8 items-center gap-1.5 border-r border-line px-3 text-[12px]',
        active ? 'border-t-2 border-t-accent bg-app text-fg' : 'text-muted hover:text-fg'
      )}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-sm bg-error px-1 font-mono text-[10px] leading-4 text-panel">
          {badge}
        </span>
      )}
    </button>
  )
}
