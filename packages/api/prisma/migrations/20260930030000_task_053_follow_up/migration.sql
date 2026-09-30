CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "ownerInspectorId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "completionNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FollowUp_status_check" CHECK ("status" IN ('OPEN', 'COMPLETED')),
    CONSTRAINT "FollowUp_revision_positive_check" CHECK ("revision" >= 1),
    CONSTRAINT "FollowUp_note_length_check" CHECK (char_length("note") BETWEEN 1 AND 1000 AND btrim("note") <> ''),
    CONSTRAINT "FollowUp_completionNote_length_check" CHECK ("completionNote" IS NULL OR (char_length("completionNote") BETWEEN 1 AND 1000 AND btrim("completionNote") <> '')),
    CONSTRAINT "FollowUp_lifecycle_check" CHECK (
      ("status" = 'OPEN' AND "completedAt" IS NULL AND "completionNote" IS NULL)
      OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL)
    ),
    CONSTRAINT "FollowUp_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "FollowUp_ownerInspectorId_fkey" FOREIGN KEY ("ownerInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "FollowUp_reportId_dueDate_id_idx" ON "FollowUp"("reportId", "dueDate", "id");
CREATE INDEX "FollowUp_status_dueDate_id_idx" ON "FollowUp"("status", "dueDate", "id");
CREATE INDEX "FollowUp_ownerInspectorId_idx" ON "FollowUp"("ownerInspectorId");
