import { Separator } from 'react-resizable-panels'
import { cn } from '@renderer/lib/utils'

export function ResizeHandle({
  orientation
}: {
  orientation: 'vertical' | 'horizontal'
}): React.JSX.Element {
  return (
    <Separator
      className={cn(
        'bg-line hover:bg-accent focus-visible:bg-accent',
        orientation === 'vertical' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'
      )}
    />
  )
}
