import { isDecisionAllowed } from '../submissions/decision-policy';

export type InspectorIdentity = { id: string; email: string };
export type ProfessionalIdentity = { name: string | null; surname: string | null };

export async function getProfessionalIdentity(): Promise<ProfessionalIdentity> {
  const response = await fetch('/api/v1/me/professional-identity', { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: ProfessionalIdentity };
  return body.data;
}

export async function putProfessionalIdentity(input: { name: string; surname: string }): Promise<ProfessionalIdentity> {
  const token = csrfCookie();
  if (!token) throw new Error('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch('/api/v1/me/professional-identity', {
    method: 'PUT', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  const body = await response.json() as { data: ProfessionalIdentity };
  return body.data;
}
export type DistrictOption = { id: string; name: string };
export type Institution = {
  id: string;
  districtId: string;
  name: string;
  externalCode: string | null;
  municipality: string | null;
  address: string | null;
  directorPhone: string | null;
  location?: CanonicalInstitutionLocation | null;
  email: string | null;
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
export type DeclaredAdministrative = {
  birthProvince: string | null;
  professionalFramework: string | null;
  firstEducationAppointmentDate: string | null;
  firstEducationAppointmentDecisionNumber: string | null;
  firstInstallationDate: string | null;
  traineeshipDate: string | null;
  institutionAppointmentDate: string | null;
  institutionAppointmentNumber: string | null;
  administrativeCategory: string | null;
  administrativeSection: string | null;
  administrativeGrade: string | null;
  administrativeClassificationEffectiveDate: string | null;
  personalAddress: string | null;
};
export type DeclaredWorkplace = {
  institutionName: string;
  municipality: string | null;
  institutionAddress: string | null;
  directorPhone: string | null;
  institutionEmail?: string | null;
  legacyAdditionalInstitutionNames: string[];
};
export type QualificationDeclaration = { name: string; issuingBody: string | null; qualificationDate: string | null };
export type SupplementaryWorkplaceDeclaration = { institutionName: string; municipality: string | null; institutionAddress: string | null; directorPhone: string | null };
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
export type CanonicalInstitutionLocation = {
  latitude: string;
  longitude: string;
  source: 'MANUAL_INSPECTOR' | 'TEACHER_PROPOSED_APPROVED';
};
export type SubmissionLocationProposal = {
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  latitude: string;
  longitude: string;
  decidedAt: string | null;
  decidedByInspectorId: string | null;
  decisionReason: string | null;
  institution: {
    id: string;
    name: string;
    municipality: string | null;
    location: CanonicalInstitutionLocation | null;
  } | null;
};
export type SubmissionDetail = {
  id: string;
  districtId: string;
  status: SubmissionStatus;
  submittedAt: string;
  submittedProfile: SubmissionProfile;
  locationProposal: SubmissionLocationProposal | null;
  declaredAdministrative: DeclaredAdministrative;
  declaredWorkplace: DeclaredWorkplace | null;
  structuredQualifications: QualificationDeclaration[];
  supplementaryWorkplaces: SupplementaryWorkplaceDeclaration[];
  potentialDuplicates: PotentialDuplicate[];
  acceptedTeacherId: string | null;
};

export type TeacherProfile = {
  trainingStatus?: string | null; trainingVerifiedAt?: string | null;
  id: string; districtId: string; name: string; surname: string;
  birthDate: string | null; placeOfBirth: string | null; phone: string | null;
  email: string | null; professionalStatus: string | null; employedAt: string | null;
  confirmedAt: string | null; qualifications: string | null;
  professionalFramework: string | null;
  firstEducationAppointmentDate: string | null; firstEducationAppointmentDecisionNumber: string | null;
  firstInstallationDate: string | null; traineeshipDate: string | null;
  institutionAppointmentDate: string | null; institutionAppointmentNumber: string | null;
  financialControllerVisaNumber: string | null; administrativeCategory: string | null;
  administrativeSection: string | null; administrativeGrade: string | null;
  administrativeClassificationEffectiveDate: string | null; birthProvince: string | null;
  personalAddress: string | null; administrativeNote: string | null;
  recordStatus: string; archivedAt: string | null; createdAt: string; updatedAt: string;
  declaredInstitutions: { primaryInstitutionName: string; additionalInstitutionNames: string[] } | null;
  declaredWorkplace: DeclaredWorkplace | null;
  currentInstitution: Pick<Institution, 'id' | 'name' | 'municipality' | 'address' | 'directorPhone'> | null;
};
export type TeacherProfilePatch = Partial<Pick<TeacherProfile,
  'name' | 'surname' | 'birthDate' | 'placeOfBirth' | 'phone' | 'email'
  | 'professionalStatus' | 'employedAt' | 'confirmedAt' | 'qualifications'
  | 'professionalFramework' | 'firstEducationAppointmentDate' | 'firstEducationAppointmentDecisionNumber'
  | 'firstInstallationDate' | 'traineeshipDate' | 'institutionAppointmentDate' | 'institutionAppointmentNumber'
  | 'financialControllerVisaNumber' | 'administrativeCategory' | 'administrativeSection' | 'administrativeGrade'
  | 'administrativeClassificationEffectiveDate' | 'birthProvince' | 'personalAddress' | 'administrativeNote'>>;

export type TeacherInformationCard = {
  asOfDate: string;
  academicYear: string;
  teacher: Omit<TeacherProfile, 'districtId' | 'createdAt' | 'updatedAt' | 'declaredInstitutions' | 'declaredWorkplace' | 'currentInstitution' | 'qualifications'>;
  homeInstitution: null | {
    id: string; name: string; municipality: string | null; email: string | null; archivedAt: string | null;
    appointment: { institutionAppointmentDate: string | null; institutionAppointmentNumber: string | null; financialControllerVisaNumber: string | null };
  };
  currentSupplementaryWorkplaces: Array<{
    id: string; institution: { id: string; name: string; municipality: string | null; archivedAt: string | null };
    validFrom: string; validTo: string | null;
  }>;
  qualifications: { items: Array<{ id: string; name: string; issuingBody: string | null; qualificationDate: string | null }>; legacyText: string | null };
  weeklySchedule: null | {
    academicYear: string; revision: number;
    currentSlots: Array<{
      id: string; dayOfWeek: number; startMinute: number; endMinute: number;
      institution: { id: string; name: string; municipality: string | null; archivedAt: string | null };
      validFrom: string; validTo: string | null; workplaceBasis: 'HOME' | 'SUPPLEMENTARY';
      consistency: { status: 'CONSISTENT' | 'NEEDS_CORRECTION'; reasonCode: string | null };
    }>;
    legacyUnknownSlots: Array<{
      id: string; dayOfWeek: number; startMinute: number; endMinute: number; institution: null;
      validFrom: null; validTo: null; workplaceBasis: null;
      consistency: { status: 'LEGACY_UNKNOWN'; reasonCode: 'LEGACY_LOCATION_UNKNOWN' };
    }>;
  };
  inspectionSummary: { lastInspectionDate: string | null; pedagogicalMark: string | null };
  organizationalContext: { district: { name: string }; inspector: { name: string | null; surname: string | null } | null };
};

export type TeacherQualification = {
  id: string;
  name: string;
  issuingBody: string | null;
  qualificationDate: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TeacherQualificationInput = {
  name: string;
  issuingBody?: string | null;
  qualificationDate?: string | null;
};

export type SupplementaryWorkplace = {
  id: string;
  institution: { id: string; name: string; municipality: string | null; archivedAt: string | null };
  validFrom: string;
  validTo: string | null;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SupplementaryWorkplaceInput = { institutionId: string; validFrom: string; validTo?: string | null };
export type SupplementaryWorkplacePatch = { validFrom?: string; validTo?: string | null };

export type TeacherDirectoryItem = {
  hasPhoto?: boolean;
  hasSupplementaryWorkplaces?: boolean;
  trainingStatus?: string | null;
  trainingVerifiedAt?: string | null;
  id: string;
  districtId: string;
  name: string;
  surname: string;
  professionalStatus: 'PERMANENT' | 'TRAINEE' | 'CONTRACT' | 'TEMPORARY_CONTRACT' | 'SUBSTITUTE' | null;
  recordStatus: 'ACTIVE' | 'INACTIVE';
  currentInstitution: { id: string; name: string; municipality: string | null } | null;
};
export type TeacherDirectoryFilters = {
  municipality?: string;
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
  for (const key of ['districtId', 'q', 'municipality', 'institutionId', 'professionalStatus', 'recordStatus', 'academicYear', 'cursor'] as const) {
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
  institutionId: string | null; institution: { id: string; name: string; municipality: string | null; archivedAt: string | null } | null;
  validFrom: string | null; validTo: string | null; workplaceBasis: 'HOME' | 'SUPPLEMENTARY' | null;
  consistency: { status: 'CONSISTENT' | 'NEEDS_CORRECTION' | 'LEGACY_UNKNOWN'; reasonCode: string | null };
};
export type WeeklySchedule = { id: string; teacherId: string; academicYear: string; revision: number; slots: WeeklyScheduleSlot[] };
export type WeeklyScheduleSlotInput = {
  institutionId: string; validFrom: string; validTo: string | null; dayOfWeek: number; startMinute: number; endMinute: number;
  levelLabel: string | null; groupLabel: string | null; notes: string | null;
};
export type ValidWorkplaceOption = { id: string; name: string; municipality: string | null; role: 'HOME' | 'SUPPLEMENTARY' };

export type PedagogicalVisitStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type PedagogicalVisitType = 'GUIDANCE' | 'TENURE_CONFIRMATION' | 'PROMOTION_EVALUATION' | 'MONITORING_FOLLOW_UP' | 'EXCEPTIONAL';
export type DashboardSummary = {
  asOf: string;
  today: string;
  attention: {
    pendingSubmissions: { total: number; items: Array<{ id: string; submittedAt: string }> };
    ownedFollowUps: {
      overdueTotal: number;
      dueTodayTotal: number;
      items: Array<{ id: string; dueDate: string; alertState: 'OVERDUE' | 'DUE_TODAY' }>;
    };
    reports: {
      draftTotal: number;
      completedVisitWithoutReportTotal: number;
      items: Array<{ visitId: string; reportId: string | null; kind: 'DRAFT_REPORT' | 'NO_REPORT'; referenceAt: string }>;
    };
  };
  upcomingVisits: Array<{
    id: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    visitType: PedagogicalVisitType | null;
    institutionName: string;
  }>;
};

export async function getDashboardSummary(): Promise<{ data: DashboardSummary }> {
  const response = await fetch('/api/v1/dashboard/summary', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: DashboardSummary }>;
}

export type PedagogicalVisit = {
  id: string;
  districtId: string;
  teacher: { id: string; name: string; surname: string };
  institution: { id: string; name: string };
  academicYear: string;
  visitType: PedagogicalVisitType | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  intervalKind: 'SCHEDULED' | 'ACTUAL_RETROSPECTIVE';
  visitTypeEditable: boolean;
  occurredAt: string | null;
  status: PedagogicalVisitStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type InspectionReportContent = {
  levelClass: string | null; lessonTopic: string | null; pedagogicalObservations: string | null;
  strengths: string | null; improvementAreas: string | null; guidanceRecommendations: string | null; inspectorConclusion: string | null;
};
export type InspectionReport = InspectionReportContent & {
  id: string; visitId: string; reportType: 'PEDAGOGICAL_ACCOMPANIMENT'; templateSource: 'INSPECTOR_AUTHORED';
  templateVersion: 1; status: 'DRAFT' | 'FINAL'; revision: number; finalizedAt: string | null; finalizedByInspectorId: string | null;
  finalizedInspectorNameSnapshot: string | null; finalizedInspectorSurnameSnapshot: string | null;
  finalizedTeacherNameSnapshot: string | null; finalizedTeacherSurnameSnapshot: string | null; createdAt: string; updatedAt: string;
  displayIdentity: { inspector: { name: string; surname: string } | null; teacher: { name: string; surname: string } };
  visit: { id: string; status: PedagogicalVisitStatus; academicYear: string; scheduledStartAt: string; scheduledEndAt: string;
    occurredAt: string | null; institution: { id: string; name: string }; teacher: { id: string } };
};
export type InspectorVisitV1Fields = {
  educationDirectorateText: string | null; administrativeDivisionText: string | null;
  teacherClassificationText: string | null; teacherGradeText: string | null; teacherNationalityText: string | null;
  teacherEffectiveDateText: string | null; teacherLastInspectionText: string | null; teacherAppointmentText: string | null;
  teacherProfessionalFrameworkText: string | null; actualLessonDurationText: string | null;
  studentCount: number | null; studentsPresentCount: number | null; studentsAbsentCount: number | null;
  lessonObjective: string | null; pedagogicalGuidanceText: string | null; practicalGuidanceText: string | null;
  visitStrengthsText: string | null; visitImprovementAreasText: string | null; tenureConclusionText: string | null;
  generalAssessmentText: string | null; markText: string | null; markWordsText: string | null; pedagogicalMark: string | null;
};
export type InspectorVisitCriterion = { criterionKey: string; sectionKey: string; sourceOrder: number; label: string; valueKind: 'OPTIONAL_SHORT_TEXT' };
export type InspectorVisitReport = Omit<InspectionReport, 'reportType' | 'templateSource' | 'pedagogicalObservations' | 'strengths' | 'improvementAreas' | 'guidanceRecommendations' | 'visit'> & {
  reportType: 'INSPECTOR_VISIT'; templateSource: 'PRODUCT_OWNER_ADOPTED';
  pedagogicalObservations: null; strengths: null; improvementAreas: null; guidanceRecommendations: null;
  visit: Omit<InspectionReport['visit'], 'scheduledStartAt' | 'scheduledEndAt'> & {
    scheduledStartAt: string | null; scheduledEndAt: string | null; actualStartAt: string | null; actualEndAt: string | null;
    visitType: PedagogicalVisitType; intervalKind: 'SCHEDULED' | 'ACTUAL_RETROSPECTIVE';
  };
  inspectorVisitV1: InspectorVisitV1Fields & { observations: Array<{ criterionKey: string; valueText: string }> };
  displayContext: { teacherBirthDate: string | null; teacherPlaceOfBirth: string | null; teacherQualifications: string | null;
    districtName: string | null; institutionMunicipality: string | null; visitType: PedagogicalVisitType };
};
export type InspectionReportReadModel = InspectionReport | InspectorVisitReport;
export type FollowUp = {
  id: string; reportId: string; ownerInspectorId: string; status: 'OPEN' | 'COMPLETED'; note: string; dueDate: string;
  completionNote: string | null; completedAt: string | null; revision: number; createdAt: string; updatedAt: string;
  alertState: 'OVERDUE' | 'DUE_TODAY' | 'NONE';
  context: { visitId: string; districtId: string; teacher: { id: string; name: string; surname: string }; institution: { id: string; name: string } };
};
export type FollowUpPage = { limit: number; nextCursor: string | null; total: number };
export type VisitFilters = {
  districtId?: string; teacherId?: string; institutionId?: string;
  status?: PedagogicalVisitStatus; visitType?: PedagogicalVisitType; from?: string; to?: string; limit?: number; cursor?: string;
};
export type VisitPage = { limit: number; nextCursor: string | null; total: number };
export type ScheduleWarningCode = 'VISIT_WEEKLY_SCHEDULE_MISSING' | 'VISIT_OUTSIDE_WEEKLY_SCHEDULE';

export async function listPedagogicalVisits(options: VisitFilters = {}) {
  const query = new URLSearchParams();
  for (const key of ['districtId', 'teacherId', 'institutionId', 'status', 'visitType', 'from', 'to', 'cursor'] as const) {
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

async function visitMutation<T>(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown): Promise<T> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(body) });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<T>;
}

export type ScheduledVisitInput = { teacherId: string; institutionId: string; academicYear: string; visitType: PedagogicalVisitType; scheduledStartAt: string; scheduledEndAt: string; scheduleWarningAcknowledgement?: ScheduleWarningCode };
export type RetrospectiveExceptionalVisitInput = { teacherId: string; institutionId: string; academicYear: string; visitType: 'EXCEPTIONAL'; actualStartAt: string; actualEndAt: string; institutionContextConfirmed: true };
export function createPedagogicalVisit(input: ScheduledVisitInput | RetrospectiveExceptionalVisitInput) {
  return visitMutation<{ data: { visit: PedagogicalVisit } }>('/api/v1/visits', 'POST', input);
}

export type PedagogicalVisitPatch =
  | { operation: 'RESCHEDULE'; expectedRevision: number; academicYear: string; scheduledStartAt: string; scheduledEndAt: string; institutionId?: string; scheduleWarningAcknowledgement?: ScheduleWarningCode }
  | { operation: 'COMPLETE'; expectedRevision: number; occurredAt: string }
  | { operation: 'CANCEL'; expectedRevision: number }
  | { operation: 'SET_VISIT_TYPE'; expectedRevision: number; visitType: PedagogicalVisitType };

export function patchPedagogicalVisit(id: string, input: PedagogicalVisitPatch) {
  return visitMutation<{ data: { visit: PedagogicalVisit } }>(`/api/v1/visits/${encodeURIComponent(id)}`, 'PATCH', input);
}

export async function getInspectionReport(visitId: string): Promise<{ data: { report: InspectionReport | null } }> {
  const response = await fetch(`/api/v1/visits/${encodeURIComponent(visitId)}/report`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { report: InspectionReport | null } }>;
}

export async function getInspectionReportReadModel(visitId: string): Promise<{ data: { report: InspectionReportReadModel | null } }> {
  const response = await fetch(`/api/v1/visits/${encodeURIComponent(visitId)}/report`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { report: InspectionReportReadModel | null } }>;
}

export async function getInspectorVisitCriteria(): Promise<{ data: { reportType: 'INSPECTOR_VISIT'; templateSource: 'PRODUCT_OWNER_ADOPTED'; templateVersion: 1; criteria: InspectorVisitCriterion[] } }> {
  const response = await fetch('/api/v1/report-templates/inspector-visit/v1', { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { reportType: 'INSPECTOR_VISIT'; templateSource: 'PRODUCT_OWNER_ADOPTED'; templateVersion: 1; criteria: InspectorVisitCriterion[] } }>;
}

export function saveInspectionReport(visitId: string, input: InspectionReportContent & { expectedRevision: number | null }) {
  return visitMutation<{ data: { report: InspectionReport } }>(`/api/v1/visits/${encodeURIComponent(visitId)}/report`, 'PUT', input);
}

export type InspectorVisitReportInput = {
  expectedRevision: number | null; levelClass: string | null; lessonTopic: string | null; inspectorConclusion: string | null;
  inspectorVisitV1: InspectorVisitV1Fields;
  observations: Array<{ criterionKey: string; valueText: string }>;
};
export function saveInspectorVisitReport(visitId: string, input: InspectorVisitReportInput) {
  return visitMutation<{ data: { report: InspectorVisitReport } }>(`/api/v1/visits/${encodeURIComponent(visitId)}/inspector-visit-report`, 'PUT', input);
}

export function finalizeInspectionReport(reportId: string, expectedRevision: number) {
  return visitMutation<{ data: { report: InspectionReport } }>(`/api/v1/reports/${encodeURIComponent(reportId)}/finalize`, 'POST', { expectedRevision });
}
export function finalizeInspectorVisitReport(reportId: string, expectedRevision: number) {
  return visitMutation<{ data: { report: InspectorVisitReport } }>(`/api/v1/reports/${encodeURIComponent(reportId)}/finalize`, 'POST', { expectedRevision });
}

export async function listReportFollowUps(reportId: string, options: { limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams({ limit: String(options.limit ?? 25) });
  if (options.cursor) query.set('cursor', options.cursor);
  const response = await fetch(`/api/v1/reports/${encodeURIComponent(reportId)}/follow-ups?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: FollowUp[]; page: FollowUpPage }>;
}
export async function listFollowUps(options: { districtId?: string; status?: 'OPEN' | 'COMPLETED'; alert?: 'OVERDUE' | 'DUE_TODAY'; limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams({ status: options.status ?? 'OPEN', limit: String(options.limit ?? 25) });
  if (options.districtId) query.set('districtId', options.districtId);
  if (options.alert) query.set('alert', options.alert);
  if (options.cursor) query.set('cursor', options.cursor);
  const response = await fetch(`/api/v1/follow-ups?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: FollowUp[]; page: FollowUpPage }>;
}
export function createFollowUp(reportId: string, input: { note: string; dueDate: string }) {
  return visitMutation<{ data: { followUp: FollowUp } }>(`/api/v1/reports/${encodeURIComponent(reportId)}/follow-ups`, 'POST', input);
}
export type FollowUpPatch =
  | { operation: 'EDIT'; expectedRevision: number; note: string; dueDate: string }
  | { operation: 'COMPLETE'; expectedRevision: number; completionNote?: string | null };
export function patchFollowUp(id: string, input: FollowUpPatch) {
  return visitMutation<{ data: { followUp: FollowUp } }>(`/api/v1/follow-ups/${encodeURIComponent(id)}`, 'PATCH', input);
}

export async function getWeeklySchedule(teacherId: string, academicYear: string): Promise<{ data: { schedule: WeeklySchedule | null } }> {
  const query = new URLSearchParams({ academicYear });
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/schedules?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { schedule: WeeklySchedule | null } }>;
}

export async function getValidWorkplaces(teacherId: string, query: { date: string } | { validFrom: string; validTo?: string }): Promise<{ data: { items: ValidWorkplaceOption[] } }> {
  const params = new URLSearchParams(query);
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/valid-workplaces?${params}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { items: ValidWorkplaceOption[] } }>;
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

export async function listInstitutions(options: { q?: string; cursor?: string; limit?: number; districtId?: string; municipality?: string } = {}) {
  const query = new URLSearchParams();
  if (options.municipality) query.set('municipality', options.municipality);
  if (options.q) query.set('q', options.q);
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.districtId) query.set('districtId', options.districtId);
  query.set('limit', String(options.limit ?? 25));
  const response = await fetch(`/api/v1/institutions?${query}`, { credentials: 'same-origin' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: Institution[]; page: InstitutionPage }>;
}

export async function createInstitution(input: { districtId: string; name: string; externalCode?: string; email?: string }) {
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

export async function updateInstitution(id: string, input: { email: string | null }): Promise<{ data: Institution }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/institutions/${encodeURIComponent(id)}`, {
    method: 'PATCH', credentials: 'same-origin',
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

export async function getTeacherInformationCard(id: string, academicYear: string): Promise<{ data: { card: TeacherInformationCard } }> {
  const query = new URLSearchParams({ academicYear });
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(id)}/information-card?${query}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { card: TeacherInformationCard } }>;
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

export async function listTeacherQualifications(teacherId: string): Promise<{ items: TeacherQualification[] }> {
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/qualifications`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ items: TeacherQualification[] }>;
}

export async function createTeacherQualification(teacherId: string, input: TeacherQualificationInput): Promise<{ data: TeacherQualification }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/qualifications`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherQualification }>;
}

export async function patchTeacherQualification(teacherId: string, qualificationId: string, patch: Partial<TeacherQualificationInput>): Promise<{ data: TeacherQualification }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/qualifications/${encodeURIComponent(qualificationId)}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(patch),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: TeacherQualification }>;
}

export async function deleteTeacherQualification(teacherId: string, qualificationId: string): Promise<void> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/qualifications/${encodeURIComponent(qualificationId)}`, {
    method: 'DELETE', credentials: 'same-origin', headers: { 'x-csrf-token': csrfToken },
  });
  if (!response.ok) return readFailure(response);
}

export async function listSupplementaryWorkplaces(teacherId: string): Promise<{ items: SupplementaryWorkplace[] }> {
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/supplementary-workplaces`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ items: SupplementaryWorkplace[] }>;
}

export async function createSupplementaryWorkplace(teacherId: string, input: SupplementaryWorkplaceInput): Promise<{ data: SupplementaryWorkplace }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/supplementary-workplaces`, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(input),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: SupplementaryWorkplace }>;
}

export async function patchSupplementaryWorkplace(teacherId: string, workplaceId: string, patch: SupplementaryWorkplacePatch): Promise<{ data: SupplementaryWorkplace }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/teachers/${encodeURIComponent(teacherId)}/supplementary-workplaces/${encodeURIComponent(workplaceId)}`, {
    method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify(patch),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: SupplementaryWorkplace }>;
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

export type InstitutionLocationProposalDecisionInput =
  | { action: 'ACCEPT_PROPOSED'; expectedCanonicalLocation: CanonicalInstitutionLocation | null }
  | { action: 'REJECT' }
  | { action: 'KEEP_CURRENT'; expectedCanonicalLocation: CanonicalInstitutionLocation };

export async function decideInstitutionLocationProposal(input: {
  id: string;
  decision: InstitutionLocationProposalDecisionInput;
}): Promise<{ data: { status: 'ACCEPTED' | 'REJECTED'; institutionId?: string } }> {
  const csrfToken = csrfCookie();
  if (!csrfToken) throw new ApiRequestError('تعذر التحقق من الطلب. أعد تحميل الصفحة ثم حاول مجددًا.');
  const response = await fetch(`/api/v1/submissions/${encodeURIComponent(input.id)}/location-proposal-decision`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(input.decision),
  });
  if (!response.ok) return readFailure(response);
  return response.json() as Promise<{ data: { status: 'ACCEPTED' | 'REJECTED'; institutionId?: string } }>;
}
