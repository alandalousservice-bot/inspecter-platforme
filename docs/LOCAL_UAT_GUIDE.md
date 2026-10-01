# LOCAL UAT Guide

## Purpose and safety

This is a persistent, synthetic local acceptance-testing environment. It is not production data and does not add product behavior. The only permitted database target is PostgreSQL at `127.0.0.1:55432`, database `task020_test`, user `task020_test_user`, schema `public`. The bootstrap refuses other targets and verifies the live SQL identity before migrations, seeding, and API startup. Never point these commands at port 5432, a remote host, or production.

## Prerequisites and database initialization

Start the existing isolated PostgreSQL cluster if needed; do not initialize a new cluster or delete its data directory. The repository reads the existing URL from `D:\pg-task020-temp\task020-test-url.secret` without displaying it. Initialize using only committed migrations:

```powershell
npm run local:uat:init
```

The command uses `prisma migrate deploy` and verifies that all 19 repository migrations are applied. It never uses `db push`. The seed is explicit and repeatable:

```powershell
npm run local:uat:seed
```

It uses stable synthetic IDs and create-if-absent upserts; a repeat does not overwrite manual edits. No database reset command is provided. Do not drop the public schema or remove UAT data through ad hoc SQL.

## Local inspector password

The synthetic account email is `local-uat-inspector@example.invalid`. Its password is stored only in the owner-only local file `D:\pg-task020-temp\local-uat-inspector-password.secret`; the repository never contains the value. On first seed, load the file into a transient process environment variable and run seed in that same PowerShell session without printing it:

```powershell
$env:LOCAL_UAT_INSPECTOR_PASSWORD = [IO.File]::ReadAllText('D:\pg-task020-temp\local-uat-inspector-password.secret')
npm run local:uat:seed
Remove-Item Env:LOCAL_UAT_INSPECTOR_PASSWORD
```

The file is created once with a cryptographically random value and owner-only ACL. Do not paste it into chat, shell output, repository files, or browser automation logs. If the file is missing, stop and arrange a deliberate local credential recovery; do not silently reset an existing inspector password.

## Start and access

Build and start the API in one terminal. The wrapper checks the database identity before starting the application:

```powershell
npm run build
npm run local:uat:api
```

In a second terminal start the web client:

```powershell
$env:API_PROXY_TARGET = 'http://127.0.0.1:3001'
npm run dev --workspace @inspector/web -- --host 127.0.0.1 --port 5173 --strictPort
```

Open [http://127.0.0.1:5173/login](http://127.0.0.1:5173/login) and sign in with the synthetic email and the password from the local-only secret file. API health is [http://127.0.0.1:3001/api/v1/health](http://127.0.0.1:3001/api/v1/health). Never use an already autofilled personal account for this UAT.

With both services running, `npm run local:uat:verify` checks the approved database identity, performs a real browser login, visits the authenticated routes and public intake form, then logs out. It does not start or stop services.

## Suggested test order

Automated database and connected browser tests use temporary schemas within the isolated local test database. They do not migrate, reset, seed, or clean the persistent `public` UAT schema.

1. Login and professional identity.
2. Institutions.
3. Teacher directory and profile.
4. Teacher Information Card and A4 print view.
5. Weekly Schedule.
6. Visits, Inspector Visit Report, and Follow-ups.
7. Pending public submission: inspect declarations separately from approved data, then review accept/reject workflow.
8. Submit a new Teacher through the public district form and return to inspector review.

The seed includes ten synthetic Teachers across all five supported professional statuses, active/archived Institutions, minimal and rich profiles, structured and legacy qualifications, supplementary workplaces, schedules, typed Visits, legacy and V1 Reports, Follow-ups, and PENDING/ACCEPTED/REJECTED submissions. Pending TASK-085 qualification/workplace declarations remain declaration-only and do not create authoritative Teacher relationships.

## Stop services

Stop the API and web terminal with `Ctrl+C`. Stop only the existing isolated PostgreSQL cluster using its configured `pg_ctl` data directory if it was started for this session. No reset/cleanup operation is part of the guide; persistent UAT rows are intentionally retained.
