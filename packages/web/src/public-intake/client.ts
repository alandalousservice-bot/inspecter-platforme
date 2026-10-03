export type TeacherSubmissionPayload = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  phone: string;
  email: string;
  professionalStatus: 'PERMANENT' | 'TRAINEE' | 'CONTRACT' | 'TEMPORARY_CONTRACT' | 'SUBSTITUTE';
  employmentDate: string;
  confirmationDate?: string;
  qualifications?: string;
  notes?: string;
  birthProvince?: string;
  professionalFramework?: string;
  firstEducationAppointmentDate?: string;
  firstEducationAppointmentDecisionNumber?: string;
  firstInstallationDate?: string;
  traineeshipDate?: string;
  institutionAppointmentDate?: string;
  institutionAppointmentNumber?: string;
  administrativeCategory?: string;
  administrativeSection?: string;
  administrativeGrade?: string;
  administrativeClassificationEffectiveDate?: string;
  personalAddress?: string;
  structuredQualifications?: Array<{ name: string; issuingBody?: string; qualificationDate?: string }>;
  supplementaryWorkplaces?: Array<{ institutionName: string; municipality?: string; institutionAddress?: string; directorPhone?: string }>;
  workplace: {
    institutionName: string;
    municipality: string;
    institutionAddress: string;
    directorPhone: string;
    institutionEmail?: string;
  };
};

export class PublicSubmissionError extends Error {
  constructor(readonly status: number, readonly fields?: Record<string, string[]>, readonly retryAfterSeconds?: number) {
    super('تعذر إكمال الإرسال.');
    this.name = 'PublicSubmissionError';
  }
}

export async function submitTeacherIntake(
  districtId: string,
  payload: TeacherSubmissionPayload,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/public/districts/${encodeURIComponent(districtId)}/submissions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    throw new PublicSubmissionError(0);
  }

  if (response.status !== 202) {
    let failure: { error?: { fields?: Record<string, string[]> } } | undefined;
    try {
      failure = await response.json() as { error?: { fields?: Record<string, string[]> } };
    } catch {
      // Never surface response/parser internals to a public form.
    }
    const retryHeader = response.headers.get('retry-after');
    const retryAfterSeconds = retryHeader && /^\d+$/u.test(retryHeader) ? Number(retryHeader) : undefined;
    throw new PublicSubmissionError(response.status, failure?.error?.fields, retryAfterSeconds);
  }
  try {
    const receipt: unknown = await response.json();
    if (!receipt || typeof receipt !== 'object' || !('data' in receipt)
      || !receipt.data || typeof receipt.data !== 'object' || !('receiptId' in receipt.data)
      || typeof receipt.data.receiptId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(receipt.data.receiptId)) {
      throw new PublicSubmissionError(502);
    }
  } catch {
    throw new PublicSubmissionError(502);
  }
}
