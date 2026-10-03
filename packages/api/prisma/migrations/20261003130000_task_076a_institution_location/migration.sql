ALTER TABLE "Institution"
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "locationSource" VARCHAR(32);

ALTER TABLE "Institution"
  ADD CONSTRAINT "Institution_latitude_range_check"
    CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90)),
  ADD CONSTRAINT "Institution_longitude_range_check"
    CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180)),
  ADD CONSTRAINT "Institution_location_pair_source_check"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL AND "locationSource" IS NULL)
      OR
      ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationSource" IS NOT NULL AND "locationSource" = 'MANUAL_INSPECTOR')
    );
