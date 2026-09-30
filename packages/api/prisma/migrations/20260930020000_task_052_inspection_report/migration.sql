CREATE TABLE "InspectionReport" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'PEDAGOGICAL_ACCOMPANIMENT',
    "templateSource" TEXT NOT NULL DEFAULT 'INSPECTOR_AUTHORED',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "levelClass" TEXT,
    "lessonTopic" TEXT,
    "pedagogicalObservations" TEXT,
    "strengths" TEXT,
    "improvementAreas" TEXT,
    "guidanceRecommendations" TEXT,
    "inspectorConclusion" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByInspectorId" UUID,
    "finalizedInspectorNameSnapshot" TEXT,
    "finalizedInspectorSurnameSnapshot" TEXT,
    "finalizedTeacherNameSnapshot" TEXT,
    "finalizedTeacherSurnameSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionReport_provenance_check" CHECK ("reportType" = 'PEDAGOGICAL_ACCOMPANIMENT' AND "templateSource" = 'INSPECTOR_AUTHORED' AND "templateVersion" = 1),
    CONSTRAINT "InspectionReport_status_check" CHECK ("status" IN ('DRAFT', 'FINAL')),
    CONSTRAINT "InspectionReport_revision_positive_check" CHECK ("revision" >= 1),
    CONSTRAINT "InspectionReport_levelClass_length_check" CHECK ("levelClass" IS NULL OR (char_length("levelClass") BETWEEN 1 AND 100 AND btrim("levelClass") <> '')),
    CONSTRAINT "InspectionReport_lessonTopic_length_check" CHECK ("lessonTopic" IS NULL OR (char_length("lessonTopic") BETWEEN 1 AND 200 AND btrim("lessonTopic") <> '')),
    CONSTRAINT "InspectionReport_pedagogicalObservations_length_check" CHECK ("pedagogicalObservations" IS NULL OR (char_length("pedagogicalObservations") BETWEEN 1 AND 4000 AND btrim("pedagogicalObservations") <> '')),
    CONSTRAINT "InspectionReport_strengths_length_check" CHECK ("strengths" IS NULL OR (char_length("strengths") BETWEEN 1 AND 4000 AND btrim("strengths") <> '')),
    CONSTRAINT "InspectionReport_improvementAreas_length_check" CHECK ("improvementAreas" IS NULL OR (char_length("improvementAreas") BETWEEN 1 AND 4000 AND btrim("improvementAreas") <> '')),
    CONSTRAINT "InspectionReport_guidanceRecommendations_length_check" CHECK ("guidanceRecommendations" IS NULL OR (char_length("guidanceRecommendations") BETWEEN 1 AND 4000 AND btrim("guidanceRecommendations") <> '')),
    CONSTRAINT "InspectionReport_inspectorConclusion_length_check" CHECK ("inspectorConclusion" IS NULL OR (char_length("inspectorConclusion") BETWEEN 1 AND 4000 AND btrim("inspectorConclusion") <> '')),
    CONSTRAINT "InspectionReport_inspectorSnapshot_length_check" CHECK (("finalizedInspectorNameSnapshot" IS NULL OR (char_length("finalizedInspectorNameSnapshot") BETWEEN 1 AND 100 AND btrim("finalizedInspectorNameSnapshot") <> '')) AND ("finalizedInspectorSurnameSnapshot" IS NULL OR (char_length("finalizedInspectorSurnameSnapshot") BETWEEN 1 AND 100 AND btrim("finalizedInspectorSurnameSnapshot") <> ''))),
    CONSTRAINT "InspectionReport_teacherSnapshot_length_check" CHECK (("finalizedTeacherNameSnapshot" IS NULL OR (char_length("finalizedTeacherNameSnapshot") BETWEEN 1 AND 100 AND btrim("finalizedTeacherNameSnapshot") <> '')) AND ("finalizedTeacherSurnameSnapshot" IS NULL OR (char_length("finalizedTeacherSurnameSnapshot") BETWEEN 1 AND 100 AND btrim("finalizedTeacherSurnameSnapshot") <> ''))),
    CONSTRAINT "InspectionReport_lifecycle_check" CHECK (
      ("status" = 'DRAFT' AND "finalizedAt" IS NULL AND "finalizedByInspectorId" IS NULL AND "finalizedInspectorNameSnapshot" IS NULL AND "finalizedInspectorSurnameSnapshot" IS NULL AND "finalizedTeacherNameSnapshot" IS NULL AND "finalizedTeacherSurnameSnapshot" IS NULL)
      OR
      ("status" = 'FINAL' AND "finalizedAt" IS NOT NULL AND "finalizedByInspectorId" IS NOT NULL AND "finalizedInspectorNameSnapshot" IS NOT NULL AND "finalizedInspectorSurnameSnapshot" IS NOT NULL AND "finalizedTeacherNameSnapshot" IS NOT NULL AND "finalizedTeacherSurnameSnapshot" IS NOT NULL AND "levelClass" IS NOT NULL AND "lessonTopic" IS NOT NULL AND "inspectorConclusion" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "InspectionReport_visitId_key" ON "InspectionReport"("visitId");
CREATE INDEX "InspectionReport_finalizedByInspectorId_idx" ON "InspectionReport"("finalizedByInspectorId");

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "PedagogicalVisit"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_finalizedByInspectorId_fkey" FOREIGN KEY ("finalizedByInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
