import { Fragment, useMemo, useState } from 'react'
import { Search, FolderOpen, Clock, ChevronRight, Table2, Box, Braces } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useProjectStore } from '@renderer/stores/projectStore'
import { useSchemaStore } from '@renderer/stores/schemaStore'
import { useEditorStore } from '@renderer/stores/editorStore'
import type { TableSchema } from '@shared/types/schema'

export function ProjectPanel(): React.JSX.Element {
  const project = useProjectStore((s) => s.project)
  const recent = useProjectStore((s) => s.recent)
  const openProject = useProjectStore((s) => s.openProject)
  const model = useSchemaStore((s) => s.model)
  const loading = useSchemaStore((s) => s.loading)
  const schemaError = useSchemaStore((s) => s.error)
  const filter = useSchemaStore((s) => s.filter)
  const setFilter = useSchemaStore((s) => s.setFilter)

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2">
        <Search size={13} className="shrink-0 text-muted" />
        <input
          type="text"
          placeholder="筛选表 / 结构 / 枚举"
          value={filter}
          disabled={!model}
          onChange={(e): void => setFilter(e.target.value)}
          className="h-6 w-full rounded-sm border border-line bg-app px-1.5 text-[12px] text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {project && model ? (
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <SchemaTree />
          {model.warnings.length > 0 && (
            <div className="border-t border-line px-2 py-1.5 text-[11px] text-warn">
              {model.warnings.slice(0, 3).map((w, i) => (
                <div key={i} className="truncate" title={w}>
                  {w}
                </div>
              ))}
              {model.warnings.length > 3 && <div>…共 {model.warnings.length} 条</div>}
            </div>
          )}
        </div>
      ) : project ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-4 text-muted">
          <Search size={24} strokeWidth={1.5} />
          <p className="text-[12px]">{schemaError || (loading ? 'Schema 加载中…' : 'Schema 未加载')}</p>
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

function SchemaTree(): React.JSX.Element {
  const model = useSchemaStore((s) => s.model)!
  const filter = useSchemaStore((s) => s.filter)

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const match = (...parts: (string | undefined)[]): boolean =>
      !f || parts.some((p) => p?.toLowerCase().includes(f))
    const byModule = <T extends { module: string }>(items: T[]): Map<string, T[]> => {
      const m = new Map<string, T[]>()
      for (const it of items) {
        const list = m.get(it.module) ?? []
        list.push(it)
        m.set(it.module, list)
      }
      return m
    }
    const tables = model.tables.filter((t) => match(t.name, t.id, t.comment))
    const beans = model.beans.filter((b) => match(b.name, b.id, b.comment))
    const enums = model.enums.filter((e) => match(e.name, e.id, e.comment))
    return {
      tables: byModule(tables),
      beans: byModule(beans),
      enums: byModule(enums)
    }
  }, [model, filter])

  return (
    <div className="text-[12px]">
      <TreeSection label="数据表" icon={<Table2 size={12} />} defaultOpen>
        {renderModuleGroups(groups.tables, (t, indent) => (
          <TableLeaf key={t.id} table={t} indent={indent} />
        ))}
      </TreeSection>
      <TreeSection label="结构" icon={<Box size={12} />} defaultOpen={false}>
        {renderModuleGroups(groups.beans, (b, indent) => (
          <DefLeaf key={b.id} id={b.id} name={b.name} kind="bean" indent={indent} />
        ))}
      </TreeSection>
      <TreeSection label="枚举" icon={<Braces size={12} />} defaultOpen={false}>
        {renderModuleGroups(groups.enums, (e, indent) => (
          <DefLeaf key={e.id} id={e.id} name={e.name} kind="enum" indent={indent} />
        ))}
      </TreeSection>
    </div>
  )
}

// module 为空时条目直接挂在分组下，避免多一层无意义的展开
function renderModuleGroups<T extends { id: string }>(
  groups: Map<string, T[]>,
  leaf: (item: T, indent: string) => React.JSX.Element
): React.JSX.Element[] {
  return [...groups.entries()].map(([module, items]) =>
    module ? (
      <ModuleNode key={module} module={module} count={items.length}>
        {items.map((it) => leaf(it, 'pl-9'))}
      </ModuleNode>
    ) : (
      <Fragment key="_root">{items.map((it) => leaf(it, 'pl-5'))}</Fragment>
    )
  )
}

function TreeSection({
  label,
  icon,
  defaultOpen,
  children
}: {
  label: string
  icon: React.ReactNode
  defaultOpen: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={(): void => setOpen(!open)}
        className="flex h-7 w-full items-center gap-1 px-2 text-left text-[11px] font-medium text-muted hover:text-fg"
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0', open && 'rotate-90')}
          strokeWidth={2}
        />
        {icon}
        {label}
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function ModuleNode({
  module,
  count,
  children
}: {
  module: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={(): void => setOpen(!open)}
        className="flex h-6 w-full items-center gap-1 pl-5 pr-2 text-left text-muted hover:text-fg"
      >
        <ChevronRight size={12} className={cn('shrink-0', open && 'rotate-90')} strokeWidth={2} />
        <span className="truncate font-mono text-[11px]">{module}</span>
        <span className="ml-auto font-mono text-[10px] text-muted">{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function TableLeaf({ table, indent }: { table: TableSchema; indent: string }): React.JSX.Element {
  const selectedTableId = useSchemaStore((s) => s.selectedTableId)
  const selectTable = useSchemaStore((s) => s.selectTable)
  const openEditor = useEditorStore((s) => s.open)
  const selected = selectedTableId === table.id
  return (
    <button
      type="button"
      onClick={(): void => {
        selectTable(table.id)
        void openEditor(table.id, table.name)
      }}
      title={table.comment ? `${table.id} — ${table.comment}` : table.id}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 pr-2 text-left',
        indent,
        selected ? 'bg-app text-accent' : 'text-fg hover:bg-app'
      )}
    >
      <Table2 size={12} className="shrink-0 text-muted" />
      <span className="truncate">{table.name}</span>
      {table.mode !== 'map' && (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">{table.mode}</span>
      )}
    </button>
  )
}

function DefLeaf({
  id,
  name,
  kind,
  indent
}: {
  id: string
  name: string
  kind: 'bean' | 'enum'
  indent: string
}): React.JSX.Element {
  const selectedDefId = useSchemaStore((s) => s.selectedDefId)
  const selectDef = useSchemaStore((s) => s.selectDef)
  const selected = selectedDefId === id
  return (
    <button
      type="button"
      onClick={(): void => selectDef(id)}
      title={id}
      className={cn(
        'flex h-6 w-full items-center gap-1.5 pr-2 text-left',
        indent,
        selected ? 'bg-app text-accent' : 'text-fg hover:bg-app'
      )}
    >
      {kind === 'bean' ? <Box size={12} className="shrink-0 text-muted" /> : <Braces size={12} className="shrink-0 text-muted" />}
      <span className="truncate font-mono text-[11px]">{name}</span>
    </button>
  )
}
