CREATE UNIQUE INDEX "WeeklySchedule_id_teacherId_key"
  ON "WeeklySchedule"("id", "teacherId");

ALTER TABLE "WeeklyScheduleSlot"
  ADD COLUMN "teacherId" UUID,
  ADD COLUMN "districtId" UUID,
  ADD COLUMN "institutionId" UUID,
  ADD COLUMN "validFrom" DATE,
  ADD COLUMN "validTo" DATE,
  ADD COLUMN "workplaceBasis" TEXT;

ALTER TABLE "WeeklyScheduleSlot"
  ADD CONSTRAINT "WeeklyScheduleSlot_temporal_shape_check" CHECK (
    ("institutionId" IS NULL AND "validFrom" IS NULL AND "validTo" IS NULL
      AND "teacherId" IS NULL AND "districtId" IS NULL AND "workplaceBasis" IS NULL)
    OR
    ("institutionId" IS NOT NULL AND "validFrom" IS NOT NULL AND "teacherId" IS NOT NULL
      AND "districtId" IS NOT NULL AND "workplaceBasis" IS NOT NULL
      AND "workplaceBasis" IN ('HOME', 'SUPPLEMENTARY')
      AND ("validTo" IS NULL OR "validTo" > "validFrom"))
  ),
  ADD CONSTRAINT "WeeklyScheduleSlot_workplaceBasis_check" CHECK (
    "workplaceBasis" IS NULL OR "workplaceBasis" IN ('HOME', 'SUPPLEMENTARY')
  ),
  ADD CONSTRAINT "WeeklyScheduleSlot_teacherId_districtId_fkey"
    FOREIGN KEY ("teacherId", "districtId") REFERENCES "Teacher"("id", "districtId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WeeklyScheduleSlot_institutionId_districtId_fkey"
    FOREIGN KEY ("institutionId", "districtId") REFERENCES "Institution"("id", "districtId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WeeklyScheduleSlot_scheduleId_teacherId_fkey"
    FOREIGN KEY ("scheduleId", "teacherId") REFERENCES "WeeklySchedule"("id", "teacherId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "WeeklyScheduleSlot_institutionId_idx" ON "WeeklyScheduleSlot"("institutionId");
CREATE INDEX "WeeklyScheduleSlot_teacherId_validFrom_validTo_dayOfWeek_idx"
  ON "WeeklyScheduleSlot"("teacherId", "validFrom", "validTo", "dayOfWeek");

ALTER TABLE "WeeklyScheduleSlot" DROP CONSTRAINT "WeeklyScheduleSlot_no_overlapping_same_day";

ALTER TABLE "WeeklyScheduleSlot"
  ADD CONSTRAINT "WeeklyScheduleSlot_legacy_no_overlapping_same_day"
  EXCLUDE USING GIST (
    "scheduleId" WITH =,
    "dayOfWeek" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
  ) WHERE ("validFrom" IS NULL);

ALTER TABLE "WeeklyScheduleSlot"
  ADD CONSTRAINT "WeeklyScheduleSlot_temporal_no_overlapping_teacher_slots"
  EXCLUDE USING GIST (
    "teacherId" WITH =,
    "dayOfWeek" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&,
    daterange("validFrom", "validTo", '[)') WITH &&
  ) WHERE ("validFrom" IS NOT NULL);
