import type { WeeklyScheduleSlot } from '@prisma/client';

type ConsistencySlot = Pick<WeeklyScheduleSlot, 'id' | 'institutionId' | 'validFrom' | 'validTo' | 'workplaceBasis'> & {
  institution?: { archivedAt: Date | null } | null;
};

type Workplace = { institutionId: string; validFrom: Date; validTo: Date | null };

export function applyScheduleConsistency<T extends ConsistencySlot>(
  slots: T[],
  teacher: { institutionId: string | null; supplementaryWorkplaces: Workplace[] },
  today: string,
) {
  return slots.map((slot) => {
    if (!slot.validFrom || !slot.institutionId) {
      return { ...slot, consistency: { status: 'LEGACY_UNKNOWN' as const, reasonCode: 'LEGACY_LOCATION_UNKNOWN' } };
    }
    const from = slot.validFrom.toISOString().slice(0, 10);
    const to = slot.validTo?.toISOString().slice(0, 10) ?? null;
    if (slot.institution?.archivedAt && (to === null || to > today)) {
      return { ...slot, consistency: { status: 'NEEDS_CORRECTION' as const, reasonCode: 'INSTITUTION_ARCHIVED' } };
    }
    if (slot.workplaceBasis === 'SUPPLEMENTARY') {
      const contained = teacher.supplementaryWorkplaces.some((row) => row.institutionId === slot.institutionId
        && row.validFrom.toISOString().slice(0, 10) <= from
        && (row.validTo === null || (to !== null && to <= row.validTo.toISOString().slice(0, 10))));
      return { ...slot, consistency: contained
        ? { status: 'CONSISTENT' as const, reasonCode: null }
        : { status: 'NEEDS_CORRECTION' as const, reasonCode: 'SUPPLEMENTARY_VALIDITY_CHANGED' } };
    }
    const homeChanged = teacher.institutionId !== slot.institutionId && (to === null || to > today);
    return { ...slot, consistency: homeChanged
      ? { status: 'NEEDS_CORRECTION' as const, reasonCode: 'HOME_CHANGED' }
      : { status: 'CONSISTENT' as const, reasonCode: null } };
  });
}
