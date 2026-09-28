import { useEffect, useId, useRef, type ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
};

export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby={titleId}
      className="ui-dialog"
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="ui-dialog__body">
        <h2 className="ui-dialog__title" id={titleId}>
          {title}
        </h2>
        <div>{children}</div>
        {actions ? <footer className="ui-dialog__actions">{actions}</footer> : null}
      </div>
    </dialog>
  );
}
