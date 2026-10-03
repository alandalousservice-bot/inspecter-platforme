import type { CanonicalInstitutionLocation } from '../auth/client';

const DECIMAL_COORDINATE = /^-?(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u;

function isWithinLimit(value: string, limit: number): boolean {
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const wholeNumber = Number(whole);
  if (wholeNumber < limit) return true;
  if (wholeNumber > limit) return false;
  return /^0*$/u.test(fraction);
}

function isValidCoordinate(value: unknown, limit: number): value is string {
  return typeof value === 'string'
    && DECIMAL_COORDINATE.test(value)
    && isWithinLimit(value, limit);
}

export function googleMapsDirectionsUrl(location: CanonicalInstitutionLocation | null | undefined): string | null {
  if (!location || typeof location !== 'object'
    || !['MANUAL_INSPECTOR', 'TEACHER_PROPOSED_APPROVED'].includes(location.source)
    || !isValidCoordinate(location.latitude, 90)
    || !isValidCoordinate(location.longitude, 180)) return null;

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', `${location.latitude},${location.longitude}`);
  return url.toString();
}
