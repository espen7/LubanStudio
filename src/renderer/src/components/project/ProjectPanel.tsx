import { Search, FolderOpen, Clock } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/projectStore'

export function ProjectPanel(): React.JSX.Element {
  const project = useProjectStore((s) => s.project)
  const recent = useProjectStore((s) => s.recent)
  const openProject = useProjectStore((s) => s.openProject)

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

      {project ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          <Section title="数据目录" value={project.conf.dataDir} />
          <Section title="定义文件">
            <div className="flex flex-col gap-0.5">
              {project.conf.schemaFiles.map((f, i) => (
                <div key={i} className="truncate font-mono text-[11px] text-muted" title={f.fileName}>
                  {rel(project.conf.root, f.fileName)}
                  {f.type ? `（${f.type}）` : '（XML）'}
                </div>
              ))}
            </div>
          </Section>
          <Section title="目标">
            <div className="flex flex-wrap gap-1">
              {project.conf.targets.map((t) => (
                <span
                  key={t.name}
                  className="rounded-sm border border-line px-1.5 font-mono text-[11px] leading-5"
                >
                  {t.name}
                </span>
              ))}
            </div>
          </Section>
          <Section title="运行时">
            <div className="flex flex-col gap-0.5 font-mono text-[11px]">
              <span className={project.runtime.available ? 'text-fg' : 'text-warn'}>
                dotnet {project.runtime.dotnetVersion ?? '未检测'}
              </span>
              <span className={project.runtime.lubanDllPath ? 'text-fg' : 'text-warn'}>
                {project.runtime.lubanVersion
                  ? `Luban ${project.runtime.lubanVersion}`
                  : 'Luban 未检测'}
              </span>
              {project.runtime.problems.map((p, i) => (
                <span key={i} className="text-warn">
                  {p}
                </span>
              ))}
            </div>
          </Section>
          <div className="border-t border-line pt-2 text-[11px] text-muted">
            表树将在 Schema 解析完成后显示（M3）
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-muted">
          <FolderOpen size={28} strokeWidth={1.5} />
          <p className="text-center text-[12px] leading-5">
            未打开项目
            <br />
            通过工具栏「打开项目」选择 luban.conf
          </p>
          {recent.length > 0 && (
            <div className="mt-4 w-full">
              <div className="mb-1 flex items-center gap-1 text-[11px]">
                <Clock size={11} />
                最近项目
              </div>
              {recent.map((r) => (
                <button
                  key={r.confPath}
                  type="button"
                  onClick={(): void => void openProject(r.confPath)}
                  title={r.confPath}
                  className="block w-full truncate rounded-sm px-1 py-0.5 text-left font-mono text-[11px] text-muted hover:bg-app hover:text-fg"
                >
                  {r.confPath}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  value,
  children
}: {
  title: string
  value?: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-medium text-muted">{title}</div>
      {value && (
        <div className="truncate font-mono text-[11px] text-fg" title={value}>
          {value}
        </div>
      )}
      {children}
    </div>
  )
}

function rel(root: string, path: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1) : path
}
