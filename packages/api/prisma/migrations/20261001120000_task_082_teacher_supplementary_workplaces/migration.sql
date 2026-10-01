CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX "Teacher_id_districtId_key" ON "Teacher"("id", "districtId");

CREATE TABLE "TeacherSupplementaryWorkplace" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeacherSupplementaryWorkplace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TeacherSupplementaryWorkplace_validTo_after_validFrom_check"
      CHECK ("validTo" IS NULL OR "validTo" > "validFrom"),
    CONSTRAINT "TeacherSupplementaryWorkplace_teacherId_districtId_fkey"
      FOREIGN KEY ("teacherId", "districtId") REFERENCES "Teacher"("id", "districtId")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherSupplementaryWorkplace_institutionId_districtId_fkey"
      FOREIGN KEY ("institutionId", "districtId") REFERENCES "Institution"("id", "districtId")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TeacherSupplementaryWorkplace_teacherId_validFrom_id_idx"
  ON "TeacherSupplementaryWorkplace"("teacherId", "validFrom" DESC, "id" DESC);

ALTER TABLE "TeacherSupplementaryWorkplace"
  ADD CONSTRAINT "TeacherSupplementaryWorkplace_no_overlapping_periods"
  EXCLUDE USING GIST (
    "teacherId" WITH =,
    "institutionId" WITH =,
    daterange("validFrom", "validTo", '[)') WITH &&
  );
