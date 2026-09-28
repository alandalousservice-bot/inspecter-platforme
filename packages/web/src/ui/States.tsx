import { useId, type ReactNode } from 'react';

export function LoadingState({ label = 'جارٍ التحميل' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="ui-state ui-state--loading" role="status">
      <span aria-hidden="true" className="ui-state__indicator" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="ui-state ui-state--empty" aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-state__action">{action}</div> : null}
    </section>
  );
}

export function ErrorState({
  title = 'تعذر إكمال العملية',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="ui-state ui-state--error" role="alert">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ui-state__action">{action}</div> : null}
    </section>
  );
}

export function SuccessState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="ui-state ui-state--success" role="status">
      <h2>{title}</h2>
      {children ? <div>{children}</div> : null}
    </section>
  );
}
