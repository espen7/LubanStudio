export function StatusBar(): React.JSX.Element {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-line bg-panel px-2 text-[11px] text-muted">
      <div className="flex items-center gap-3">
        <span>未打开项目</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono">dotnet -</span>
        <span className="font-mono">Luban -</span>
      </div>
    </div>
  )
}
