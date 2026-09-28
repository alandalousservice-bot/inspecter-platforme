import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../http/api-error.js';

type MembershipDatabase = Pick<PrismaClient, 'inspectorDistrictMembership'>;

export async function requireInspectorDistrictMembership(
  database: MembershipDatabase,
  inspectorId: string,
  districtId: string,
  at: Date = new Date(),
) {
  const membership = await database.inspectorDistrictMembership.findFirst({
    where: {
      inspectorId,
      districtId,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
  });

  if (!membership) {
    throw new ApiError(404, 'NOT_FOUND', 'المورد غير موجود ضمن نطاق الوصول.');
  }

  return membership;
}
