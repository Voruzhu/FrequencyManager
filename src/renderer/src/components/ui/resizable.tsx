import * as React from 'react';
import { GripVertical } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '@/lib/utils';

const ResizablePanelGroup = ({
    className,
    ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
    <ResizablePrimitive.PanelGroup
        className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
        {...props}
    />
);

const ResizablePanel = ResizablePrimitive.Panel;

const ResizableHandle = ({
    withHandle,
    className,
    ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & { withHandle?: boolean }) => (
    <ResizablePrimitive.PanelResizeHandle
        className={cn(
            'relative flex w-px items-center justify-center bg-border transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[resize-handle-state=drag]:bg-primary/60 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-2 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0',
            className
        )}
        {...props}
    >
        {withHandle && (
            <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border border-border bg-surface-2">
                <GripVertical className="h-2.5 w-2.5" />
            </div>
        )}
    </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
