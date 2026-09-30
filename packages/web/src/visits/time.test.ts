import { describe, expect, it } from 'vitest';
import { formatAlgiers, localDateTimeToOffset, nextLocalDate, utcToLocalDateTime } from './time';

describe('Africa/Algiers visit time conversion', () => {
  it('converts wall time to an explicit Algiers offset regardless of machine timezone', () => {
    expect(localDateTimeToOffset('2026-10-15T09:30')).toBe('2026-10-15T09:30:00+01:00');
    expect(utcToLocalDateTime('2026-10-15T08:30:00.000Z')).toBe('2026-10-15T09:30');
  });

  it('rejects malformed and nonexistent local time and advances calendar dates', () => {
    expect(localDateTimeToOffset('not-a-date')).toBeNull();
    expect(nextLocalDate('2026-12-31')).toBe('2027-01-01');
  });

  it('formats both displayed endpoints in the operational timezone', () => {
    expect(formatAlgiers('2026-10-15T23:30:00.000Z')).not.toBe('—');
  });
});
