import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui';
import { useWindowStore } from '../../stores/windowStore';

/**
 * Single mount point for popup windows. Reads whatever content the windowStore
 * holds and shows it in a modal dialog. Mounted once in AppShell.
 */
export function WindowHost() {
    const { open, title, content, closeWindow } = useWindowStore();
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) closeWindow(); }}>
            <DialogContent>
                <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
                {content}
            </DialogContent>
        </Dialog>
    );
}
