/** Public presentation labels only: never authorization, tenant routing or claims of government adoption. */
export function InstitutionalContext({ district, directorate }: { district?: string; directorate?: string }) {
  const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
  const label = (value?: string) => value === undefined ? undefined : Array.from(value.normalize('NFC')).filter((character) => character.codePointAt(0)! >= 32 && character.codePointAt(0) !== 127).join('').trim().slice(0, 150);
  const districtLabel = label(district ?? env.VITE_INSPECTION_DISTRICT_LABEL);
  const directorateLabel = label(directorate ?? env.VITE_EDUCATION_DIRECTORATE_LABEL);
  return <aside aria-label="السياق الإداري المرجعي"><p>الجمهورية الجزائرية الديمقراطية الشعبية · وزارة التربية الوطنية</p>{directorateLabel ? <p>مديرية التربية: <bdi>{directorateLabel}</bdi></p> : null}{districtLabel ? <p>المقاطعة التفتيشية: <bdi>{districtLabel}</bdi></p> : null}<small>هوية سياقية للعرض؛ لا تعني اعتمادًا حكوميًا رسميًا للمنصة.</small></aside>;
}
