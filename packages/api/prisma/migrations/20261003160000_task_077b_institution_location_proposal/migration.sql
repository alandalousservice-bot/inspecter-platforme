ALTER TABLE "TeacherSubmission"
  ADD COLUMN "proposedInstitutionLatitude" DECIMAL(9,6),
  ADD COLUMN "proposedInstitutionLongitude" DECIMAL(9,6),
  ADD COLUMN "locationProposalStatus" VARCHAR(16),
  ADD COLUMN "locationProposalDecidedAt" TIMESTAMP(3),
  ADD COLUMN "locationProposalDecidedByInspectorId" UUID,
  ADD COLUMN "locationProposalInstitutionId" UUID,
  ADD COLUMN "locationProposalDecisionReason" VARCHAR(32);

ALTER TABLE "TeacherSubmission"
  ADD CONSTRAINT "TeacherSubmission_location_proposal_latitude_check"
    CHECK ("proposedInstitutionLatitude" IS NULL OR "proposedInstitutionLatitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "TeacherSubmission_location_proposal_longitude_check"
    CHECK ("proposedInstitutionLongitude" IS NULL OR "proposedInstitutionLongitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "TeacherSubmission_location_proposal_state_check"
    CHECK (
      (
        "proposedInstitutionLatitude" IS NULL AND "proposedInstitutionLongitude" IS NULL
        AND "locationProposalStatus" IS NULL AND "locationProposalDecidedAt" IS NULL
        AND "locationProposalDecidedByInspectorId" IS NULL AND "locationProposalInstitutionId" IS NULL
        AND "locationProposalDecisionReason" IS NULL
      )
      OR
      (
        "proposedInstitutionLatitude" IS NOT NULL AND "proposedInstitutionLongitude" IS NOT NULL
        AND "locationProposalStatus" = 'PENDING' AND "locationProposalDecidedAt" IS NULL
        AND "locationProposalDecidedByInspectorId" IS NULL AND "locationProposalInstitutionId" IS NULL
        AND "locationProposalDecisionReason" IS NULL
      )
      OR
      (
        "proposedInstitutionLatitude" IS NOT NULL AND "proposedInstitutionLongitude" IS NOT NULL
        AND "locationProposalStatus" = 'ACCEPTED' AND "locationProposalDecidedAt" IS NOT NULL
        AND "locationProposalDecidedByInspectorId" IS NOT NULL AND "locationProposalInstitutionId" IS NOT NULL
        AND "locationProposalDecisionReason" IS NULL
      )
      OR
      (
        "proposedInstitutionLatitude" IS NOT NULL AND "proposedInstitutionLongitude" IS NOT NULL
        AND "locationProposalStatus" = 'REJECTED' AND "locationProposalDecidedAt" IS NOT NULL
        AND "locationProposalDecidedByInspectorId" IS NOT NULL
        AND (("locationProposalDecisionReason" IS NULL AND "locationProposalInstitutionId" IS NULL)
          OR ("locationProposalDecisionReason" = 'KEEP_CURRENT' AND "locationProposalInstitutionId" IS NOT NULL))
      )
    );

ALTER TABLE "TeacherSubmission"
  ADD CONSTRAINT "TeacherSubmission_location_proposal_decider_fkey"
    FOREIGN KEY ("locationProposalDecidedByInspectorId") REFERENCES "Inspector"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TeacherSubmission_location_proposal_institution_district_fkey"
    FOREIGN KEY ("locationProposalInstitutionId", "districtId") REFERENCES "Institution"("id", "districtId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "TeacherSubmission_districtId_locationProposalStatus_submittedAt_idx"
  ON "TeacherSubmission"("districtId", "locationProposalStatus", "submittedAt");

ALTER TABLE "Institution" DROP CONSTRAINT "Institution_location_pair_source_check";
ALTER TABLE "Institution"
  ADD CONSTRAINT "Institution_location_pair_source_check"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL AND "locationSource" IS NULL)
      OR
      ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationSource" IS NOT NULL
       AND "locationSource" IN ('MANUAL_INSPECTOR', 'TEACHER_PROPOSED_APPROVED'))
    );
