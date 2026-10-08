import { useProjectStore } from '@renderer/stores/projectStore'

export function StatusBar(): React.JSX.Element {
  const project = useProjectStore((s) => s.project)
  const error = useProjectStore((s) => s.error)
  const opening = useProjectStore((s) => s.opening)

  let left: string
  if (opening) {
    left = '打开项目中…'
  } else if (error) {
    left = error
  } else if (project) {
    left = project.confPath
  } else {
    left = '未打开项目'
  }

  const runtime = project?.runtime

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-panel px-2 text-[11px] text-muted">
      <div className="flex min-w-0 items-center gap-3">
        <span className={error ? 'text-error' : ''}>{left}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3 font-mono">
        <span>
          dotnet {runtime?.dotnetVersion ?? '-'}
        </span>
        <span>
          {runtime?.lubanVersion ? `Luban ${runtime.lubanVersion}` : 'Luban -'}
          {runtime && !runtime.available ? '（不可用）' : ''}
        </span>
      </div>
    </div>
  )
}
