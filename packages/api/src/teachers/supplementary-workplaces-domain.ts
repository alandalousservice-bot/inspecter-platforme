export type SupplementaryPeriod = { validFrom: string; validTo: string | null };

export function algiersCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function periodState(period: SupplementaryPeriod, today: string): 'CURRENT' | 'FUTURE' | 'PAST' {
  if (period.validFrom > today) return 'FUTURE';
  if (period.validTo !== null && period.validTo <= today) return 'PAST';
  return 'CURRENT';
}

export function isValidSupplementaryPeriod(period: SupplementaryPeriod, date: string): boolean {
  return period.validFrom <= date && (period.validTo === null || date < period.validTo);
}

export function isValidWorkplaceAtDate(input: {
  currentHomeInstitutionId: string | null;
  supplementary: Array<{ institutionId: string } & SupplementaryPeriod>;
}, institutionId: string, date: string, today: string): boolean {
  if (date === today && input.currentHomeInstitutionId === institutionId) return true;
  return input.supplementary.some((item) => item.institutionId === institutionId && isValidSupplementaryPeriod(item, date));
}
