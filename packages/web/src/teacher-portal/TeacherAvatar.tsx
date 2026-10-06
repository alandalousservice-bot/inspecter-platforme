import { useState } from 'react';
import './portal.css';
export function TeacherAvatar({ teacherId, name, own = false, revision = 0, available = true }: { teacherId?: string; name: string; own?: boolean; revision?: number; available?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = own ? '/api/v1/teacher/photo' : `/api/v1/teachers/${encodeURIComponent(teacherId ?? '')}/photo`;
  const current = `${src}?v=${revision}`;
  return <span className="teacher-avatar" aria-hidden="true">{!available || failed === current ? name.trim().slice(0, 1) || 'أ' : <img key={current} src={current} alt="" loading="lazy" onError={() => setFailed(current)} />}</span>;
}
