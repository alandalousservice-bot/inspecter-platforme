import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { registerAuthRoutes } from './identity/auth-routes.js';

const port = Number(process.env.PORT ?? 3001);
const prisma = new PrismaClient();

createApp((app) => registerAuthRoutes(app, prisma)).listen(port);
