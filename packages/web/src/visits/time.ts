const ZONE = 'Africa/Algiers';

function partsAt(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function localDateTimeToOffset(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const probe = partsAt(new Date(wallClock));
  const represented = Date.UTC(Number(probe.year), Number(probe.month) - 1, Number(probe.day), Number(probe.hour), Number(probe.minute), Number(probe.second));
  const offsetMinutes = (represented - wallClock) / 60_000;
  const instant = wallClock - offsetMinutes * 60_000;
  const roundTrip = partsAt(new Date(instant));
  if (Number(roundTrip.year) !== year || Number(roundTrip.month) !== month || Number(roundTrip.day) !== day
    || Number(roundTrip.hour) !== hour || Number(roundTrip.minute) !== minute) return null;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  return `${value}:00${offset}`;
}

export function utcToLocalDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const part = partsAt(date);
  return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
}

export function formatAlgiers(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-DZ', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

export function nextLocalDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
