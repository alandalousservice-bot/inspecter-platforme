CREATE TABLE "TeacherSubmission" (
    "id" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "submittedProfile" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByInspectorId" UUID,
    "acceptedTeacherId" UUID,

    CONSTRAINT "TeacherSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherSubmission_acceptedTeacherId_key"
ON "TeacherSubmission"("acceptedTeacherId");

CREATE INDEX "TeacherSubmission_districtId_status_submittedAt_idx"
ON "TeacherSubmission"("districtId", "status", "submittedAt");

ALTER TABLE "TeacherSubmission"
ADD CONSTRAINT "TeacherSubmission_districtId_fkey"
FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeacherSubmission"
ADD CONSTRAINT "TeacherSubmission_decidedByInspectorId_fkey"
FOREIGN KEY ("decidedByInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
