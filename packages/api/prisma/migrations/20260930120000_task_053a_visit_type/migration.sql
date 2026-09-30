ALTER TABLE "PedagogicalVisit"
  ADD COLUMN "visitType" TEXT,
  ADD COLUMN "actualStartAt" TIMESTAMP(3),
  ADD COLUMN "actualEndAt" TIMESTAMP(3),
  ALTER COLUMN "scheduledStartAt" DROP NOT NULL,
  ALTER COLUMN "scheduledEndAt" DROP NOT NULL;

ALTER TABLE "PedagogicalVisit"
  ADD CONSTRAINT "PedagogicalVisit_visitType_check"
  CHECK ("visitType" IS NULL OR "visitType" IN (
    'GUIDANCE', 'TENURE_CONFIRMATION', 'PROMOTION_EVALUATION',
    'MONITORING_FOLLOW_UP', 'EXCEPTIONAL'
  )),
  ADD CONSTRAINT "PedagogicalVisit_interval_shape_check"
  CHECK (
    (
      "scheduledStartAt" IS NOT NULL
      AND "scheduledEndAt" IS NOT NULL
      AND "scheduledStartAt" < "scheduledEndAt"
      AND "actualStartAt" IS NULL
      AND "actualEndAt" IS NULL
    )
    OR
    (
      "visitType" = 'EXCEPTIONAL'
      AND "scheduledStartAt" IS NULL
      AND "scheduledEndAt" IS NULL
      AND "actualStartAt" IS NOT NULL
      AND "actualEndAt" IS NOT NULL
      AND "actualStartAt" < "actualEndAt"
      AND "status" = 'COMPLETED'
      AND "occurredAt" = "actualEndAt"
    )
  );

ALTER TABLE "PedagogicalVisit"
  DROP CONSTRAINT "PedagogicalVisit_inspector_no_overlapping_active_visit",
  DROP CONSTRAINT "PedagogicalVisit_teacher_no_overlapping_active_visit";

ALTER TABLE "PedagogicalVisit"
  ADD CONSTRAINT "PedagogicalVisit_inspector_no_overlapping_active_visit"
  EXCLUDE USING GIST (
    "inspectorId" WITH =,
    tsrange(COALESCE("actualStartAt", "scheduledStartAt"), COALESCE("actualEndAt", "scheduledEndAt"), '[)') WITH &&
  ) WHERE ("status" <> 'CANCELLED'),
  ADD CONSTRAINT "PedagogicalVisit_teacher_no_overlapping_active_visit"
  EXCLUDE USING GIST (
    "teacherId" WITH =,
    tsrange(COALESCE("actualStartAt", "scheduledStartAt"), COALESCE("actualEndAt", "scheduledEndAt"), '[)') WITH &&
  ) WHERE ("status" <> 'CANCELLED');

CREATE INDEX "PedagogicalVisit_districtId_visitType_idx"
  ON "PedagogicalVisit"("districtId", "visitType");
CREATE INDEX "PedagogicalVisit_districtId_effectiveStartAt_id_idx"
  ON "PedagogicalVisit"(
    "districtId",
    (COALESCE("actualStartAt", "scheduledStartAt")) DESC,
    "id" DESC
  );
