-- Additive R2 evolution. Existing correction origin/history is preserved.
ALTER TABLE "ScheduleCorrection"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'INSPECTOR_CORRECTION',
  ADD COLUMN "decisionInspectorId" UUID,
  ADD COLUMN "decisionNote" VARCHAR(500),
  ALTER COLUMN "inspectorId" DROP NOT NULL,
  ALTER COLUMN "note" DROP NOT NULL;

ALTER TABLE "ScheduleCorrection" DROP CONSTRAINT "ScheduleCorrection_state_check";
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_state_check" CHECK (
  "status" IN ('REQUESTED','SUBMITTED','ACCEPTED','REJECTED') AND
  "revision" > 0 AND "scheduleRevision" > 0 AND
  ("status" = 'REQUESTED' OR "proposedSlots" IS NOT NULL) AND
  ("status" <> 'ACCEPTED' OR "previousSlots" IS NOT NULL) AND
  ("status" <> 'REJECTED' OR ("decisionNote" IS NOT NULL AND char_length(btrim("decisionNote")) > 0))
);
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_origin_check" CHECK (
  ("origin" = 'INSPECTOR_CORRECTION' AND "inspectorId" IS NOT NULL AND "note" IS NOT NULL) OR
  ("origin" = 'TEACHER_UPDATE' AND "inspectorId" IS NULL AND "note" IS NULL AND "status" <> 'REQUESTED')
);
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_decisionInspectorId_fkey"
  FOREIGN KEY ("decisionInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- The existing partial unique index already excludes terminal REJECTED records.
-- Old untrusted photo assets stay historical and cannot be served as sanitized.
ALTER TABLE "TeacherPhoto" ADD COLUMN "sanitizationVersion" INTEGER;
ALTER TABLE "TeacherPhoto" ADD CONSTRAINT "TeacherPhoto_sanitizationVersion_check"
  CHECK ("sanitizationVersion" IS NULL OR "sanitizationVersion" = 1);
