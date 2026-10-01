ALTER TABLE "Teacher"
  ADD COLUMN "professionalFramework" VARCHAR(120),
  ADD COLUMN "firstEducationAppointmentDate" DATE,
  ADD COLUMN "firstEducationAppointmentDecisionNumber" VARCHAR(120),
  ADD COLUMN "firstInstallationDate" DATE,
  ADD COLUMN "traineeshipDate" DATE,
  ADD COLUMN "institutionAppointmentDate" DATE,
  ADD COLUMN "institutionAppointmentNumber" VARCHAR(120),
  ADD COLUMN "financialControllerVisaNumber" VARCHAR(120),
  ADD COLUMN "administrativeCategory" VARCHAR(100),
  ADD COLUMN "administrativeSection" VARCHAR(100),
  ADD COLUMN "administrativeGrade" VARCHAR(100),
  ADD COLUMN "administrativeClassificationEffectiveDate" DATE,
  ADD COLUMN "birthProvince" VARCHAR(100),
  ADD COLUMN "personalAddress" VARCHAR(300),
  ADD COLUMN "administrativeNote" VARCHAR(1000);

ALTER TABLE "Institution"
  ADD COLUMN "email" VARCHAR(254);

ALTER TABLE "Teacher"
  DROP CONSTRAINT "Teacher_professionalStatus_check",
  ADD CONSTRAINT "Teacher_professionalStatus_check"
    CHECK ("professionalStatus" IS NULL OR "professionalStatus" IN ('PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT', 'SUBSTITUTE'));
