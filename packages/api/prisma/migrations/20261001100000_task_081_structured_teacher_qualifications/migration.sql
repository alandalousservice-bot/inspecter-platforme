CREATE TABLE "TeacherQualification" (
  "id" UUID NOT NULL,
  "teacherId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "issuingBody" VARCHAR(200),
  "qualificationDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeacherQualification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherQualification_name_check" CHECK (char_length("name") BETWEEN 1 AND 200 AND btrim("name") <> ''),
  CONSTRAINT "TeacherQualification_issuingBody_check" CHECK (
    "issuingBody" IS NULL OR (char_length("issuingBody") BETWEEN 1 AND 200 AND btrim("issuingBody") <> '')
  ),
  CONSTRAINT "TeacherQualification_teacherId_fkey" FOREIGN KEY ("teacherId")
    REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TeacherQualification_teacherId_qualificationDate_createdAt_id_idx"
  ON "TeacherQualification"("teacherId", "qualificationDate" DESC NULLS LAST, "createdAt" DESC, "id" DESC);
