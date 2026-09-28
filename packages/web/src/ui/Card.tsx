import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <section {...props} className={`ui-card ${className}`.trim()}>
      {children}
    </section>
  );
}

type CardHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <header className="ui-card__header">
      <div>
        <h2 className="ui-card__title">{title}</h2>
        {description ? <p className="ui-card__description">{description}</p> : null}
      </div>
      {action ? <div className="ui-card__action">{action}</div> : null}
    </header>
  );
}

export function CardContent({
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ui-card__content ${className}`.trim()} />;
}
