import { Group, Panel } from 'react-resizable-panels'
import { Toolbar } from '@renderer/components/layout/Toolbar'
import { StatusBar } from '@renderer/components/layout/StatusBar'
import { ResizeHandle } from '@renderer/components/layout/ResizeHandle'
import { ProjectPanel } from '@renderer/components/project/ProjectPanel'
import { EditorArea } from '@renderer/components/editor/EditorArea'
import { SchemaPanel } from '@renderer/components/schema/SchemaPanel'
import { DockPanel } from '@renderer/components/dock/DockPanel'

export function IdeLayout(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-fg">
      <Toolbar />
      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={240} minSize={180} className="min-w-0">
          <ProjectPanel />
        </Panel>
        <ResizeHandle orientation="vertical" />
        <Panel minSize={360} className="min-w-0">
          <Group orientation="vertical" className="h-full">
            <Panel minSize={200} className="min-h-0">
              <Group orientation="horizontal" className="h-full">
                <Panel minSize={360} className="min-w-0">
                  <EditorArea />
                </Panel>
                <ResizeHandle orientation="vertical" />
                <Panel defaultSize={300} minSize={200} className="min-w-0">
                  <SchemaPanel />
                </Panel>
              </Group>
            </Panel>
            <ResizeHandle orientation="horizontal" />
            <Panel defaultSize={220} minSize={140} className="min-h-0">
              <DockPanel />
            </Panel>
          </Group>
        </Panel>
      </Group>
      <StatusBar />
    </div>
  )
}
