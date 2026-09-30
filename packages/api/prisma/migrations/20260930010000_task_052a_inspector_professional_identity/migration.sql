ALTER TABLE "Inspector" ADD COLUMN "name" TEXT,
ADD COLUMN "surname" TEXT;

ALTER TABLE "Inspector" ADD CONSTRAINT "Inspector_professional_identity_pair_check"
CHECK (
  ("name" IS NULL AND "surname" IS NULL)
  OR (
    "name" IS NOT NULL AND "surname" IS NOT NULL
    AND length(btrim("name")) > 0
    AND length(btrim("surname")) > 0
    AND char_length("name") <= 100
    AND char_length("surname") <= 100
  )
);
