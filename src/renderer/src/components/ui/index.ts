/**
 * shadcn/ui component barrel.
 *
 * Token conventions (see tailwind.config.js):
 *  - Surfaces:   bg-background < bg-card/bg-popover < bg-surface < bg-surface-2 / bg-secondary
 *  - Text:       text-foreground (primary), text-muted-foreground (secondary)
 *  - Accent:     bg-primary + text-primary-foreground; focus ring = ring-ring
 *  - Status:     destructive / success / warning (+ *-foreground)
 *  - Borders:    border-border, inputs border-input
 *  NEVER use `bg-muted` (the `muted` alias is muted TEXT, kept for legacy). For a
 *  muted surface use bg-surface/bg-surface-2/bg-secondary.
 *
 * Deliberately NOT added (would each need a new Radix dep): accordion (use
 * Collapsible), popover (use DropdownMenu/Dialog), checkbox (use Switch/native),
 * slider (native range), radio-group (use Select).
 */
export { Button, type ButtonProps, buttonVariants } from './button';
export { Input, type InputProps } from './input';
export { Label } from './label';
export { Switch } from './switch';
export { Separator } from './separator';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
export { Skeleton } from './skeleton';
export { Progress } from './progress';
export { Badge, type BadgeProps, badgeVariants } from './badge';
export { ScrollArea, ScrollBar } from './scroll-area';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';

// ── Added in the redesign ──
export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
} from './select';
export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuCheckboxItem,
    DropdownMenuRadioItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuGroup,
} from './dropdown-menu';
export {
    Dialog,
    DialogTrigger,
    DialogPortal,
    DialogClose,
    DialogOverlay,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
} from './dialog';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './table';
export { StatTile, type StatTileProps } from './stat-tile';
export { EmptyState, type EmptyStateProps } from './empty-state';
export { PageHeader, type PageHeaderProps } from './page-header';
export { Toaster, toast } from './sonner';
export { ItemIcon, type ItemIconProps, type ItemKind } from './item-icon';
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';
