ALTER TABLE "InspectionReport"
  ADD COLUMN "educationDirectorateText" TEXT,
  ADD COLUMN "administrativeDivisionText" TEXT,
  ADD COLUMN "teacherClassificationText" TEXT,
  ADD COLUMN "teacherGradeText" TEXT,
  ADD COLUMN "teacherNationalityText" TEXT,
  ADD COLUMN "teacherEffectiveDateText" TEXT,
  ADD COLUMN "teacherLastInspectionText" TEXT,
  ADD COLUMN "teacherAppointmentText" TEXT,
  ADD COLUMN "teacherProfessionalFrameworkText" TEXT,
  ADD COLUMN "actualLessonDurationText" TEXT,
  ADD COLUMN "studentCount" INTEGER,
  ADD COLUMN "studentsPresentCount" INTEGER,
  ADD COLUMN "studentsAbsentCount" INTEGER,
  ADD COLUMN "lessonObjective" TEXT,
  ADD COLUMN "pedagogicalGuidanceText" TEXT,
  ADD COLUMN "practicalGuidanceText" TEXT,
  ADD COLUMN "visitStrengthsText" TEXT,
  ADD COLUMN "visitImprovementAreasText" TEXT,
  ADD COLUMN "tenureConclusionText" TEXT,
  ADD COLUMN "generalAssessmentText" TEXT,
  ADD COLUMN "markText" TEXT,
  ADD COLUMN "markWordsText" TEXT,
  ADD COLUMN "pedagogicalMark" NUMERIC(4,2),
  ADD COLUMN "finalizedTeacherBirthDateSnapshot" DATE,
  ADD COLUMN "finalizedTeacherPlaceOfBirthSnapshot" TEXT,
  ADD COLUMN "finalizedTeacherQualificationsSnapshot" TEXT,
  ADD COLUMN "finalizedDistrictNameSnapshot" TEXT,
  ADD COLUMN "finalizedInstitutionMunicipalitySnapshot" TEXT;

ALTER TABLE "InspectionReport" DROP CONSTRAINT "InspectionReport_provenance_check";
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_provenance_check" CHECK (
  ("reportType" = 'PEDAGOGICAL_ACCOMPANIMENT' AND "templateSource" = 'INSPECTOR_AUTHORED' AND "templateVersion" = 1)
  OR
  ("reportType" = 'INSPECTOR_VISIT' AND "templateSource" = 'PRODUCT_OWNER_ADOPTED' AND "templateVersion" = 1)
);
CREATE UNIQUE INDEX "InspectionReport_id_reportType_templateVersion_key"
  ON "InspectionReport"("id", "reportType", "templateVersion");

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_type_fields_check" CHECK (
  (
    "reportType" = 'PEDAGOGICAL_ACCOMPANIMENT'
    AND "educationDirectorateText" IS NULL AND "administrativeDivisionText" IS NULL
    AND "teacherClassificationText" IS NULL AND "teacherGradeText" IS NULL
    AND "teacherNationalityText" IS NULL AND "teacherEffectiveDateText" IS NULL
    AND "teacherLastInspectionText" IS NULL AND "teacherAppointmentText" IS NULL
    AND "teacherProfessionalFrameworkText" IS NULL AND "actualLessonDurationText" IS NULL
    AND "studentCount" IS NULL AND "studentsPresentCount" IS NULL AND "studentsAbsentCount" IS NULL
    AND "lessonObjective" IS NULL AND "pedagogicalGuidanceText" IS NULL AND "practicalGuidanceText" IS NULL
    AND "visitStrengthsText" IS NULL AND "visitImprovementAreasText" IS NULL AND "tenureConclusionText" IS NULL
    AND "generalAssessmentText" IS NULL AND "markText" IS NULL AND "markWordsText" IS NULL AND "pedagogicalMark" IS NULL
    AND "finalizedTeacherBirthDateSnapshot" IS NULL AND "finalizedTeacherPlaceOfBirthSnapshot" IS NULL
    AND "finalizedTeacherQualificationsSnapshot" IS NULL AND "finalizedDistrictNameSnapshot" IS NULL
    AND "finalizedInstitutionMunicipalitySnapshot" IS NULL
  )
  OR
  (
    "reportType" = 'INSPECTOR_VISIT'
    AND "pedagogicalObservations" IS NULL AND "strengths" IS NULL
    AND "improvementAreas" IS NULL AND "guidanceRecommendations" IS NULL
  )
);

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_v1_attendance_check" CHECK (
  ("studentCount" IS NULL OR "studentCount" >= 0)
  AND ("studentsPresentCount" IS NULL OR "studentsPresentCount" >= 0)
  AND ("studentsAbsentCount" IS NULL OR "studentsAbsentCount" >= 0)
  AND ("studentCount" IS NULL OR "studentsPresentCount" IS NULL OR "studentsPresentCount" <= "studentCount")
  AND ("studentCount" IS NULL OR "studentsAbsentCount" IS NULL OR "studentsAbsentCount" <= "studentCount")
  AND ("studentCount" IS NULL OR "studentsPresentCount" IS NULL OR "studentsAbsentCount" IS NULL
    OR "studentsPresentCount"::BIGINT + "studentsAbsentCount"::BIGINT = "studentCount"::BIGINT)
);
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_pedagogicalMark_range_check"
  CHECK ("pedagogicalMark" IS NULL OR "pedagogicalMark" BETWEEN 0 AND 20);

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_v1_snapshots_lifecycle_check" CHECK (
  ("status" = 'DRAFT' AND "finalizedTeacherBirthDateSnapshot" IS NULL
    AND "finalizedTeacherPlaceOfBirthSnapshot" IS NULL AND "finalizedTeacherQualificationsSnapshot" IS NULL
    AND "finalizedDistrictNameSnapshot" IS NULL AND "finalizedInstitutionMunicipalitySnapshot" IS NULL)
  OR "status" = 'FINAL'
);
ALTER TABLE "InspectionReport" DROP CONSTRAINT "InspectionReport_lifecycle_check";
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_lifecycle_check" CHECK (
  ("status" = 'DRAFT' AND "finalizedAt" IS NULL AND "finalizedByInspectorId" IS NULL
    AND "finalizedInspectorNameSnapshot" IS NULL AND "finalizedInspectorSurnameSnapshot" IS NULL
    AND "finalizedTeacherNameSnapshot" IS NULL AND "finalizedTeacherSurnameSnapshot" IS NULL
    AND "finalizedTeacherBirthDateSnapshot" IS NULL AND "finalizedTeacherPlaceOfBirthSnapshot" IS NULL
    AND "finalizedTeacherQualificationsSnapshot" IS NULL AND "finalizedDistrictNameSnapshot" IS NULL
    AND "finalizedInstitutionMunicipalitySnapshot" IS NULL)
  OR
  ("status" = 'FINAL' AND "finalizedAt" IS NOT NULL AND "finalizedByInspectorId" IS NOT NULL
    AND "finalizedInspectorNameSnapshot" IS NOT NULL AND "finalizedInspectorSurnameSnapshot" IS NOT NULL
    AND "finalizedTeacherNameSnapshot" IS NOT NULL AND "finalizedTeacherSurnameSnapshot" IS NOT NULL
    AND "levelClass" IS NOT NULL AND "lessonTopic" IS NOT NULL AND "inspectorConclusion" IS NOT NULL)
);

ALTER TABLE "InspectionReport"
  ADD CONSTRAINT "InspectionReport_educationDirectorateText_length_check" CHECK ("educationDirectorateText" IS NULL OR (char_length("educationDirectorateText") BETWEEN 1 AND 150 AND btrim("educationDirectorateText") <> '')),
  ADD CONSTRAINT "InspectionReport_administrativeDivisionText_length_check" CHECK ("administrativeDivisionText" IS NULL OR (char_length("administrativeDivisionText") BETWEEN 1 AND 150 AND btrim("administrativeDivisionText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherClassificationText_length_check" CHECK ("teacherClassificationText" IS NULL OR (char_length("teacherClassificationText") BETWEEN 1 AND 100 AND btrim("teacherClassificationText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherGradeText_length_check" CHECK ("teacherGradeText" IS NULL OR (char_length("teacherGradeText") BETWEEN 1 AND 100 AND btrim("teacherGradeText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherNationalityText_length_check" CHECK ("teacherNationalityText" IS NULL OR (char_length("teacherNationalityText") BETWEEN 1 AND 100 AND btrim("teacherNationalityText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherEffectiveDateText_length_check" CHECK ("teacherEffectiveDateText" IS NULL OR (char_length("teacherEffectiveDateText") BETWEEN 1 AND 100 AND btrim("teacherEffectiveDateText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherLastInspectionText_length_check" CHECK ("teacherLastInspectionText" IS NULL OR (char_length("teacherLastInspectionText") BETWEEN 1 AND 150 AND btrim("teacherLastInspectionText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherAppointmentText_length_check" CHECK ("teacherAppointmentText" IS NULL OR (char_length("teacherAppointmentText") BETWEEN 1 AND 150 AND btrim("teacherAppointmentText") <> '')),
  ADD CONSTRAINT "InspectionReport_teacherProfessionalFrameworkText_length_check" CHECK ("teacherProfessionalFrameworkText" IS NULL OR (char_length("teacherProfessionalFrameworkText") BETWEEN 1 AND 100 AND btrim("teacherProfessionalFrameworkText") <> '')),
  ADD CONSTRAINT "InspectionReport_actualLessonDurationText_length_check" CHECK ("actualLessonDurationText" IS NULL OR (char_length("actualLessonDurationText") BETWEEN 1 AND 100 AND btrim("actualLessonDurationText") <> '')),
  ADD CONSTRAINT "InspectionReport_lessonObjective_length_check" CHECK ("lessonObjective" IS NULL OR (char_length("lessonObjective") BETWEEN 1 AND 200 AND btrim("lessonObjective") <> '')),
  ADD CONSTRAINT "InspectionReport_pedagogicalGuidanceText_length_check" CHECK ("pedagogicalGuidanceText" IS NULL OR (char_length("pedagogicalGuidanceText") BETWEEN 1 AND 4000 AND btrim("pedagogicalGuidanceText") <> '')),
  ADD CONSTRAINT "InspectionReport_practicalGuidanceText_length_check" CHECK ("practicalGuidanceText" IS NULL OR (char_length("practicalGuidanceText") BETWEEN 1 AND 4000 AND btrim("practicalGuidanceText") <> '')),
  ADD CONSTRAINT "InspectionReport_visitStrengthsText_length_check" CHECK ("visitStrengthsText" IS NULL OR (char_length("visitStrengthsText") BETWEEN 1 AND 4000 AND btrim("visitStrengthsText") <> '')),
  ADD CONSTRAINT "InspectionReport_visitImprovementAreasText_length_check" CHECK ("visitImprovementAreasText" IS NULL OR (char_length("visitImprovementAreasText") BETWEEN 1 AND 4000 AND btrim("visitImprovementAreasText") <> '')),
  ADD CONSTRAINT "InspectionReport_tenureConclusionText_length_check" CHECK ("tenureConclusionText" IS NULL OR (char_length("tenureConclusionText") BETWEEN 1 AND 4000 AND btrim("tenureConclusionText") <> '')),
  ADD CONSTRAINT "InspectionReport_generalAssessmentText_length_check" CHECK ("generalAssessmentText" IS NULL OR (char_length("generalAssessmentText") BETWEEN 1 AND 200 AND btrim("generalAssessmentText") <> '')),
  ADD CONSTRAINT "InspectionReport_markText_length_check" CHECK ("markText" IS NULL OR (char_length("markText") BETWEEN 1 AND 100 AND btrim("markText") <> '')),
  ADD CONSTRAINT "InspectionReport_markWordsText_length_check" CHECK ("markWordsText" IS NULL OR (char_length("markWordsText") BETWEEN 1 AND 200 AND btrim("markWordsText") <> '')),
  ADD CONSTRAINT "InspectionReport_finalizedTeacherPlaceOfBirthSnapshot_length_check" CHECK ("finalizedTeacherPlaceOfBirthSnapshot" IS NULL OR (char_length("finalizedTeacherPlaceOfBirthSnapshot") BETWEEN 1 AND 150 AND btrim("finalizedTeacherPlaceOfBirthSnapshot") <> '')),
  ADD CONSTRAINT "InspectionReport_finalizedTeacherQualificationsSnapshot_length_check" CHECK ("finalizedTeacherQualificationsSnapshot" IS NULL OR (char_length("finalizedTeacherQualificationsSnapshot") BETWEEN 1 AND 1000 AND btrim("finalizedTeacherQualificationsSnapshot") <> '')),
  ADD CONSTRAINT "InspectionReport_finalizedInstitutionMunicipalitySnapshot_length_check" CHECK ("finalizedInstitutionMunicipalitySnapshot" IS NULL OR (char_length("finalizedInstitutionMunicipalitySnapshot") BETWEEN 1 AND 150 AND btrim("finalizedInstitutionMunicipalitySnapshot") <> ''));

CREATE TABLE "InspectionReportObservation" (
  "id" UUID NOT NULL,
  "reportId" UUID NOT NULL,
  "reportType" TEXT NOT NULL DEFAULT 'INSPECTOR_VISIT',
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "criterionKey" TEXT NOT NULL,
  "valueText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InspectionReportObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InspectionReportObservation_template_check" CHECK (
    "reportType" = 'INSPECTOR_VISIT' AND "templateVersion" = 1 AND "criterionKey" IN (
      'field_planning', 'field_ground', 'field_location', 'field_safety',
      'educational_unit_preparation', 'annual_distribution_present_respected', 'annual_official_guidance',
      'educational_unit_lesson', 'learning_progression', 'class_grouping', 'sports_attire',
      'space_resources_use', 'lesson_application_present', 'lesson_application_appropriate',
      'explanation_presentation', 'correction_guidance', 'organization_discipline',
      'participation_activation', 'student_participation', 'teaching_resources',
      'daily_notebook_use', 'absences_monitored', 'absences_recorded'
    )
  ),
  CONSTRAINT "InspectionReportObservation_valueText_check" CHECK (
    char_length("valueText") BETWEEN 1 AND 200 AND btrim("valueText") <> ''
  ),
  CONSTRAINT "InspectionReportObservation_reportId_criterionKey_key" UNIQUE ("reportId", "criterionKey"),
  CONSTRAINT "InspectionReportObservation_reportId_reportType_templateVersion_fkey"
    FOREIGN KEY ("reportId", "reportType", "templateVersion")
    REFERENCES "InspectionReport"("id", "reportType", "templateVersion") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "InspectionReportObservation_reportId_reportType_templateVersion_idx"
  ON "InspectionReportObservation"("reportId", "reportType", "templateVersion");

ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_v1_promotion_mark_check" CHECK (
  "reportType" <> 'INSPECTOR_VISIT' OR "pedagogicalMark" IS NULL
  OR ("markText" IS NULL AND "markWordsText" IS NULL)
);
