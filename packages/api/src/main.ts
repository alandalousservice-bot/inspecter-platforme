import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { registerAuthRoutes } from './identity/auth-routes.js';
import { requireAuthenticatedInspector } from './identity/auth-routes.js';
import { registerInstitutionRoutes } from './institutions/routes.js';
import { registerDistrictContextRoute } from './identity/district-routes.js';

const port = Number(process.env.PORT ?? 3001);
const prisma = new PrismaClient();

createApp((app) => {
  registerAuthRoutes(app, prisma);
  const requireInspector = requireAuthenticatedInspector(prisma);
  registerDistrictContextRoute(app, prisma, requireInspector);
  registerInstitutionRoutes(app, prisma, requireInspector);
}).listen(port);
