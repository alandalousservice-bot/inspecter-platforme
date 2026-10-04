import type { PedagogicalVisitType } from '../auth/client';
import { ShellIcon } from '../ui/ShellIcon';
import { visitTypeLabel } from './visit-type-labels';

export function VisitTypeBadge({ type }: { type: PedagogicalVisitType | null }) {
  return <span className="visit-type-badge">
    <ShellIcon name="visits" />
    <span>{visitTypeLabel(type)}</span>
  </span>;
}
