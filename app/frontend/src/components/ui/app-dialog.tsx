import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './app-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

interface ModalDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  dirty?: boolean;
  confirmCloseMessage?: string;
  onClose(): void;
  children: ReactNode;
}

export const ModalDialog = ({
  open,
  title,
  description,
  dirty = false,
  confirmCloseMessage = 'Discard unsaved changes?',
  onClose,
  children,
}: ModalDialogProps) => {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeAndReturnFocus = () => {
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };
  const requestClose = () => {
    if (dirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    closeAndReturnFocus();
  };

  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return;
    }
    setConfirmDiscardOpen(false);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, [open]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          requestClose();
        }}
      >
        <DialogContent className="max-h-[86vh] overflow-auto rounded-2xl border-[var(--color-border)] bg-[var(--color-white)] p-0 text-[var(--color-ink)] shadow-[var(--shadow-floating)] sm:max-w-3xl" showCloseButton={false}>
          <DialogHeader className="sticky top-0 z-10 flex-row items-start justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-white)] p-5">
            <div>
              <DialogTitle className="text-xl font-extrabold tracking-[-0.02em] text-[var(--color-navy)]">{title}</DialogTitle>
              {description ? <DialogDescription className="mt-1 max-w-[58ch] text-[var(--muted-foreground)]">{description}</DialogDescription> : null}
            </div>
            <Button type="button" variant="quiet" onClick={requestClose} aria-label={`Close ${title}`}>
              Close
            </Button>
          </DialogHeader>
          <div className="min-w-0 min-w-0 p-5">{children}</div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard unsaved changes?"
        description={confirmCloseMessage}
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onOpenChange={setConfirmDiscardOpen}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          closeAndReturnFocus();
        }}
      />
    </>
  );
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  onOpenChange(open: boolean): void;
  onConfirm(): void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialogContent className="rounded-2xl border-[var(--color-border)] bg-[var(--color-white)] text-[var(--color-ink)] shadow-[var(--shadow-floating)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-extrabold text-[var(--color-navy)]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--muted-foreground)]">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="rounded-[var(--radius-md)] border border-[var(--color-orange-deep)] bg-[var(--color-danger-soft)] px-3.5 py-3 text-[var(--color-navy)]" role="alert">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void onConfirm();
            }}
            className={destructive ? 'bg-[var(--color-danger-soft)] text-[var(--color-orange-deep)] hover:bg-[color-mix(in_oklch,var(--color-danger-soft),var(--color-orange-deep)_12%)]' : 'bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[oklch(76%_0.1663_78.4)]'}
          >
            {busy ? 'Working…' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
