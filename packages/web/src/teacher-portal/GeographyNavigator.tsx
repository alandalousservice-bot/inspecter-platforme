import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../ui';
import { portalFetch } from './client';
type District = { id: string; name: string; municipalities: Array<{ name: string; institutionCount: number }> };
export function GeographyNavigator() {
  const [districts, setDistricts] = useState<District[]>([]); const [failed, setFailed] = useState(false); const [retry, setRetry] = useState(0); const [params, setParams] = useSearchParams();
  const districtId = params.get('districtId') ?? ''; const municipality = params.get('municipality') ?? '';
  const municipalities = [...new Set(districts.filter((d) => !districtId || d.id === districtId).flatMap((d) => d.municipalities.map((m) => m.name)))].sort((a, b) => a.localeCompare(b, 'ar'));
  useEffect(() => { let active = true; setFailed(false); void portalFetch<{ data: { districts: District[] } }>('/me/geography').then((r) => { if (active) setDistricts(r.data.districts); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [retry]);
  function change(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key === 'districtId') next.delete('municipality'); next.delete('cursor'); setParams(next); }
  return <details><summary>المقاطعة والبلدية — تنقل جغرافي</summary><div className="portal-actions">
    {failed ? <p role="status">تعذر تحميل السياق الجغرافي. <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>إعادة تحميل السياق</Button></p> : <>
      <label htmlFor="geo-district">المقاطعة</label><select id="geo-district" className="ui-input" value={districtId} onChange={(e) => change('districtId', e.target.value)}><option value="">كل المقاطعات الحالية</option>{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
      <label htmlFor="geo-municipality">البلدية</label><select id="geo-municipality" className="ui-input" value={municipality} onChange={(e) => change('municipality', e.target.value)}><option value="">كل البلديات المسجلة</option>{municipalities.map((name) => <option key={name} value={name}>{name}</option>)}</select>
      <p>البلديات من المؤسسات المسجلة في نطاقك، وليست سجلًا إداريًا رسميًا.</p>
    </>}</div></details>;
}
