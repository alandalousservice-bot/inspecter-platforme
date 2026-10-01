ALTER TABLE "TeacherSubmission"
  ADD COLUMN "birthProvince" VARCHAR(100),
  ADD COLUMN "professionalFramework" VARCHAR(120),
  ADD COLUMN "firstEducationAppointmentDate" DATE,
  ADD COLUMN "firstEducationAppointmentDecisionNumber" VARCHAR(120),
  ADD COLUMN "firstInstallationDate" DATE,
  ADD COLUMN "traineeshipDate" DATE,
  ADD COLUMN "institutionAppointmentDate" DATE,
  ADD COLUMN "institutionAppointmentNumber" VARCHAR(120),
  ADD COLUMN "administrativeCategory" VARCHAR(100),
  ADD COLUMN "administrativeSection" VARCHAR(100),
  ADD COLUMN "administrativeGrade" VARCHAR(100),
  ADD COLUMN "administrativeClassificationEffectiveDate" DATE,
  ADD COLUMN "personalAddress" VARCHAR(300),
  ADD COLUMN "declaredHomeInstitutionEmail" VARCHAR(254),
  ADD CONSTRAINT "TeacherSubmission_birthProvince_check"
    CHECK ("birthProvince" IS NULL OR (char_length("birthProvince") BETWEEN 1 AND 100 AND btrim("birthProvince") <> '')),
  ADD CONSTRAINT "TeacherSubmission_professionalFramework_check"
    CHECK ("professionalFramework" IS NULL OR (char_length("professionalFramework") BETWEEN 1 AND 120 AND btrim("professionalFramework") <> '')),
  ADD CONSTRAINT "TeacherSubmission_firstEducationAppointmentDecisionNumber_check"
    CHECK ("firstEducationAppointmentDecisionNumber" IS NULL OR (char_length("firstEducationAppointmentDecisionNumber") BETWEEN 1 AND 120 AND btrim("firstEducationAppointmentDecisionNumber") <> '')),
  ADD CONSTRAINT "TeacherSubmission_institutionAppointmentNumber_check"
    CHECK ("institutionAppointmentNumber" IS NULL OR (char_length("institutionAppointmentNumber") BETWEEN 1 AND 120 AND btrim("institutionAppointmentNumber") <> '')),
  ADD CONSTRAINT "TeacherSubmission_administrativeCategory_check"
    CHECK ("administrativeCategory" IS NULL OR (char_length("administrativeCategory") BETWEEN 1 AND 100 AND btrim("administrativeCategory") <> '')),
  ADD CONSTRAINT "TeacherSubmission_administrativeSection_check"
    CHECK ("administrativeSection" IS NULL OR (char_length("administrativeSection") BETWEEN 1 AND 100 AND btrim("administrativeSection") <> '')),
  ADD CONSTRAINT "TeacherSubmission_administrativeGrade_check"
    CHECK ("administrativeGrade" IS NULL OR (char_length("administrativeGrade") BETWEEN 1 AND 100 AND btrim("administrativeGrade") <> '')),
  ADD CONSTRAINT "TeacherSubmission_personalAddress_check"
    CHECK ("personalAddress" IS NULL OR (char_length("personalAddress") BETWEEN 1 AND 300 AND btrim("personalAddress") <> ''));

CREATE TABLE "TeacherSubmissionQualificationDeclaration" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "issuingBody" VARCHAR(200),
  "qualificationDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherSubmissionQualificationDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tsq_position_check" CHECK ("position" BETWEEN 0 AND 4),
  CONSTRAINT "tsq_name_check" CHECK (char_length("name") BETWEEN 1 AND 200 AND btrim("name") <> ''),
  CONSTRAINT "tsq_issuing_body_check"
    CHECK ("issuingBody" IS NULL OR (char_length("issuingBody") BETWEEN 1 AND 200 AND btrim("issuingBody") <> '')),
  CONSTRAINT "tsq_submission_fk"
    FOREIGN KEY ("submissionId") REFERENCES "TeacherSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tsq_submission_position_key" UNIQUE ("submissionId", "position")
);

CREATE TABLE "TeacherSubmissionSupplementaryWorkplaceDeclaration" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "institutionName" VARCHAR(200) NOT NULL,
  "municipality" VARCHAR(150),
  "institutionAddress" VARCHAR(300),
  "directorPhone" VARCHAR(20),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherSubmissionSupplementaryWorkplaceDeclaration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tsw_position_check" CHECK ("position" BETWEEN 0 AND 2),
  CONSTRAINT "tsw_institution_name_check"
    CHECK (char_length("institutionName") BETWEEN 1 AND 200 AND btrim("institutionName") <> ''),
  CONSTRAINT "tsw_municipality_check"
    CHECK ("municipality" IS NULL OR (char_length("municipality") BETWEEN 1 AND 150 AND btrim("municipality") <> '')),
  CONSTRAINT "tsw_institution_address_check"
    CHECK ("institutionAddress" IS NULL OR (char_length("institutionAddress") BETWEEN 1 AND 300 AND btrim("institutionAddress") <> '')),
  CONSTRAINT "tsw_submission_fk"
    FOREIGN KEY ("submissionId") REFERENCES "TeacherSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tsw_submission_position_key" UNIQUE ("submissionId", "position")
);
