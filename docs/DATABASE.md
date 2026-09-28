# Database v0.1

تصميم منطقي؛ لا migrations في هذه المرحلة. PostgreSQL/Prisma وفق [ARCHITECTURE](ARCHITECTURE.md). `id` UUID، `createdAt/updatedAt` وFKs مسماة لكل سجل قابل للتعديل. تواريخ الأحداث UTC، اليوم الدراسي/الساعة محليان وفق منطقة الموقع. أسماء الحقول التالية عقود مبدئية، وليست استمارة رسمية.

## الكيانات (24 أساسية)

| مجموعة | كيان | حقول/علاقات أساسية وحدود |
|---|---|---|
| Identity | Inspector | email unique، passwordHash، status؛ ليس Teacher |
| Identity | District | name، externalCode اختياري؛ لا افتراض مقاطعة واحدة |
| Identity | InspectorDistrictMembership | inspectorId/districtId، role، validFrom/validTo؛ نطاق وصول قابل للتغيير تاريخيًا |
| Intake | TeacherSubmission | districtId، submittedProfile snapshot، status `PENDING/ACCEPTED/REJECTED/INTERNAL_REVIEW`، submittedAt، decidedAt/by، acceptedTeacherId nullable؛ لا حقول login؛ الإدخال غير الموثوق محدود |
| Core | Teacher | districtId للنطاق الإداري الحالي، name، surname، birthDate/place اختياري، phone/email اختياري، professionalStatus اختياري، employedAt/confirmedAt اختياري، qualifications/professional notes بعد مراجعة الحقول، recordStatus، archivedAt؛ لا password ولا schoolId وحيد |
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
| Audit | AuditLog | actorInspectorId nullable، districtId، action، entityType/id، occurredAt، requestId، minimal before/after metadata؛ append-only، لا نسخ أسرار/ملفات |
| Identity | Session | inspectorId، tokenHash، expiresAt، revokedAt، createdAt؛ server-side revocation |

العدد 24 يشمل foundations مؤجلة التنفيذ وفق الخطة، ولا يعني إنشاء كل الجداول في migration واحدة. `WeeklySchedule` و`WeeklySlot` منفصلان؛ `TeacherInstitutionAssignment` هو علاقة الأستاذ بالمؤسسات. `ProposalRevision` يحفظ نسخ المقترحات الأربع ولا يربط Memo بـVisit/Report. `CurriculumItem` يثبت فقط taxonomy عالية المستوى؛ لا تُحمّل بيانات رسمية بلا مصدر موثق.

## قيود وفهارس

- قبول الطلب مع إنشاء Teacher وربطه وتسجيل AuditLog في transaction واحدة؛ الانتقال مسموح من `PENDING/INTERNAL_REVIEW` فقط، مع optimistic concurrency أو conditional update. `acceptedTeacherId` فريد حيث غير null؛ لا merge آلي. كشف التكرار يرشح الاسم وتاريخ الميلاد/الهاتف بعد تطبيع محدود ويعرض النتيجة للمفتش دون قرار تلقائي.
- FK teacher/institution/inspector/district يفرض نطاقًا منسجمًا عبر service transaction؛ لا تعتمد على FK وحدها لمنع عبور المقاطعات. تغيير المقاطعة يحتاج إجراء موثق لاحقًا. الأرشفة لا تمحو الزيارات والإسنادات.
- `weeklyWorkloadMinutes >= 0`؛ `validTo > validFrom` عندما يوجد؛ يُمنع أكثر من MAIN فعّال لنفس الأستاذ والفترة عبر تحقق معاملات + PostgreSQL exclusion constraint عند تحديد دلالة التداخل. لا يُفرض إجمالي نصاب رسمي غير مؤكد. إجمالي النصاب = مجموع دقائق الإسنادات الفعالة في تاريخ محدد.
- `WeeklySlot` يتطلب `startMinute < endMinute` و0..1439، weekday مضبوط محليًا، assignment لنفس teacher وصالح عند فترة الجدول؛ منع تداخل حصص الأستاذ للفترة النشطة في service مع transaction وقيد DB مناسب بعد حسم دقة فترات الجداول. السنة الدراسية نص مقيّد تنسيقيًا فقط حتى اعتماد تقويم رسمي.
- فهارس: Submission(districtId,status,submittedAt)، Teacher(districtId,surname,name,status)، Institution(districtId,name)، Assignment(teacherId,validFrom,validTo)/(institutionId,validFrom)، Schedule(teacherId,academicYear)، Slot(weekday,startMinute,endMinute)/(assignmentId)، Visit(teacherId,occurredAt)/(inspectorId,scheduledAt)، FollowUp(ownerInspectorId,status,dueAt)، Proposal(inspectorId,kind,status)، AuditLog(districtId,occurredAt). البحث النصي المتقدم يبدأ بـPostgres normalized columns/trigram بعد قياس؛ لا Elasticsearch مبكرًا.

## سياسة التاريخ والهجرات

يحفظ القرار والزيارات والتقارير النهائية والمراجعات وسجل التدقيق؛ أرشفة Teacher/Institution/Proposal بدل الحذف المعتاد. عدم تغيير revision منشورة؛ نسخ المقترح يُنشئ proposal جديدًا ذا sourceRevision اختياري. migrations صغيرة بإستراتيجية expand/backfill/contract، مراجعة SQL والقيم الافتراضية والفهارس، backup قبل الإنتاج، تحقق rollback أو خطة forward fix؛ التنفيذ خارج طلب المعمارية. سياسة الاحتفاظ والحذف القانوني [OPEN](DECISIONS.md).
