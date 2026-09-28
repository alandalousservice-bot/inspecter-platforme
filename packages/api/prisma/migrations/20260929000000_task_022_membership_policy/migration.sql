CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "InspectorDistrictMembership"
ADD CONSTRAINT "InspectorDistrictMembership_validTo_not_before_validFrom"
CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "InspectorDistrictMembership"
ADD CONSTRAINT "InspectorDistrictMembership_no_overlapping_periods"
EXCLUDE USING GIST (
  "inspectorId" WITH =,
  "districtId" WITH =,
  tsrange("validFrom", "validTo", '[)') WITH &&
);
