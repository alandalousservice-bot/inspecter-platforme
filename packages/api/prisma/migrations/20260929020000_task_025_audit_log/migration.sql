CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorInspectorId" UUID,
    "districtId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" UUID,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_districtId_occurredAt_idx" ON "AuditLog"("districtId", "occurredAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorInspectorId_fkey"
FOREIGN KEY ("actorInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_districtId_fkey"
FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
