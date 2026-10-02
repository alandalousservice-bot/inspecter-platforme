import type { HTMLAttributes, ReactNode } from 'react';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  children: ReactNode;
};

export function StatusBadge({ tone = 'neutral', className = '', children, ...props }: StatusBadgeProps) {
  return (
    <span {...props} className={`ui-status-badge ui-status-badge--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
