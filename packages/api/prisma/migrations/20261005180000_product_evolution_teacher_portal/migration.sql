-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "trainingStatus" TEXT,
ADD COLUMN     "trainingVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorTeacherId" UUID;

-- CreateTable
CREATE TABLE "TeacherAccount" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "loginEmail" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherSession" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherInvitation" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "loginEmail" VARCHAR(254) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherChangeRequest" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "districtId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "baselineUpdatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "decisionInspectorId" UUID,
    "decisionNote" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherPhoto" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "contentType" VARCHAR(32) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "storageKey" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleCorrection" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "inspectorId" UUID NOT NULL,
    "academicYear" TEXT NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "scheduleRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "proposedSlots" JSONB,
    "previousSlots" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAccount_teacherId_key" ON "TeacherAccount"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAccount_loginEmail_key" ON "TeacherAccount"("loginEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSession_tokenHash_key" ON "TeacherSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherSession_accountId_idx" ON "TeacherSession"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherInvitation_tokenHash_key" ON "TeacherInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TeacherInvitation_teacherId_expiresAt_idx" ON "TeacherInvitation"("teacherId", "expiresAt");

-- CreateIndex
CREATE INDEX "TeacherChangeRequest_districtId_status_createdAt_id_idx" ON "TeacherChangeRequest"("districtId", "status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TeacherChangeRequest_teacherId_createdAt_id_idx" ON "TeacherChangeRequest"("teacherId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPhoto_storageKey_key" ON "TeacherPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "TeacherPhoto_teacherId_createdAt_id_idx" ON "TeacherPhoto"("teacherId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ScheduleCorrection_teacherId_academicYear_createdAt_idx" ON "ScheduleCorrection"("teacherId", "academicYear", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorTeacherId_fkey" FOREIGN KEY ("actorTeacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherAccount" ADD CONSTRAINT "TeacherAccount_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherSession" ADD CONSTRAINT "TeacherSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TeacherAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherChangeRequest" ADD CONSTRAINT "TeacherChangeRequest_decisionInspectorId_fkey" FOREIGN KEY ("decisionInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherChangeRequest" ADD CONSTRAINT "TeacherChangeRequest_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherChangeRequest" ADD CONSTRAINT "TeacherChangeRequest_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TeacherPhoto" ADD CONSTRAINT "TeacherPhoto_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Additive domain protection; no legacy rows are backfilled or rewritten.
ALTER TABLE "TeacherAccount" ADD CONSTRAINT "TeacherAccount_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE'));
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_training_check" CHECK (("trainingStatus" IS NULL OR "trainingStatus" IN ('NOT_STARTED','IN_PROGRESS','INCOMPLETE','COMPLETED')) AND ("trainingVerifiedAt" IS NULL OR ("trainingStatus" IS NOT NULL AND "trainingStatus"='COMPLETED')));
ALTER TABLE "TeacherChangeRequest" ADD CONSTRAINT "TeacherChangeRequest_state_check" CHECK ("kind" IN ('PROFILE','CONTACT','TRAINING','TRANSFER','WORKPLACE','LOCATION') AND "status" IN ('PENDING','ACCEPTED','REJECTED','APPROVED_PENDING_DESTINATION') AND "revision">0 AND ("status"<>'APPROVED_PENDING_DESTINATION' OR "kind"='TRANSFER'));
CREATE UNIQUE INDEX "TeacherChangeRequest_one_pending_kind" ON "TeacherChangeRequest" ("teacherId","kind") WHERE "status"='PENDING';
ALTER TABLE "TeacherSession" ADD CONSTRAINT "TeacherSession_lifetime_check" CHECK ("expiresAt">"createdAt");
ALTER TABLE "TeacherPhoto" ADD CONSTRAINT "TeacherPhoto_validation_check" CHECK ("contentType" IN ('image/png','image/jpeg') AND "byteLength">0 AND "byteLength"<=2097152);
ALTER TABLE "ScheduleCorrection" ADD CONSTRAINT "ScheduleCorrection_state_check" CHECK ("status" IN ('REQUESTED','SUBMITTED','ACCEPTED') AND "revision">0 AND "scheduleRevision">0 AND ("status"='REQUESTED' OR "proposedSlots" IS NOT NULL) AND ("status"<>'ACCEPTED' OR "previousSlots" IS NOT NULL));
CREATE UNIQUE INDEX "ScheduleCorrection_one_open_year" ON "ScheduleCorrection" ("teacherId","academicYear") WHERE "status" IN ('REQUESTED','SUBMITTED');
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_single_actor_check" CHECK (NOT ("actorInspectorId" IS NOT NULL AND "actorTeacherId" IS NOT NULL));
