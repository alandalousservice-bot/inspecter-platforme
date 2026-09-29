import type { Express, Request, Response, RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';

type DistrictContextDatabase = Pick<PrismaClient, 'inspectorDistrictMembership'>;

export function registerDistrictContextRoute(
  app: Express,
  database: DistrictContextDatabase,
  requireInspector: RequestHandler,
): void {
  app.get('/api/v1/me/districts', requireInspector, async (_request: Request, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    const inspectorId = response.locals.inspectorId as string;
    const now = new Date();
    const memberships = await database.inspectorDistrictMembership.findMany({
      where: {
        inspectorId,
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
      },
      select: { district: { select: { id: true, name: true } } },
      distinct: ['districtId'],
      orderBy: [{ district: { name: 'asc' } }, { districtId: 'asc' }],
    });
    response.json({ items: memberships.map(({ district }) => ({ id: district.id, name: district.name })) });
  });
}
