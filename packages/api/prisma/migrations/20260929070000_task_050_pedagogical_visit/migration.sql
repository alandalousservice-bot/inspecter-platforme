CREATE TABLE "PedagogicalVisit" (
    "id" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "institutionNameSnapshot" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedagogicalVisit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PedagogicalVisit_status_check" CHECK ("status" IN ('PLANNED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT "PedagogicalVisit_academicYear_check" CHECK (
        CASE WHEN "academicYear" ~ '^[0-9]{4}-[0-9]{4}$'
          THEN substring("academicYear" FROM 6 FOR 4)::INTEGER = substring("academicYear" FROM 1 FOR 4)::INTEGER + 1
          ELSE FALSE END
    ),
    CONSTRAINT "PedagogicalVisit_time_order_check" CHECK ("scheduledStartAt" < "scheduledEndAt"),
    CONSTRAINT "PedagogicalVisit_occurredAt_status_check" CHECK (
        ("status" = 'COMPLETED' AND "occurredAt" IS NOT NULL)
        OR ("status" <> 'COMPLETED' AND "occurredAt" IS NULL)
    ),
    CONSTRAINT "PedagogicalVisit_revision_positive_check" CHECK ("revision" >= 1),
    CONSTRAINT "PedagogicalVisit_institutionNameSnapshot_nonempty_check" CHECK (length(btrim("institutionNameSnapshot")) > 0)
);

CREATE INDEX "PedagogicalVisit_districtId_scheduledStartAt_id_idx"
ON "PedagogicalVisit"("districtId", "scheduledStartAt" DESC, "id" DESC);
CREATE INDEX "PedagogicalVisit_teacherId_scheduledStartAt_idx"
ON "PedagogicalVisit"("teacherId", "scheduledStartAt");
CREATE INDEX "PedagogicalVisit_inspectorId_scheduledStartAt_idx"
ON "PedagogicalVisit"("inspectorId", "scheduledStartAt");
CREATE INDEX "PedagogicalVisit_institutionId_scheduledStartAt_idx"
ON "PedagogicalVisit"("institutionId", "scheduledStartAt");

ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_districtId_fkey"
FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_inspectorId_fkey"
FOREIGN KEY ("inspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_institutionId_districtId_fkey"
FOREIGN KEY ("institutionId", "districtId") REFERENCES "Institution"("id", "districtId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_inspector_no_overlapping_active_visit"
EXCLUDE USING GIST (
    "inspectorId" WITH =,
    tsrange("scheduledStartAt", "scheduledEndAt", '[)') WITH &&
)
WHERE ("status" <> 'CANCELLED');
ALTER TABLE "PedagogicalVisit"
ADD CONSTRAINT "PedagogicalVisit_teacher_no_overlapping_active_visit"
EXCLUDE USING GIST (
    "teacherId" WITH =,
    tsrange("scheduledStartAt", "scheduledEndAt", '[)') WITH &&
)
WHERE ("status" <> 'CANCELLED');
