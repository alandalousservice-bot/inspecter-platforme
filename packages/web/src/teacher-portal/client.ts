export type TeacherOwnProfile = { id: string; name: string; surname: string; phone: string | null; email: string | null; birthDate?: string | null; placeOfBirth?: string | null; employedAt?: string | null; confirmedAt?: string | null; professionalFramework?: string | null; professionalStatus: string | null; trainingStatus: string | null; trainingVerifiedAt: string | null; district: { id: string; name: string }; institution: { id: string; name: string; municipality: string | null; address: string | null } | null; qualificationsStructured: Array<{ id: string; name: string; issuingBody?: string | null; qualificationDate?: string | null }> };
export type PortalRequest = { id: string; teacher?: { id: string; name: string; surname: string }; destinationName?: string | null; institutionContext?: { name: string; location: { latitude: string; longitude: string; source: string } | null }; kind: string; status: string; revision: number; decisionNote: string | null; payload: Record<string, unknown>; createdAt: string };
export type Place = { id: string; name: string; municipality?: string | null; role?: string };
export type ScheduleReview = { id: string; academicYear: string; origin: 'INSPECTOR_CORRECTION' | 'TEACHER_UPDATE'; status: string; revision: number; note: string | null; decisionNote: string | null; proposedSlots: import('../auth/client').WeeklyScheduleSlotInput[] | null };
export async function portalFetch<T>(path: string, input?: unknown, options: { inspector?: boolean; file?: File } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (input !== undefined || options.file) {
    const key = options.inspector ? 'inspector_csrf' : 'teacher_csrf';
    const csrf = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${key}=`))?.slice(key.length + 1);
    if (!csrf) throw new Error('تعذر التحقق من الطلب. حدّث الصفحة.');
    headers['x-csrf-token'] = csrf;
    headers['content-type'] = options.file ? options.file.type : 'application/json';
  }
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', method: input !== undefined || options.file ? 'POST' : 'GET', headers,
    ...(options.file ? { body: options.file } : input !== undefined ? { body: JSON.stringify(input) } : {}) });
  if (!response.ok) throw new Error(response.status === 401 ? 'يلزم تسجيل الدخول.' : response.status === 409 ? 'تعذر اعتماد العملية حاليًا؛ حدّث البيانات أو راجع متطلبات الطلب.' : 'تعذر إكمال العملية. تحقق من البيانات والاتصال ثم أعد المحاولة.');
  return response.json() as Promise<T>;
}
export const trainingLabels: Record<string, string> = { NOT_STARTED: 'لم يبدأ', IN_PROGRESS: 'قيد التكوين', INCOMPLETE: 'غير مكتمل', COMPLETED: 'مكتمل' };
export const professionalLabels: Record<string, string> = { PERMANENT: 'مرسم', TRAINEE: 'متربص', CONTRACT: 'متعاقد', TEMPORARY_CONTRACT: 'متعاقد مؤقت', SUBSTITUTE: 'مستخلف' };
export const requestLabels: Record<string, string> = { PROFILE: 'البيانات المهنية', CONTACT: 'بيانات الاتصال', TRAINING: 'التكوين البيداغوجي', TRANSFER: 'الانتقال', WORKPLACE: 'مكان العمل', LOCATION: 'موقع المؤسسة' };
export const stateLabels: Record<string, string> = { PENDING: 'بانتظار المراجعة', ACCEPTED: 'معتمد', REJECTED: 'مرفوض', APPROVED_PENDING_DESTINATION: 'موافقة المصدر — ينتظر قرار المقاطعة المستقبلة', REQUESTED: 'تصحيح مطلوب', SUBMITTED: 'مقترح ينتظر المراجعة' };
