import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// A bottom sheet below lg, a centered panel from lg up — the "next"
// shell's one overlay shape (More, season, group scope, Find athlete,
// Timer picker). Built on the same Radix Dialog as components/ui/dialog,
// so focus trapping, Escape and outside-tap closing come for free.
export const Sheet = DialogPrimitive.Root;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border bg-background shadow-lg',
        'pb-[env(safe-area-inset-bottom)]',
        'lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:pb-0',
        className
      )}
      {...(description ? {} : { 'aria-describedby': undefined })}
      {...props}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-base font-semibold">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Close
          aria-label="Close"
          className="flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>
      {description ? (
        <DialogPrimitive.Description className="px-4 pt-2 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

/** A whole-row tap target, 48px tall — the row is the button. */
export const SheetRow: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }
> = ({ className, selected, children, ...props }) => (
  <button
    type="button"
    aria-pressed={selected}
    className={cn(
      'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-accent',
      selected && 'bg-primary/10 text-primary',
      className
    )}
    {...props}
  >
    {children}
  </button>
);
