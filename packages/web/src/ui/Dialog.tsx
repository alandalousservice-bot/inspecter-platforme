import { useCallback, useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react';

type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onCancel?: (event: SyntheticEvent<HTMLDialogElement>) => void;
  children: ReactNode;
  actions?: ReactNode;
};

export function Dialog({ open, title, description, onClose, onCancel, children, actions }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const initialFocus = dialog.querySelector<HTMLElement>(
        '[autofocus], input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]',
      ) ?? titleRef.current;
      initialFocus?.focus({ preventScroll: true });
    }
    if (!open && dialog.open) dialog.close();

    return undefined;
  }, [open]);

  useEffect(() => () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    const returnFocus = returnFocusRef.current;
    if (returnFocus?.isConnected) returnFocus.focus();
  }, []);

  const handleCancel = useCallback((event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    if (onCancel) onCancel(event);
    else onClose();
  }, [onCancel, onClose]);

  const handleClose = useCallback(() => {
    onClose();
    const returnFocus = returnFocusRef.current;
    if (returnFocus?.isConnected) returnFocus.focus();
  }, [onClose]);

  return (
    <dialog
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      className="ui-dialog"
      onCancel={handleCancel}
      onClose={handleClose}
      ref={dialogRef}
    >
      <div className="ui-dialog__body">
        <h2 className="ui-dialog__title" id={titleId} ref={titleRef} tabIndex={-1}>
          {title}
        </h2>
        {description ? <p className="ui-dialog__description" id={descriptionId}>{description}</p> : null}
        <div>{children}</div>
        {actions ? <footer className="ui-dialog__actions">{actions}</footer> : null}
      </div>
    </dialog>
  );
}
