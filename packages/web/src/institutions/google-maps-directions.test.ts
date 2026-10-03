import { describe, expect, it } from 'vitest';
import { googleMapsDirectionsUrl } from './google-maps-directions';

function location(latitude: string, longitude: string, source: string = 'MANUAL_INSPECTOR') {
  return { latitude, longitude, source } as Parameters<typeof googleMapsDirectionsUrl>[0];
}

describe('canonical Google Maps directions URL', () => {
  it('preserves canonical decimal strings and emits only the official HTTPS destination URL', () => {
    const result = googleMapsDirectionsUrl(location('36.123456', '5.654321'))!;
    const url = new URL(result);
    expect(url.origin).toBe('https://www.google.com');
    expect(url.pathname).toBe('/maps/dir/');
    expect([...url.searchParams.entries()]).toEqual([['api', '1'], ['destination', '36.123456,5.654321']]);
    expect(result).not.toMatch(/origin|institution|teacher|submission|district|latitude|longitude/iu);
  });

  it.each(['MANUAL_INSPECTOR', 'TEACHER_PROPOSED_APPROVED'])('allows canonical source %s', (source) => {
    expect(new URL(googleMapsDirectionsUrl(location('36.123456', '5.654321', source))!).searchParams.get('destination'))
      .toBe('36.123456,5.654321');
  });

  it.each([
    ['-12.500001', '-45.250001', '-12.500001,-45.250001'],
    ['0', '0', '0,0'],
    ['90', '180', '90,180'],
    ['-90', '-180', '-90,-180'],
  ])('preserves valid pair %s, %s', (latitude, longitude, expected) => {
    expect(new URL(googleMapsDirectionsUrl(location(latitude, longitude))!).searchParams.get('destination')).toBe(expected);
  });

  it.each([
    null,
    undefined,
    {},
    { latitude: '36.1', source: 'MANUAL_INSPECTOR' },
    { longitude: '5.1', source: 'MANUAL_INSPECTOR' },
    { latitude: '91', longitude: '5', source: 'MANUAL_INSPECTOR' },
    { latitude: '36', longitude: '181', source: 'MANUAL_INSPECTOR' },
    { latitude: '-90.000001', longitude: '5', source: 'MANUAL_INSPECTOR' },
    { latitude: '36', longitude: '180.000001', source: 'MANUAL_INSPECTOR' },
    { latitude: '3.1234567', longitude: '5', source: 'MANUAL_INSPECTOR' },
    { latitude: '3e1', longitude: '5', source: 'MANUAL_INSPECTOR' },
    { latitude: '٣٦', longitude: '5', source: 'MANUAL_INSPECTOR' },
    { latitude: '36', longitude: '5', source: 'UNVERIFIED' },
  ])('fails closed for invalid/missing input %o', (value) => {
    expect(googleMapsDirectionsUrl(value as Parameters<typeof googleMapsDirectionsUrl>[0])).toBeNull();
  });
});
