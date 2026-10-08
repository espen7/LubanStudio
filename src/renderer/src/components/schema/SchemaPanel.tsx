import { Braces, Table2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useSchemaStore } from '@renderer/stores/schemaStore'
import type { FieldSchema, TableSchema, TypeRef } from '@shared/types/schema'

export function SchemaPanel(): React.JSX.Element {
  const model = useSchemaStore((s) => s.model)
  const tableId = useSchemaStore((s) => s.selectedTableId)
  const defId = useSchemaStore((s) => s.selectedDefId)

  const table = model?.tables.find((t) => t.id === tableId)
  const bean = model?.beans.find((b) => b.id === defId)
  const enm = model?.enums.find((e) => e.id === defId)

  let body: React.JSX.Element
  if (table) {
    body = <TableMetaView table={table} />
  } else if (bean) {
    body = <BeanView beanId={bean.id} />
  } else if (enm) {
    body = <EnumView enumId={enm.id} />
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 text-muted">
        <Braces size={28} strokeWidth={1.5} />
        <p className="text-center text-[12px] leading-5">选择表后展示字段结构</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line px-2 text-[12px] text-muted">
        Schema
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{body}</div>
    </div>
  )
}

function TableMetaView({ table }: { table: TableSchema }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-1.5">
          <Table2 size={14} className="shrink-0 text-muted" />
          <span className="truncate font-mono text-[13px] text-fg" title={table.id}>
            {table.id}
          </span>
        </div>
        {table.comment && <div className="mt-1 text-[11px] text-muted">{table.comment}</div>}
      </div>

      <MetaTable
        rows={[
          ['模式', table.mode],
          ['主键', table.index ?? '-'],
          ['值类型', table.valueType],
          ['分组', table.groups.length ? table.groups.join(', ') : '全部'],
          ['定义来源', table.readSchemaFromFile ? '数据文件表头' : '定义文件'],
          ...table.inputs.map(
            (i, n): [string, string] => [
              `数据文件 ${table.inputs.length > 1 ? n + 1 : ''}`.trim(),
              i.tableName ? `${i.tableName}@${i.file}` : i.file
            ]
          )
        ]}
      />

      <FieldList fields={table.fields} />
    </div>
  )
}

function BeanView({ beanId }: { beanId: string }): React.JSX.Element {
  const model = useSchemaStore((s) => s.model)!
  const bean = model.beans.find((b) => b.id === beanId)!
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="truncate font-mono text-[13px] text-fg" title={bean.id}>
          {bean.id}
        </div>
        {bean.comment && <div className="mt-1 text-[11px] text-muted">{bean.comment}</div>}
      </div>
      <MetaTable
        rows={[
          ['父类', bean.parent ?? '-'],
          ['抽象', bean.abstract ? '是' : '否'],
          ...(bean.sep ? [['sep', bean.sep] as [string, string]] : [])
        ]}
      />
      <FieldList fields={bean.fields} />
    </div>
  )
}

function EnumView({ enumId }: { enumId: string }): React.JSX.Element {
  const model = useSchemaStore((s) => s.model)!
  const enm = model.enums.find((e) => e.id === enumId)!
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="truncate font-mono text-[13px] text-fg" title={enm.id}>
          {enm.id}
        </div>
        {enm.comment && <div className="mt-1 text-[11px] text-muted">{enm.comment}</div>}
      </div>
      <MetaTable rows={[['flags', enm.flags ? '是' : '否'], ['项数', String(enm.items.length)]]} />
      <div className="border-t border-line pt-2">
        <div className="mb-1 text-[11px] font-medium text-muted">枚举项</div>
        <div className="flex flex-col">
          {enm.items.map((it) => (
            <div key={it.name} className="flex h-6 items-center gap-2 text-[12px]">
              <span className="w-32 shrink-0 truncate font-mono text-fg" title={it.name}>
                {it.name}
              </span>
              <span className="w-12 shrink-0 font-mono text-[11px] text-muted">{String(it.value)}</span>
              {it.alias && <span className="shrink-0 text-[11px] text-muted">{it.alias}</span>}
              {it.comment && (
                <span className="truncate text-[11px] text-muted" title={it.comment}>
                  {it.comment}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FieldList({ fields }: { fields: FieldSchema[] }): React.JSX.Element {
  return (
    <div className="border-t border-line pt-2">
      <div className="mb-1 text-[11px] font-medium text-muted">字段（{fields.length}）</div>
      <div className="flex flex-col">
        {fields.map((f) => (
          <div key={f.name} className="flex min-h-6 flex-col justify-center border-b border-line py-1 last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[12px] text-fg">{f.name}</span>
              <TypeText type={f.type} rawType={f.rawType} />
              {f.options.ref && (
                <span className="truncate font-mono text-[10px] text-accent" title={f.options.ref.table}>
                  → {f.options.ref.field ? `${f.options.ref.field}@` : ''}
                  {f.options.ref.table}
                  {f.options.ref.nullable ? '?' : ''}
                </span>
              )}
              {f.options.sep && (
                <span className="font-mono text-[10px] text-muted">sep={f.options.sep}</span>
              )}
            </div>
            {(f.comment || f.groups.length > 0) && (
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {f.comment && <span className="truncate">{f.comment}</span>}
                {f.groups.length > 0 && <span className="shrink-0 font-mono">[{f.groups.join(',')}]</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function TypeText({ type, rawType }: { type: TypeRef; rawType: string }): React.JSX.Element {
  const color =
    type.kind === 'enum'
      ? 'text-accent'
      : type.kind === 'bean'
        ? 'text-fg'
        : type.kind === 'unresolved'
          ? 'text-warn'
          : 'text-muted'
  return (
    <span className={cn('truncate font-mono text-[11px]', color)} title={rawType}>
      {rawType}
      {type.kind === 'unresolved' ? ' ?' : ''}
    </span>
  )
}

function MetaTable({ rows }: { rows: [string, string][] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2 text-[11px]">
          <span className="w-20 shrink-0 text-muted">{k}</span>
          <span className="min-w-0 truncate font-mono text-fg" title={v}>
            {v}
          </span>
        </div>
      ))}
    </div>
  )
}
