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
  workplace: {
    institutionName: string;
    municipality: string;
    institutionAddress: string;
    directorPhone: string;
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
}
