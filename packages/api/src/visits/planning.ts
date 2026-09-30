import type { WeeklyScheduleSlot } from '@prisma/client';
import { ApiError } from '../http/api-error.js';

const timeZone = 'Africa/Algiers';
const localFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const weekdayNumber: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export type ScheduleWarning = 'VISIT_WEEKLY_SCHEDULE_MISSING' | 'VISIT_OUTSIDE_WEEKLY_SCHEDULE';

export function parseOffsetTimestamp(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/u.exec(value);
  if (!match) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.', { _form: ['قيمة غير صالحة.'] });
  }
  const [, year, month, day, hour, minute, second] = match;
  const dateCheck = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (dateCheck.getUTCFullYear() !== Number(year) || dateCheck.getUTCMonth() + 1 !== Number(month)
    || dateCheck.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'تحقق من البيانات المدخلة.');
  return parsed;
}

function localParts(instant: Date) {
  const parts = Object.fromEntries(localFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  const weekday = weekdayNumber[parts.weekday ?? ''];
  if (!weekday || !parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute || !parts.second) {
    throw new Error('Unable to resolve Africa/Algiers local time.');
  }
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday,
    minute: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60 + instant.getUTCMilliseconds() / 60_000 };
}

function nextLocalDayBoundary(from: number, localDate: string): number {
  let low = from;
  let high = from + 36 * 60 * 60 * 1000;
  const dateAt = (time: number) => {
    const parts = localParts(new Date(time));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  if (dateAt(high) === localDate) throw new Error('Could not find next local day boundary.');
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (dateAt(mid) === localDate) low = mid;
    else high = mid;
  }
  return high;
}

export function scheduleWarning(
  start: Date,
  end: Date,
  scheduleExists: boolean,
  slots: Pick<WeeklyScheduleSlot, 'dayOfWeek' | 'startMinute' | 'endMinute'>[],
): ScheduleWarning | undefined {
  if (!scheduleExists) return 'VISIT_WEEKLY_SCHEDULE_MISSING';
  let cursor = start.getTime();
  const finish = end.getTime();
  while (cursor < finish) {
    const local = localParts(new Date(cursor));
    const localDate = `${local.year}-${local.month}-${local.day}`;
    const boundary = Math.min(finish, nextLocalDayBoundary(cursor, localDate));
    const endLocal = localParts(new Date(boundary));
    const endMinute = endLocal.year === local.year && endLocal.month === local.month && endLocal.day === local.day ? endLocal.minute : 1440;
    const covering = slots.filter((slot) => slot.dayOfWeek === local.weekday)
      .sort((left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute);
    let coveredUntil = local.minute;
    for (const slot of covering) {
      if (slot.endMinute <= coveredUntil) continue;
      if (slot.startMinute > coveredUntil) break;
      coveredUntil = Math.max(coveredUntil, slot.endMinute);
      if (coveredUntil >= endMinute) break;
    }
    if (coveredUntil < endMinute) return 'VISIT_OUTSIDE_WEEKLY_SCHEDULE';
    cursor = boundary;
  }
  return undefined;
}

export function yearSchemaValid(value: string): boolean {
  return /^\d{4}-\d{4}$/u.test(value) && Number(value.slice(5)) === Number(value.slice(0, 4)) + 1;
}
