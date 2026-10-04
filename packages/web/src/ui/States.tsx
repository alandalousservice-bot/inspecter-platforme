import { useId, type ReactNode } from 'react';

export function LoadingState({ label = 'جارٍ التحميل', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className="ui-state ui-state--loading" data-presentation={compact ? 'compact' : 'default'} role="status">
      <span aria-hidden="true" className="ui-state__indicator" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  kind = 'no-data',
  compact = false,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  kind?: 'no-data' | 'no-results';
  compact?: boolean;
}) {
  const titleId = useId();
  return (
    <section className={`ui-state ui-state--empty ui-state--empty--${kind}`} aria-labelledby={titleId} data-kind={kind} data-presentation={compact ? 'compact' : 'default'}>
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
  compact = false,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className="ui-state ui-state--error" data-presentation={compact ? 'compact' : 'default'} role="alert">
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
