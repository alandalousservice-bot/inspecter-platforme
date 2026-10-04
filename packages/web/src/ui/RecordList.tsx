import type { ReactNode } from 'react';
import type { WorkspaceDensity } from './PageSystem';

export function RecordList({ label, density = 'operational', children }: {
  label: string; density?: WorkspaceDensity; children: ReactNode;
}) {
  return <ul className="ui-record-list" aria-label={label} data-density={density}>{children}</ul>;
}

// Identity owns its real link; the row itself is deliberately not interactive.
export function RecordRow({ identity, context, metadata, status, temporal, actions }: {
  identity: ReactNode; context?: ReactNode; metadata?: ReactNode;
  status?: ReactNode; temporal?: ReactNode; actions?: ReactNode;
}) {
  return <li className="ui-record-row">
    <div className="ui-record-row__body">
      <div className="ui-record-row__identity">{identity}</div>
      {context ? <div className="ui-record-row__context">{context}</div> : null}
      {metadata ? <div className="ui-record-row__metadata">{metadata}</div> : null}
    </div>
    {status || temporal ? <div className="ui-record-row__state">{status}{temporal}</div> : null}
    {actions ? <div className="ui-record-row__actions">{actions}</div> : null}
  </li>;
}
