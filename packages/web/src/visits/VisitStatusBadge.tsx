import type { PedagogicalVisitStatus } from '../auth/client';
import { StatusBadge, type StatusTone } from '../ui';

const presentation: Record<PedagogicalVisitStatus, { label: string; tone: StatusTone }> = {
  PLANNED: { label: 'مخططة', tone: 'info' },
  COMPLETED: { label: 'مكتملة', tone: 'success' },
  CANCELLED: { label: 'ملغاة', tone: 'neutral' },
};

export function VisitStatusBadge({ status }: { status: PedagogicalVisitStatus }) {
  const item = presentation[status];
  return <StatusBadge tone={item.tone}>{item.label}</StatusBadge>;
}
