# Database v0.1

تصميم منطقي؛ لا migrations في هذه المرحلة. PostgreSQL/Prisma وفق [ARCHITECTURE](ARCHITECTURE.md). `id` UUID، `createdAt/updatedAt` وFKs مسماة لكل سجل قابل للتعديل. تواريخ الأحداث UTC، اليوم الدراسي/الساعة محليان وفق منطقة الموقع. أسماء الحقول التالية عقود مبدئية، وليست استمارة رسمية.

## الكيانات (24 أساسية)

| مجموعة | كيان | حقول/علاقات أساسية وحدود |
|---|---|---|
| Identity | Inspector | email unique، passwordHash، status؛ ليس Teacher |
| Identity | District | name، externalCode اختياري؛ لا افتراض مقاطعة واحدة |
| Identity | InspectorDistrictMembership | inspectorId/districtId، role، validFrom/validTo؛ نطاق وصول قابل للتغيير تاريخيًا |
| Intake | TeacherSubmission | `districtId` FK من رابط المقاطعة؛ `submittedProfile` snapshot غير متحقق يحفظ حقول الأستاذ المطلوبة `firstName/lastName/dateOfBirth/placeOfBirth/phone/email/professionalStatus/employmentDate` والاختيارية `confirmationDate/qualifications/notes`، و`primaryInstitutionName` المطلوب و`additionalInstitutionNames` الاختيارية كنصوص معلنة فقط؛ status يبدأ `PENDING` ثم `ACCEPTED/REJECTED/INTERNAL_REVIEW`، submittedAt، decidedAt/by لآخر إجراء انتقال مسموح، acceptedTeacherId nullable عند القبول فقط؛ لا login أو Institution/Assignment/AuditLog من public POST؛ حدود JSON والتحقق في API_CONTRACTS، وسياسة ADR-015/ADR-026 |
| Core | Teacher | سجل مهني حالي يُنشأ عند قبول TeacherSubmission فقط؛ عقد الحقول الفيزيائي وربط المصدر أدناه؛ لا password أو notes أو schoolId وحيد |
| Core | Institution | districtId، name، externalCode اختياري، archivedAt |
| Core | TeacherInstitutionAssignment | teacherId/institutionId، kind `MAIN/SECONDARY`، weeklyWorkloadMinutes، validFrom/validTo، status؛ تاريخ لا يُستبدل |
| Core | ProfessionalHistory | teacherId، eventType، effectiveAt، previous/new value محدود بالحدث، recordedBy؛ يُفعّل فقط حين تتضح الحالات؛ لا بديل عن AuditLog |
| Schedule | WeeklySchedule | teacherId، academicYear، revision/status، validFrom/validTo؛ نسخة قابلة للتاريخ |
| Schedule | WeeklySlot | scheduleId، assignmentId، weekday، startMinute/endMinute، level/group label اختياري، notes؛ institution من assignment |
| Visit | PedagogicalVisit | inspectorId/teacherId/institutionId، scheduledAt، occurredAt، status، سياق حصة وصفي محدود؛ لا شبكة تقييم |
| Visit | InspectionReport | visitId unique، templateVersion nullable، status، narrative/recommendations structure مبدئي، finalizedAt، immutable final snapshot؛ يتطور عند وصول النموذج |
| Visit | FollowUp | reportId/teacherId، ownerInspectorId، dueAt، status، note، completedAt؛ توصية قابلة للمتابعة |
| Training | TrainingEvent | districtId، type/title/date، status؛ foundation فقط |
| Training | TrainingParticipation | eventId/teacherId، participationStatus nullable؛ تفاصيل الحضور مؤجلة |
| Reference | CurriculumSource | title، sourceUri، authorityLabel، verifiedAt/by، versionLabel؛ لا مادة official بلا provenance |
| Reference | CurriculumItem | sourceId، kind `LEVEL/DOMAIN/COMPETENCY/OBJECTIVE/RESOURCE`، parentId nullable، label، ordering؛ hierarchy مرجعي، لا حقول رسمية مفترضة |
| Proposals | InspectorProposal | inspectorId، districtId، kind `LEARNING_SECTION/ANNUAL_PLAN/ANNUAL_DISTRIBUTION/LESSON_MEMO_TEMPLATE`، title، status، basedOnSourceId nullable، archivedAt؛ `origin=INSPECTOR_PROPOSAL` ثابت |
| Proposals | ProposalRevision | proposalId، revisionNumber، content schema version، content JSON مُتحقق النوع حسب kind، createdBy/At، immutable؛ JSON مبرر لتباين الوثائق غير المحسوم، metadata/ownership ليست JSON |
| Proposals | ProposalReferenceLink | proposalId، curriculumItemId، relation؛ المرجع لا يُعدل عبر المقترح |
| Files | DocumentAsset | ownerKind/ownerId (allowlist وفحص service)، storageKey، MIME، size، checksum، accessClass، createdAt؛ metadata فقط، محتوى خاص خارج DB |
| Files | DocumentExport | sourceKind/sourceId، sourceRevision، format، assetId nullable، generatedAt؛ اختياري عندما يُحفظ export فعليًا |
| Audit | AuditLog | id UUID، actorInspectorId UUID nullable، districtId UUID nullable، action String، entityType String/entityId UUID، occurredAt DateTime default insertion، requestId UUID nullable، metadata JSON nullable بمخطط الحدث؛ بلا createdAt/updatedAt؛ append-only عبر الخدمة وفق ADR-025 |
| Identity | Session | inspectorId، tokenHash، expiresAt، revokedAt، createdAt؛ server-side revocation |

سياسة Institution: `archivedAt = NULL` تعني نشطة، وغير NULL تعني مؤرشفة. قوائم TASK-023 الافتراضية تستبعد المؤرشفة (بما في ذلك البحث والحساب)، مع إبقاء السجل والعلاقات. التفاصيل في [ADR-024](DECISIONS.md#adr-024--institution-archive-list-policy).

العدد 24 يشمل foundations مؤجلة التنفيذ وفق الخطة، ولا يعني إنشاء كل الجداول في migration واحدة. `WeeklySchedule` و`WeeklySlot` منفصلان؛ `TeacherInstitutionAssignment` هو علاقة الأستاذ بالمؤسسات. `ProposalRevision` يحفظ نسخ المقترحات الأربع ولا يربط Memo بـVisit/Report. `CurriculumItem` يثبت فقط taxonomy عالية المستوى؛ لا تُحمّل بيانات رسمية بلا مصدر موثق.

## Teacher physical contract for TASK-034

`TeacherSubmission.submittedProfile` هو snapshot تاريخي للتصريحات؛ `Teacher` سجل مهني حالي يديره المفتش، لا User. أنواع `Date` أدناه تواريخ تقويمية PostgreSQL (`@db.Date`)، لا timestamps. تنشأ القيم بعد قبول الطلب فقط؛ لا يغير ذلك إلزامية حقول الاستمارة العامة أو تحقق TASK-030. الحقول الاختيارية في Teacher مقصودة لدعم تصحيح/استيراد إداري مستقبلي، مع أن الطلب المقبول الجديد يملأ كل حقوله العامة المطلوبة.

| Field | Physical type / nullability | Initial source / rule |
|---|---|---|
| `id` | UUID PK، non-null | generated |
| `districtId` | UUID FK، non-null | `TeacherSubmission.districtId` بعد تحقق نطاق المفتش؛ لا client input |
| `name` | String، non-null | `submittedProfile.firstName` |
| `surname` | String، non-null | `submittedProfile.lastName` |
| `birthDate` | Date، nullable | `submittedProfile.dateOfBirth` |
| `placeOfBirth` | String، nullable | `submittedProfile.placeOfBirth` |
| `phone` | String، nullable | `submittedProfile.phone` المعياري |
| `email` | String، nullable | `submittedProfile.email` المطبّع |
| `professionalStatus` | String، nullable | `submittedProfile.professionalStatus`؛ `PERMANENT/TRAINEE/CONTRACT/TEMPORARY_CONTRACT` فقط، بلا PostgreSQL enum |
| `employedAt` | Date، nullable | `submittedProfile.employmentDate` |
| `confirmedAt` | Date، nullable | `submittedProfile.confirmationDate ?? NULL` |
| `qualifications` | String، nullable | `submittedProfile.qualifications ?? NULL`؛ نص في السجل المهني الحالي |
| `recordStatus` | String، non-null | `ACTIVE` عند القبول؛ `ACTIVE/INACTIVE` فقط في MVP، مستقل عن حالة الطلب والصفة المهنية |
| `archivedAt` | DateTime، nullable | NULL؛ لا archive workflow في TASK-034 |
| `createdAt` | DateTime، non-null | default `now()` |
| `updatedAt` | DateTime، non-null | تحديث تلقائي وفق Prisma |

لا تُنسخ `submittedProfile.notes` أو `primaryInstitutionName` أو `additionalInstitutionNames` أو `submittedAt` أو receipt أو decision metadata إلى Teacher؛ تبقى في submission للرجوع التاريخي. لا `Teacher.notes/sourceSubmissionId/institutionId/schoolId/assignmentId` أو workload/schedule/visit/account fields. TASK-035 قد يعرض أسماء المؤسسات المعلنة كسياق قراءة فقط باتباع رابط المصدر؛ لا تتحول إلى علاقات Institution/Assignment حتى TASK-040/041.

الرابط الفيزيائي الوحيد للمصدر `TeacherSubmission.acceptedTeacherId → Teacher.id`، nullable قبل القبول و`UNIQUE` عند وجوده وFK بـ`onDelete: Restrict, onUpdate: Cascade`؛ يجوز inverse Prisma relation بلا عمود ثان. `Teacher.districtId → District.id` بـ`onDelete: Restrict, onUpdate: Cascade`. لا PII uniqueness على الهاتف أو البريد أو الاسم/تاريخ الميلاد. لا hard-delete workflow؛ ADR-014 OPEN. فهرس Teacher لنطاق القراءة `(districtId,surname,name,recordStatus)`؛ الفهارس الإضافية حسب حاجة مقاسة.

TASK-035 يقرأ ويعدّل حقول Teacher الحالية فقط وفق [عقد الملف](API_CONTRACTS.md#teacher-profile-task-035)؛ لا عمود أو migration جديد. يبقى snapshot وقرار TeacherSubmission ثابتين، وتُستمد أسماء المؤسسات المعلنة في read model من علاقة `acceptedSubmission` العكسية فقط دون نسخها إلى Teacher أو اعتمادها. `recordStatus/archivedAt/districtId` للقراءة فقط؛ حدث تحديث الملف في ADR-028، لا ProfessionalHistory أو ملف ملاحظات جديد.

## قيود وفهارس

- قرارات TeacherSubmission تتبع مصفوفة [ADR-026](DECISIONS.md#adr-026--teacher-submission-decision-workflow): `PENDING → ACCEPTED/REJECTED/INTERNAL_REVIEW` و`INTERNAL_REVIEW → ACCEPTED/REJECTED` فقط؛ الحالات النهائية لا يعاد فتحها. `decidedAt/decidedByInspectorId` يسجلان آخر إجراء انتقال، بما فيه INTERNAL_REVIEW، ولا يقتصران على القرار النهائي؛ `acceptedTeacherId` يضبط للقبول فقط وفريد حيث غير NULL. القبول ينشئ Teacher واحدًا ويحدّث الطلب ويضيف AuditLog في transaction واحدة؛ الرفض/الإحالة لا ينشئان Teacher، ولكل قرار AuditLog في المعاملة. تستخدم optimistic concurrency أو conditional update؛ لا merge آلي ولا إنشاء Institution/Assignment من التصريحات.
- ضمان السباق في TASK-034: `expectedStatus` إلزامي، ويُطالب بالانتقال ذريًا داخل transaction وفق آلية متوافقة مع PostgreSQL/Prisma؛ تنجح محاولة واحدة على الأكثر، والخاسرة `409` بلا Teacher أو AuditLog قرار إضافيين. إعادة ACCEPT بعد القبول `409`، لا replay ولا idempotency-key storage. تفاصيل ADR-027.
- TeacherSubmission في TASK-030 يحتاج FK إلى District وفهرس `(districtId,status,submittedAt)`؛ يبقى snapshot تصريحًا مستقلًا لكل POST، حتى عند إعادة الإرسال. تُفرض الحقول المطلوبة والحالة `PENDING` عند الإنشاء، ولا تُنشأ علاقات إلى Institution من أسماء المؤسسات المعلنة. تتحقق حدود الأطوال والصيغ وبنية قائمة الأسماء عبر Zod؛ لا تعقيد PostgreSQL إضافي لهذه الصيغ دون حاجة مثبتة.
- TASK-032 يحسب المرشحين عند القراءة من TeacherSubmission أخرى في District الطلب، بحالتي `PENDING/INTERNAL_REVIEW` فقط مع استبعاد الطلب الحالي و`REJECTED/ACCEPTED`؛ لا جدول أو علاقة أو حقل مرشحين مخزن، ولا migration أو فهرس جديد. يكفي الفهرس `(districtId,status,submittedAt)` لحجم MVP الحالي، وتُراجع الحاجة بعد قياس الأداء. بعد TASK-034 يكون Teacher تمثيل المقبولين المعتمد؛ مقارنته فعليًا بالطلبات مؤجلة إلى مهمة ذات عقد قراءة مستقل، ولا يُعرض الطلب المقبول وTeacher الناتج كمرشحين منفصلين.
- FK teacher/institution/inspector/district يفرض نطاقًا منسجمًا عبر service transaction؛ لا تعتمد على FK وحدها لمنع عبور المقاطعات. تغيير المقاطعة يحتاج إجراء موثق لاحقًا. الأرشفة لا تمحو الزيارات والإسنادات.
- `InspectorDistrictMembership` تاريخي؛ `validFrom` إلزامي و`validTo = NULL` فترة مفتوحة. إن وُجد `validTo` فيجوز أن يساوي `validFrom` ولا يجوز أن يسبقه. الفترات نصف مفتوحة `[validFrom, validTo)`، ويمنع PostgreSQL تداخل فترتين للـ`inspectorId + districtId` نفسيهما بقيد exclusion زمني. يسمح بتعدد السجلات التاريخية ولا يوجد unique للزوج؛ إغلاق التكليف بتعيين `validTo`، ولا يمنع membership لمقاطعات مختلفة بالتوازي. التفاصيل المعتمدة في [ADR-023](DECISIONS.md#adr-023--inspector--district-membership-policy).
- `weeklyWorkloadMinutes >= 0`؛ في TeacherInstitutionAssignment يكون `validTo > validFrom` عندما يوجد؛ يُمنع أكثر من MAIN فعّال لنفس الأستاذ والفترة عبر تحقق معاملات + PostgreSQL exclusion constraint عند تحديد دلالة التداخل. لا يُفرض إجمالي نصاب رسمي غير مؤكد. إجمالي النصاب = مجموع دقائق الإسنادات الفعالة في تاريخ محدد.
- `WeeklySlot` يتطلب `startMinute < endMinute` و0..1439، weekday مضبوط محليًا، assignment لنفس teacher وصالح عند فترة الجدول؛ منع تداخل حصص الأستاذ للفترة النشطة في service مع transaction وقيد DB مناسب بعد حسم دقة فترات الجداول. السنة الدراسية نص مقيّد تنسيقيًا فقط حتى اعتماد تقويم رسمي.
- فهارس: Submission(districtId,status,submittedAt)، Teacher(districtId,surname,name,recordStatus)، Institution(districtId,name)، Assignment(teacherId,validFrom,validTo)/(institutionId,validFrom)، Schedule(teacherId,academicYear)، Slot(weekday,startMinute,endMinute)/(assignmentId)، Visit(teacherId,occurredAt)/(inspectorId,scheduledAt)، FollowUp(ownerInspectorId,status,dueAt)، Proposal(inspectorId,kind,status)، AuditLog(districtId,occurredAt). البحث النصي المتقدم يبدأ بـPostgres normalized columns/trigram بعد قياس؛ لا Elasticsearch مبكرًا.
- AuditLog: FK اختيارية إلى Inspector/District بـ`onDelete: Restrict` و`onUpdate: Cascade`. `entityType/entityId` مرجع منطقي بلا FK إلى المورد. يُستمد district من المورد بعد authorization؛ الأحداث المقاطعية تتطلبه. metadata ذات allowlist لكل حدث بلا نسخ بيانات شخصية أو أسرار أو request bodies. لا update/delete في خدمة append؛ لا ضمان immutability على مستوى DB. التفاصيل في [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

## سياسة التاريخ والهجرات

يحفظ القرار والزيارات والتقارير النهائية والمراجعات وسجل التدقيق؛ أرشفة Teacher/Institution/Proposal بدل الحذف المعتاد. عدم تغيير revision منشورة؛ نسخ المقترح يُنشئ proposal جديدًا ذا sourceRevision اختياري. migrations صغيرة بإستراتيجية expand/backfill/contract، مراجعة SQL والقيم الافتراضية والفهارس، backup قبل الإنتاج، تحقق rollback أو خطة forward fix؛ التنفيذ خارج طلب المعمارية. سياسة الاحتفاظ والحذف القانوني [OPEN](DECISIONS.md).
