import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  dirty?: boolean;
  confirmCloseMessage?: string;
  onClose(): void;
  children: ReactNode;
}

const closeDialogElement = (dialog: HTMLDialogElement) => {
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute('open');
};

export const ModalDialog = ({
  open,
  title,
  description,
  dirty = false,
  confirmCloseMessage = 'Discard unsaved changes?',
  onClose,
  children,
}: ModalDialogProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = () => {
    if (dirty && !window.confirm(confirmCloseMessage)) return;
    onClose();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      window.setTimeout(() => {
        const focusTarget = dialog.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button, a[href]');
        focusTarget?.focus();
      }, 0);
      return;
    }

    closeDialogElement(dialog);
    returnFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  });

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (event.target === dialogRef.current) requestClose();
      }}
    >
      <div className="modal-panel">
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <Button type="button" variant="quiet" onClick={requestClose} aria-label={`Close ${title}`}>
            Close
          </Button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
};
