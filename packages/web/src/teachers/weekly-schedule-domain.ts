export const weekdays = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

export function parseTime(value: string, allowEndOfDay = false): number | null {
  if (allowEndOfDay && value === '24:00') return 1440;
  const match = /^(\d{2}):([0-5]\d)$/u.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23) return null;
  return hour * 60 + minute;
}

export function formatTime(value: number): string {
  if (value === 1440) return '24:00';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function normalizeOptionalText(value: string): string | null {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return normalized || null;
}

export function hasOverlap(slots: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>, candidate: { dayOfWeek: number; startMinute: number; endMinute: number }, exceptId?: string) {
  return slots.some((slot) => slot.dayOfWeek === candidate.dayOfWeek && (!exceptId || (slot as { id?: string }).id !== exceptId)
    && candidate.startMinute < slot.endMinute && slot.startMinute < candidate.endMinute);
}
