CREATE TABLE "WeeklySchedule" (
    "id" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "academicYear" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WeeklySchedule_academicYear_format_check" CHECK (
        CASE
            WHEN "academicYear" ~ '^[0-9]{4}-[0-9]{4}$'
            THEN substring("academicYear" FROM 6 FOR 4)::INTEGER = substring("academicYear" FROM 1 FOR 4)::INTEGER + 1
            ELSE FALSE
        END
    ),
    CONSTRAINT "WeeklySchedule_revision_positive_check" CHECK ("revision" >= 1)
);

CREATE UNIQUE INDEX "WeeklySchedule_teacherId_academicYear_key"
ON "WeeklySchedule"("teacherId", "academicYear");

CREATE TABLE "WeeklyScheduleSlot" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "levelLabel" TEXT,
    "groupLabel" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyScheduleSlot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WeeklyScheduleSlot_dayOfWeek_range_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
    CONSTRAINT "WeeklyScheduleSlot_minute_range_check" CHECK (
        "startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440
    ),
    CONSTRAINT "WeeklyScheduleSlot_levelLabel_length_check" CHECK (
        "levelLabel" IS NULL OR char_length("levelLabel") <= 100
    ),
    CONSTRAINT "WeeklyScheduleSlot_groupLabel_length_check" CHECK (
        "groupLabel" IS NULL OR char_length("groupLabel") <= 100
    ),
    CONSTRAINT "WeeklyScheduleSlot_notes_length_check" CHECK (
        "notes" IS NULL OR char_length("notes") <= 500
    )
);

CREATE INDEX "WeeklyScheduleSlot_scheduleId_dayOfWeek_startMinute_endMinute_idx"
ON "WeeklyScheduleSlot"("scheduleId", "dayOfWeek", "startMinute", "endMinute");

CREATE INDEX "WeeklyScheduleSlot_dayOfWeek_startMinute_idx"
ON "WeeklyScheduleSlot"("dayOfWeek", "startMinute");

ALTER TABLE "WeeklySchedule"
ADD CONSTRAINT "WeeklySchedule_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyScheduleSlot"
ADD CONSTRAINT "WeeklyScheduleSlot_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "WeeklySchedule"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WeeklyScheduleSlot"
ADD CONSTRAINT "WeeklyScheduleSlot_no_overlapping_same_day"
EXCLUDE USING GIST (
    "scheduleId" WITH =,
    "dayOfWeek" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
);
