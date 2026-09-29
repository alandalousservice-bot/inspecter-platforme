export type DeclaredWorkplace = {
  institutionName: string;
  municipality: string | null;
  institutionAddress: string | null;
  directorPhone: string | null;
  legacyAdditionalInstitutionNames: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function projectDeclaredWorkplace(snapshot: unknown): DeclaredWorkplace | null {
  if (!isRecord(snapshot)) return null;
  const workplace = snapshot.workplace;
  if (isRecord(workplace) && typeof workplace.institutionName === 'string') {
    return {
      institutionName: workplace.institutionName,
      municipality: typeof workplace.municipality === 'string' ? workplace.municipality : null,
      institutionAddress: typeof workplace.institutionAddress === 'string' ? workplace.institutionAddress : null,
      directorPhone: typeof workplace.directorPhone === 'string' ? workplace.directorPhone : null,
      legacyAdditionalInstitutionNames: [],
    };
  }
  if (typeof snapshot.primaryInstitutionName !== 'string') return null;
  return {
    institutionName: snapshot.primaryInstitutionName,
    municipality: null,
    institutionAddress: null,
    directorPhone: null,
    legacyAdditionalInstitutionNames: Array.isArray(snapshot.additionalInstitutionNames)
      ? snapshot.additionalInstitutionNames.filter((name): name is string => typeof name === 'string') : [],
  };
}
