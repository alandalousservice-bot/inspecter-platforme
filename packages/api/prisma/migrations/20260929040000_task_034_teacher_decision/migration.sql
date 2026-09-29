CREATE TABLE "Teacher" (
    "id" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "birthDate" DATE,
    "placeOfBirth" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "professionalStatus" TEXT,
    "employedAt" DATE,
    "confirmedAt" DATE,
    "qualifications" TEXT,
    "recordStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Teacher_recordStatus_check" CHECK ("recordStatus" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "Teacher_professionalStatus_check" CHECK ("professionalStatus" IS NULL OR "professionalStatus" IN ('PERMANENT', 'TRAINEE', 'CONTRACT', 'TEMPORARY_CONTRACT'))
);

CREATE INDEX "Teacher_districtId_surname_name_recordStatus_idx"
ON "Teacher"("districtId", "surname", "name", "recordStatus");

ALTER TABLE "Teacher"
ADD CONSTRAINT "Teacher_districtId_fkey"
FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeacherSubmission"
ADD CONSTRAINT "TeacherSubmission_acceptedTeacherId_fkey"
FOREIGN KEY ("acceptedTeacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
