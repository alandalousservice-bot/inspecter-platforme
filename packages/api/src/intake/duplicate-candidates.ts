export const DUPLICATE_MATCH_REASONS = [
  'SAME_PHONE',
  'SAME_EMAIL',
  'SAME_NAME_AND_DOB',
] as const;

export type DuplicateMatchReason = typeof DUPLICATE_MATCH_REASONS[number];

export type SubmissionSnapshot = {
  id: string;
  districtId: string;
  status: string;
  submittedAt: Date;
  submittedProfile: unknown;
};

function profileString(profile: unknown, key: string): string | undefined {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return undefined;
  const value = (profile as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeName(value: string): string {
  return Array.from(value.normalize('NFC').trim().replace(/\s+/gu, ' '), (character) => (
    /\p{Script=Latin}/u.test(character) ? character.toLowerCase() : character
  )).join('');
}

function matchReasons(left: SubmissionSnapshot, right: SubmissionSnapshot): DuplicateMatchReason[] {
  const leftProfile = left.submittedProfile;
  const rightProfile = right.submittedProfile;
  const reasons: DuplicateMatchReason[] = [];
  const leftPhone = profileString(leftProfile, 'phone');
  const rightPhone = profileString(rightProfile, 'phone');
  if (leftPhone && rightPhone && leftPhone === rightPhone) reasons.push('SAME_PHONE');

  const leftEmail = profileString(leftProfile, 'email');
  const rightEmail = profileString(rightProfile, 'email');
  if (leftEmail && rightEmail && leftEmail === rightEmail) reasons.push('SAME_EMAIL');

  const leftFirstName = profileString(leftProfile, 'firstName');
  const rightFirstName = profileString(rightProfile, 'firstName');
  const leftLastName = profileString(leftProfile, 'lastName');
  const rightLastName = profileString(rightProfile, 'lastName');
  const leftDateOfBirth = profileString(leftProfile, 'dateOfBirth');
  const rightDateOfBirth = profileString(rightProfile, 'dateOfBirth');
  if (leftFirstName && rightFirstName && leftLastName && rightLastName
    && leftDateOfBirth && rightDateOfBirth
    && normalizeName(leftFirstName) === normalizeName(rightFirstName)
    && normalizeName(leftLastName) === normalizeName(rightLastName)
    && leftDateOfBirth === rightDateOfBirth) {
    reasons.push('SAME_NAME_AND_DOB');
  }

  return reasons;
}

export function findPotentialDuplicateCandidates(
  submission: SubmissionSnapshot,
  candidates: readonly SubmissionSnapshot[],
) {
  return candidates
    .filter((candidate) => candidate.id !== submission.id
      && candidate.districtId === submission.districtId
      && ['PENDING', 'INTERNAL_REVIEW'].includes(candidate.status))
    .map((candidate) => ({ candidate, matchReasons: matchReasons(submission, candidate) }))
    .filter(({ matchReasons: reasons }) => reasons.length > 0)
    .sort((left, right) => left.candidate.id.localeCompare(right.candidate.id));
}

export function hasPotentialDuplicateCandidates(
  submissions: readonly SubmissionSnapshot[],
  candidates: readonly SubmissionSnapshot[],
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const candidateGroups = new Map<string, SubmissionSnapshot[]>();
  for (const candidate of candidates) {
    if (!['PENDING', 'INTERNAL_REVIEW'].includes(candidate.status)) continue;
    const group = candidateGroups.get(candidate.districtId) ?? [];
    group.push(candidate);
    candidateGroups.set(candidate.districtId, group);
  }
  for (const submission of submissions) {
    result.set(submission.id, findPotentialDuplicateCandidates(
      submission,
      candidateGroups.get(submission.districtId) ?? [],
    ).length > 0);
  }
  return result;
}
