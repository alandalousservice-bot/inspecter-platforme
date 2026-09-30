import { describe, expect, it } from 'vitest';
import { formatTime, hasOverlap, normalizeOptionalText, parseTime, weekdays } from './weekly-schedule-domain';

describe('weekly schedule presentation rules', () => {
  it('uses Monday-first Arabic weekdays', () => { expect(weekdays).toEqual(['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']); });
  it('converts HH:mm and permits 24:00 only as an end boundary', () => {
    expect(parseTime('08:00')).toBe(480); expect(parseTime('09:30')).toBe(570); expect(parseTime('24:00')).toBeNull();
    expect(parseTime('24:00', true)).toBe(1440); expect(formatTime(1440)).toBe('24:00'); expect(formatTime(570)).toBe('09:30');
  });
  it('normalizes optional text and detects overlap but accepts adjacency', () => {
    expect(normalizeOptionalText('  أ   ب  ')).toBe('أ ب'); expect(normalizeOptionalText('  ')).toBeNull();
    const slots = [{ dayOfWeek: 1, startMinute: 480, endMinute: 540 }];
    expect(hasOverlap(slots, { dayOfWeek: 1, startMinute: 530, endMinute: 550 })).toBe(true);
    expect(hasOverlap(slots, { dayOfWeek: 1, startMinute: 540, endMinute: 600 })).toBe(false);
    expect(hasOverlap(slots, { dayOfWeek: 2, startMinute: 530, endMinute: 550 })).toBe(false);
  });
});
