import { isDecisionAllowed } from '../submissions/decision-policy';

export type InspectorIdentity = { id: string; email: string };
export type DistrictOption = { id: string; name: string };
export type Institution = {
  id: string;
  districtId: string;
  name: string;
  externalCode: string | null;
  municipality: string | null;
  address: string | null;
  directorPhone: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type InstitutionPage = { limit: number; nextCursor: string | null; total: number };
export type SubmissionStatus = 'PENDING' | 'INTERNAL_REVIEW' | 'ACCEPTED' | 'REJECTED';
export type SubmissionDecisionAction = 'ACCEPT' | 'REJECT' | 'INTERNAL_REVIEW';
export type SubmissionDecisionStatus = Extract<SubmissionStatus, 'PENDING' | 'INTERNAL_REVIEW'>;
export type SubmissionDecisionResult = {
  id: string;
  status: Extract<SubmissionStatus, 'ACCEPTED' | 'REJECTED' | 'INTERNAL_REVIEW'>;
};
export type SubmissionListItem = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  submittedAt: string;
  primaryInstitutionName: string;
  status: SubmissionStatus;
  hasPotentialDuplicates: boolean;
};
export type SubmissionPage = { limit: number; nextCursor: string | null; total: number };
export type SubmissionProfile = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  phone: string;
  email: string;
  professionalStatus: string;
  employmentDate: string;
  confirmationDate?: string;
  qualifications?: string;
  notes?: string;
};
export type DeclaredWorkplace = {
  institutionName: string;
  municipality: string | null;
  institutionAddress: string | null;
  directorPhone: string | null;
  legacyAdditionalInstitutionNames: string[];
};
export type DuplicateReason = 'SAME_PHONE' | 'SAME_EMAIL' | 'SAME_NAME_AND_DOB';
export type PotentialDuplicate = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  status: SubmissionStatus;
  submittedAt: string;
  matchReasons: DuplicateReason[];
};
export type SubmissionDetail = {
  id: string;
  districtId: string;
  status: SubmissionStatus;
  submittedAt: string;
  submittedProfile: SubmissionProfile;
  declaredWorkplace: DeclaredWorkplace | null;
  potentialDuplicates: PotentialDuplicate[];
  acceptedTeacherId: string | null;
};

export type TeacherProfile = {
  id: string; districtId: string; name: string; surname: string;
  birthDate: string | null; placeOfBirth: string | null; phone: string | null;
  email: string | null; professionalStatus: string | null; employedAt: string | null;
  confirmedAt: string | null; qualifications: string | null;
  recordStatus: string; archivedAt: string | null; createdAt: string; updatedAt: string;
  declaredInstitutions: { primaryInstitutionName: string; additionalInstitutionNames: string[] } | null;
  declaredWorkplace: DeclaredWorkplace | null;
  currentInstitution: Pick<Institution, 'id' | 'name' | 'municipality' | 'address' | 'directorPhone'> | null;
};
export type TeacherProfilePatch = Partial<Pick<TeacherProfile,
  'name' | 'surname' | 'birthDate' | 'placeOfBirth' | 'phone' | 'email'
  | 'professionalStatus' | 'employedAt' | 'confirmedAt' | 'qualifications'>>;

export type TeacherDirectoryItem = {
  id: string;
  districtId: string;
  name: string;
  surname: string;
  professionalStatus: 'PERMANENT' | 'TRAINEE' | 'CONTRACT' | 'TEMPORARY_CONTRACT' | null;
  recordStatus: 'ACTIVE' | 'INACTIVE';
  currentInstitution: { id: string; name: string; municipality: string | null } | null;
};
export type TeacherDirectoryFilters = {
  districtId?: string;
  q?: string;
  institutionId?: string;
  hasCurrentInstitution?: boolean;
  professionalStatus?: NonNullable<TeacherDirectoryItem['professionalStatus']>;
  recordStatus?: TeacherDirectoryItem['recordStatus'];
  academicYear?: string;
  dayOfWeek?: number;
  minuteOfDay?: number;
  worksToday?: true;
  worksNow?: true;
  limit?: number;
  cursor?: string;
};
export type TeacherDirectoryPage = { limit: number; nextCursor: string | null; total: number };

export async function listTeachers(options: TeacherDirectoryFilters = {}) {
  const query = new URLSearchParams();
  for (const key of ['districtId', 'q', 'institutionId', 'professionalStatus', 'recordStatus', 'academicYear', 'cursor'] as const) {
    const value = options[key];
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  if (options.hasCurrentInstitution !== undefined) query.set('hasCurrentInstitution', String(options.hasCurrentInstitution));
  if (options.dayOfWeek !== undefined) query.set('dayOfWeek', String(options.dayOfWeek));
  if (options.minuteOfDay !== undefined) query.set('minuteOfDay', String(options.minuteOfDay));
  if (options.worksToday) query.set('worksToday', 'true');
  if (options.worksNow) query.set('worksNow', 'true');
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/teachers?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherDirectoryItem[]; page: TeacherDirectoryPage }>;
}

type ApiFailure = { error?: { code?: string; message?: string; fields?: Record<string, string[]> } };

export class ApiRequestError extends Error {
  constructor(message: string, readonly fields?: Record<string, string[]>, readonly status?: number, readonly code?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function csrfCookie(): string | undefined {
  const prefix = 'inspector_csrf=';
  const entry = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!entry) return undefined;
  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return undefined;
  }
}

async function ensureCsrfToken(): Promise<string> {
  const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
  if (!response.ok && response.status !== 401) throw new Error('تعذر الاتصال بخدمة الدخول.');
  const token = csrfCookie();
  if (!token) throw new Error('تعذر تهيئة حماية الطلب. أعد المحاولة.');
  return token;
}

async function readFailure(response: Response): Promise<never> {
  let body: ApiFailure | undefined;
  try {
    body = await response.json() as ApiFailure;
  } catch {
    // Keep transport/parser details out of the UI.
  }
  throw new ApiRequestError(body?.error?.message ?? 'تعذر إكمال الطلب.', body?.error?.fields, response.status, body?.error?.code);
}

export type WeeklyScheduleSlot = {
  id: string; dayOfWeek: number; startMinute: number; endMinute: number;
  levelLabel: string | null; groupLabel: string | null; notes: string | null;
};
export type WeeklySchedule = { id: string; teacherId: string; academicYear: string; revision: number; slots: WeeklyScheduleSlot[] };
export type WeeklyScheduleSlotInput = Omit<WeeklyScheduleSlot, 'id'>;

export type PedagogicalVisitStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type PedagogicalVisit = {
  id: string;
  districtId: string;
  teacher: { id: string; name: string; surname: string };
  institution: { id: string; name: string };
  academicYear: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  occurredAt: string | null;
  status: PedagogicalVisitStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type VisitFilters = {
  districtId?: string; teacherId?: string; institutionId?: string;
  status?: PedagogicalVisitStatus; from?: string; to?: string; limit?: number; cursor?: string;
};
export type VisitPage = { limit: number; nextCursor: string | null; total: number };
export type ScheduleWarningCode = 'VISIT_WEEKLY_SCHEDULE_MISSING' | 'VISIT_OUTSIDE_WEEKLY_SCHEDULE';

export async function listPedagogicalVisits(options: VisitFilters = {}) {
  const query = new URLSearchParams();
  for (const key of ['districtId', 'teacherId', 'institutionId', 'status', 'from', 'to', 'cursor'] as const) {
    const value = options[key];
    if (value) query.set(key, value);
  }
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/visits?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: PedagogicalVisit[]; page: VisitPage }>;
}

export async function getPedagogicalVisit(id: string) {
  const response = await fetch(`/api/v1/visits/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { visit: PedagogicalVisit } }>;
}

async function visitMutation<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<T>;
}

export function createPedagogicalVisit(input: {
  teacherId: string; academicYear: string; scheduledStartAt: string; scheduledEndAt: string;
  scheduleWarningAcknowledgement?: ScheduleWarningCode;
}) {
  return visitMutation<{ data: { visit: PedagogicalVisit } }>('/api/v1/visits', 'POST', input);
}

export type PedagogicalVisitPatch =
  | { operation: 'RESCHEDULE'; expectedRevision: number; academicYear: string; scheduledStartAt: string; scheduledEndAt: string; scheduleWarningAcknowledgement?: ScheduleWarningCode }
  | { operation: 'COMPLETE'; expectedRevision: number; occurredAt: string }
  | { operation: 'CANCEL'; expectedRevision: number };

export function patchPedagogicalVisit(id: string, input: PedagogicalVisitPatch) {
  return visitMutation<{ data: { visit: PedagogicalVisit } }>(`/api/v1/visits/${encodeURIComponent(id)}`, 'PATCH', input);
}

export async function getWeeklySchedule(teacherId: string, academicYear: string): Promise<{ data: { schedule: WeeklySchedule | null } }> {
  const query = new URLSearchParams({ academicYear });
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/schedules?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { schedule: WeeklySchedule | null } }>;
}

async function scheduleMutation<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Promise<T> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<T>;
}

export function createWeeklySchedule(teacherId: string, academicYear: string) {
  return scheduleMutation<{ data: { schedule: WeeklySchedule } }>(`/api/v1/teachers/${encodeURIComponent(teacherId)}/schedules`, 'POST', { academicYear, slots: [] });
}
export function addWeeklyScheduleSlot(scheduleId: string, expectedRevision: number, slot: WeeklyScheduleSlotInput) {
  return scheduleMutation<{ data: { schedule: WeeklySchedule } }>(`/api/v1/schedules/${encodeURIComponent(scheduleId)}/slots`, 'POST', { expectedRevision, slot });
}
export function patchWeeklyScheduleSlot(slotId: string, expectedRevision: number, changes: Partial<WeeklyScheduleSlotInput>) {
  return scheduleMutation<{ data: { schedule: WeeklySchedule } }>(`/api/v1/slots/${encodeURIComponent(slotId)}`, 'PATCH', { expectedRevision, changes });
}
export function deleteWeeklyScheduleSlot(slotId: string, expectedRevision: number) {
  return scheduleMutation<{ data: { schedule: WeeklySchedule } }>(`/api/v1/slots/${encodeURIComponent(slotId)}`, 'DELETE', { expectedRevision });
}

export async function login(email: string, password: string): Promise<InspectorIdentity> {
  const csrfToken = await ensureCsrfToken();
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: InspectorIdentity };
  return body.data;
}

export async function logout(): Promise<void> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new Error('تعذر التحقق من الطلب.');
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) return readFailure(response);
}

export async function getCurrentInspector(): Promise<InspectorIdentity | null> {
  const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: InspectorIdentity };
  return body.data;
}

export async function getCurrentDistricts(): Promise<DistrictOption[]> {
  const response = await fetch('/api/v1/me/districts', { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { items: DistrictOption[] };
  return body.items;
}

export async function listInstitutions(options: { q?: string; cursor?: string; limit?: number; districtId?: string } = {}) {
  const query = new URLSearchParams();
  if (options.q) query.set('q', options.q);
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.districtId) query.set('districtId', options.districtId);
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/institutions?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: Institution[]; page: InstitutionPage }>;
}

export async function createInstitution(input: { districtId: string; name: string; externalCode?: string }) {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new Error('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch('/api/v1/institutions', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: Institution }>;
}

export async function listSubmissions(options: {
  q?: string;
  status?: SubmissionStatus;
  districtId?: string;
  cursor?: string;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (options.q) query.set('q', options.q);
  if (options.status) query.set('status', options.status);
  if (options.districtId) query.set('districtId', options.districtId);
  if (options.cursor) query.set('cursor', options.cursor);
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/submissions?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: SubmissionListItem[]; page: SubmissionPage }>;
}

export async function getSubmission(id: string) {
  const response = await fetch(`/api/v1/submissions/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: SubmissionDetail }>;
}

export async function getTeacherProfile(id: string): Promise<{ data: TeacherProfile }> {
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherProfile }>;
}

export async function patchTeacherProfile(id: string, patch: TeacherProfilePatch): Promise<{ data: TeacherProfile }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(id)}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(patch),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherProfile }>;
}

export type TeacherCurrentInstitutionInput =
  | { expectedInstitutionId: string | null; institutionId: string }
  | {
    expectedInstitutionId: string | null;
    createInstitution: {
      name: string;
      municipality?: string | null;
      address?: string | null;
      directorPhone?: string | null;
    };
  };

export type TeacherCurrentInstitutionResult = {
  teacherId: string;
  currentInstitution: Pick<Institution, 'id' | 'name' | 'municipality' | 'address' | 'directorPhone'>;
};

export async function setTeacherCurrentInstitution(
  id: string,
  input: TeacherCurrentInstitutionInput,
): Promise<{ data: TeacherCurrentInstitutionResult }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(id)}/current-institution`, {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherCurrentInstitutionResult }>;
}

export async function decideSubmission(input: {
  id: string;
  action: SubmissionDecisionAction;
  expectedStatus: SubmissionDecisionStatus;
}): Promise<{ data: SubmissionDecisionResult }> {
  if (!isDecisionAllowed(input.expectedStatus, input.action)) {
    throw new ApiRequestError('لا يمكن تنفيذ هذا القرار للحالة الحالية.');
  }
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-csrf-token': csrfToken,
  };
  const response = await fetch(`/api/v1/submissions/${encodeURIComponent(input.id)}/decision`, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify({ action: input.action, expectedStatus: input.expectedStatus }),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: SubmissionDecisionResult }>;
}
