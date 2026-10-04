import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from './Button';

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-page${className ? ` ${className}` : ''}`}>{children}</div>;
}

export type BreadcrumbItem = { label: string; to?: string };

export function Breadcrumbs({ items, label = 'مسار التنقل' }: { items: BreadcrumbItem[]; label?: string }) {
  if (!items.length) return null;
  return <nav className="ui-breadcrumbs" aria-label={label}>
    <ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>
      {index > 0 ? <span className="ui-breadcrumbs__separator" aria-hidden="true">/</span> : null}
      {index === items.length - 1 ? <span aria-current="page">{item.label}</span>
        : item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
    </li>)}</ol>
  </nav>;
}

export function PageHeader({
  title, description, eyebrow, breadcrumbs, primaryAction, secondaryActions, backAction, className = '', variant = 'default',
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbItem[];
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  backAction?: ReactNode;
  className?: string;
  variant?: 'default' | 'compact';
}) {
  return <header className={`ui-page-header${className ? ` ${className}` : ''}`} data-presentation={variant}>
    {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
    <div className="ui-page-header__row">
      <div className="ui-page-header__copy">
        {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {backAction || primaryAction || secondaryActions ? <div className="ui-page-header__actions">
        {backAction ? <div className="ui-page-header__back">{backAction}</div> : null}
        {secondaryActions ? <div className="ui-page-header__secondary">{secondaryActions}</div> : null}
        {primaryAction ? <div className="ui-page-header__primary">{primaryAction}</div> : null}
      </div> : null}
    </div>
  </header>;
}

export function FilterBar({ title, description, actions, children, className = '', variant = 'default', summary, activeFilters, secondaryControls }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
  variant?: 'default' | 'workspace'; summary?: ReactNode; activeFilters?: ReactNode; secondaryControls?: ReactNode;
}) {
  return <section className={`ui-filter-bar${className ? ` ${className}` : ''}`} data-presentation={variant} aria-label={title ?? 'البحث والمرشحات'}>
    {title || description || actions ? <div className="ui-filter-bar__header">
      <div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="ui-filter-bar__actions">{actions}</div> : null}
    </div> : null}
    <div className="ui-filter-bar__controls">{children}</div>
    {secondaryControls}
    {summary || activeFilters ? <div className="ui-filter-bar__summary">{activeFilters}{summary}</div> : null}
  </section>;
}

export type WorkspaceDensity = 'compact' | 'operational' | 'document';

// No page gutter, main landmark, data fetching or business state ownership.
export function WorkspaceStack({ density, children }: { density: WorkspaceDensity; children: ReactNode }) {
  return <div className="ui-workspace-stack" data-density={density}>{children}</div>;
}

export function SecondaryControls({ label, activeIndicator, hasErrors = false, defaultExpanded = false, children }: {
  label: string; activeIndicator?: ReactNode; hasErrors?: boolean; defaultExpanded?: boolean; children: ReactNode;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = hasErrors || expanded;
  return <div className="ui-secondary-controls">
    <div className="ui-secondary-controls__trigger">
      <Button variant="secondary" aria-expanded={isExpanded} aria-controls={contentId}
        onClick={() => setExpanded(!isExpanded)} disabled={hasErrors}>{label}</Button>
      {activeIndicator}
    </div>
    <div id={contentId} hidden={!isExpanded} className="ui-secondary-controls__content">{children}</div>
  </div>;
}

export function FormSection({ title, description, actions, children, className = '' }: {
  title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  const titleId = useId();
  return <section className={`ui-form-section${className ? ` ${className}` : ''}`} aria-labelledby={titleId}>
    <div className="ui-form-section__header">
      <div><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="ui-form-section__actions">{actions}</div> : null}
    </div>
    <div className="ui-form-section__content">{children}</div>
  </section>;
}

export type DetailItem = { label: string; value: ReactNode; emptyText?: string };

export function DetailList({ items, className = '', emptyText = 'غير متوفر' }: {
  items: DetailItem[]; className?: string; emptyText?: string;
}) {
  return <dl className={`ui-detail-list${className ? ` ${className}` : ''}`}>
    {items.map((item, index) => {
      const empty = item.value === null || item.value === undefined || item.value === '';
      const value = empty ? (item.emptyText ?? emptyText) : item.value;
      return <div className="ui-detail-list__item" key={`${item.label}-${index}`}>
        <dt>{item.label}</dt><dd>{typeof value === 'string' ? <bdi dir="auto">{value}</bdi> : value}</dd>
      </div>;
    })}
  </dl>;
}

export function FormGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-form-grid${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function FormGridFull({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-form-grid__full${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function Pagination({
  label, currentPage, rangeStart, rangeEnd, total, hasPrevious, hasNext, onPrevious, onNext, disabled = false,
  previousLabel = 'السابق', nextLabel = 'التالي',
}: {
  label: string; currentPage?: number; rangeStart?: number; rangeEnd?: number; total?: number;
  hasPrevious: boolean; hasNext: boolean; onPrevious: () => void; onNext: () => void; disabled?: boolean;
  previousLabel?: string; nextLabel?: string;
}) {
  return <nav className="ui-pagination" aria-label={label}>
    <Button variant="secondary" disabled={disabled || !hasPrevious} onClick={onPrevious}>{previousLabel}</Button>
    <span aria-live="polite"><bdi dir="auto">{rangeStart !== undefined && rangeEnd !== undefined && total !== undefined
      ? `النتائج ${rangeStart}–${rangeEnd} من ${total}`
      : `الصفحة ${currentPage ?? 1}`}</bdi></span>
    <Button variant="secondary" disabled={disabled || !hasNext} onClick={onNext}>{nextLabel}</Button>
  </nav>;
}
