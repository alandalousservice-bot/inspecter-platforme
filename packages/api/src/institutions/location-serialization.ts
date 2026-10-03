import type { Prisma } from '@prisma/client';

export type CanonicalInstitutionLocationFields = {
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  locationSource: string | null;
};

export function serializeCanonicalInstitutionLocation(location: CanonicalInstitutionLocationFields) {
  const { latitude, longitude, locationSource } = location;
  if (latitude === null || longitude === null || locationSource === null) return null;
  return {
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
    source: locationSource,
  };
}
