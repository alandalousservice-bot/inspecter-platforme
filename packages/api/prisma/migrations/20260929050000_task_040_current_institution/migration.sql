ALTER TABLE "Institution"
ADD COLUMN "municipality" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "directorPhone" TEXT;

ALTER TABLE "Teacher"
ADD COLUMN "institutionId" UUID;

CREATE UNIQUE INDEX "Institution_id_districtId_key"
ON "Institution"("id", "districtId");

CREATE INDEX "Teacher_institutionId_idx"
ON "Teacher"("institutionId");

ALTER TABLE "Teacher"
ADD CONSTRAINT "Teacher_institutionId_districtId_fkey"
FOREIGN KEY ("institutionId", "districtId")
REFERENCES "Institution"("id", "districtId")
ON DELETE RESTRICT ON UPDATE CASCADE;
