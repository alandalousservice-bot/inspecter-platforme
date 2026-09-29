# Database v0.1

تصميم منطقي؛ لا migrations في هذه المراجعة. PostgreSQL/Prisma وفق [ARCHITECTURE](ARCHITECTURE.md). `id` UUID، `createdAt/updatedAt` وFKs مسماة لكل سجل قابل للتعديل. تواريخ الأحداث UTC، واليوم/الساعة التشغيلية وفق `Africa/Algiers`. أسماء الحقول التالية عقود مبدئية، وليست استمارة رسمية.

## الكيانات (23 أساسية بعد ADR-029)

| مجموعة | كيان | حقول/علاقات أساسية وحدود |
|---|---|---|
| Identity | Inspector | email unique، passwordHash، status؛ ليس Teacher |
| Identity | District | name، externalCode اختياري؛ لا افتراض مقاطعة واحدة |
| Identity | InspectorDistrictMembership | inspectorId/districtId، role، validFrom/validTo؛ نطاق وصول قابل للتغيير تاريخيًا |
| Intake | TeacherSubmission | `districtId` FK من رابط المقاطعة؛ `submittedProfile` snapshot تاريخي غير متحقق. شكل G3 القديم يحفظ `primaryInstitutionName/additionalInstitutionNames`؛ شكل ما بعد TASK-041 يحفظ `workplace` لمؤسسة واحدة، دون تغيير snapshots القديمة. status يبدأ `PENDING` ثم `ACCEPTED/REJECTED/INTERNAL_REVIEW`، submittedAt وبيانات القرار وacceptedTeacherId؛ لا login أو Institution/Teacher أو ربط مؤسسة من public POST؛ ADR-015/ADR-029 |
| Core | Teacher | سجل مهني حالي يُنشأ عند قبول TeacherSubmission فقط؛ `institutionId` nullable من TASK-040 للمؤسسة الحالية المعتمدة الواحدة كحد أقصى؛ لا password أو notes أو علاقة مؤسسات متعددة |
| Core | Institution | districtId، name، externalCode اختياري، archivedAt؛ من TASK-040: municipality/address/directorPhone nullable للصفوف القائمة |
| Core | ProfessionalHistory | أساس مؤجل لأحداث مهنية أخرى عند وجود عقد؛ لا يُستخدم لنقل مؤسسة أو تاريخ علاقة Teacher بها، ولا يحل محل AuditLog |
| Schedule | WeeklySchedule | teacherId، academicYear، revision؛ جدول حالي واحد لكل Teacher وسنة، بلا status أو validFrom/validTo أو تاريخ نسخ |
| Schedule | WeeklyScheduleSlot | scheduleId، dayOfWeek، startMinute/endMinute، levelLabel/groupLabel/notes اختيارية؛ سياق المكان من مؤسسة Teacher الحالية المعتمدة، بلا institutionId أو assignmentId |
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

العدد 23 يشمل foundations مؤجلة التنفيذ وفق الخطة، ولا يعني إنشاء كل الجداول في migration واحدة. بعد [ADR-029](DECISIONS.md#adr-029--one-current-teacher-workplace-after-g3) لا جدول `TeacherInstitutionAssignment` في المستقبل؛ العلاقة الحالية هي FK مباشر nullable. `WeeklySchedule` و`WeeklyScheduleSlot` منفصلان وفق [ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract). `ProposalRevision` يحفظ نسخ المقترحات الأربع ولا يربط Memo بـVisit/Report. `CurriculumItem` يثبت فقط taxonomy عالية المستوى؛ لا تُحمّل بيانات رسمية بلا مصدر موثق.

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

لا تُنسخ `submittedProfile.notes` أو تصريح مكان العمل، سواء شكله القديم أو الجديد، أو `submittedAt` أو receipt أو decision metadata إلى Teacher؛ تبقى في submission للرجوع التاريخي. عند إنجاز TASK-034 لم يوجد `Teacher.institutionId`؛ ستضيفه TASK-040 nullable دون ضبطه عند `ACCEPT`. لا `Teacher.notes/sourceSubmissionId/schoolId/assignmentId` أو workload/schedule/visit/account fields. TASK-035 يعرض التصريح القديم كسياق قراءة فقط؛ قارئ الشكلين اللاحق موثق أدناه.

الرابط الفيزيائي الوحيد للمصدر `TeacherSubmission.acceptedTeacherId → Teacher.id`، nullable قبل القبول و`UNIQUE` عند وجوده وFK بـ`onDelete: Restrict, onUpdate: Cascade`؛ يجوز inverse Prisma relation بلا عمود ثان. `Teacher.districtId → District.id` بـ`onDelete: Restrict, onUpdate: Cascade`. لا PII uniqueness على الهاتف أو البريد أو الاسم/تاريخ الميلاد. لا hard-delete workflow؛ ADR-014 OPEN. فهرس Teacher لنطاق القراءة `(districtId,surname,name,recordStatus)`؛ الفهارس الإضافية حسب حاجة مقاسة.

TASK-035 يقرأ ويعدّل حقول Teacher الحالية فقط وفق [عقد الملف](API_CONTRACTS.md#teacher-profile-task-035)؛ لا عمود أو migration جديد. يبقى snapshot وقرار TeacherSubmission ثابتين، وتُستمد أسماء المؤسسات المعلنة في read model من علاقة `acceptedSubmission` العكسية فقط دون نسخها إلى Teacher أو اعتمادها. `recordStatus/archivedAt/districtId` للقراءة فقط؛ حدث تحديث الملف في ADR-028، لا ProfessionalHistory أو ملف ملاحظات جديد.

## Post-G3 current workplace contract (ADR-029)

تضيف TASK-040 إلى `Institution` أعمدة nullable: `municipality String?`, `address String?`, `directorPhone String?`؛ تصف المؤسسة نفسها لا الأستاذ. الاسم والمقاطعة والـtimestamps والأرشفة القائمة لا تتغير. الصفوف القديمة تبقى NULL، ولا backfill تخميني أو جدول بلديات. يحتفظ `TeacherSubmission.submittedProfile` بصيغته وقت الإرسال: صيغة G3 القديمة أو `workplace:{institutionName,municipality,institutionAddress,directorPhone}` للإرسالات الجديدة من TASK-041. لا تعديل جماعي لـJSON التاريخي ولا علاقة FK بين التصريح وInstitution.

تضيف TASK-040 إلى `Teacher` الحقل `institutionId UUID NULL`؛ NULL تعني «لم تُعتمد مؤسسة حالية بعد»، بما في ذلك كل Teachers الموجودين من G3 وTeacher الذي يُنشأ عند `ACCEPT` لاحقًا. عند عدم NULL يشير إلى مؤسسة حالية واحدة فقط؛ كثير من الأساتذة قد يرتبطون بالمؤسسة نفسها، فلا unique على `institutionId`. يضمن FK مركب `(institutionId,districtId) → Institution(id,districtId)` تطابق District على مستوى PostgreSQL، مع مفتاح مرجعي مركب على Institution وفهرس لعكس الاستعلام. يحظر حذف Institution مرتبطة أو تغيير مقاطعتها ضمن هذا الرابط؛ لا transfer history أو `MAIN/SECONDARY` أو workload/validity في العلاقة. يتحقق API أيضًا من عضوية المفتش الحالية، وأن Institution غير مؤرشفة، ومن الحالة المتوقعة للرابط داخل transaction؛ لا يسمح body بتغيير `Teacher.districtId` أو `Institution.districtId`.

إنشاء Institution وربط Teacher في تأكيد واحد عمليتان ذريتان مع أحداث AuditLog المطلوبة. اختيار مؤسسة قائمة لا ينسخ بيانات التصريح فوقها. تغيير الرابط يستبدل قيمة `institutionId` فقط بعد التحقق، ولا ينشئ صفًا تاريخيًا؛ قد يسجل AuditLog معرّف الرابط السابق والجديد دون بيانات شخصية. `WeeklySchedule` لاحق ومستقل، و`WeeklyScheduleSlot` يرتبط بالجدول/Teacher لا بـAssignment. لا migration لـProfessionalHistory أو جدول مكان عمل مستقل لهذا القرار.

## Weekly Schedule persistence contract (ADR-030 / TASK-047)

`WeeklySchedule`: `id UUID PK`, `teacherId UUID NOT NULL` FK إلى Teacher (`onDelete: Restrict`, `onUpdate: Cascade`)، `academicYear String NOT NULL` بصيغة `YYYY-YYYY` وسنة النهاية = البداية + 1، `revision Int NOT NULL DEFAULT 1` مع `revision >= 1`، و`createdAt/updatedAt`؛ `UNIQUE(teacherId,academicYear)` يضمن جدولًا حاليًا واحدًا على الأكثر للسنة. لا status أو validFrom/validTo أو سجل نسخ. يتحقق التطبيق من شكل السنة ويؤكده قيد DB، ولا تُعدل السنة في مسار تحرير slots.

`WeeklyScheduleSlot`: `id UUID PK`, `scheduleId UUID NOT NULL` FK إلى WeeklySchedule (`onDelete: Restrict`, `onUpdate: Cascade`)، `dayOfWeek Int NOT NULL` من 1 الاثنين إلى 7 الأحد، `startMinute/endMinute Int NOT NULL` مع `0 <= startMinute < endMinute <= 1440`، `levelLabel String?`, `groupLabel String?`, `notes String?`، و`createdAt/updatedAt`. القيم الاختيارية غير الفارغة بعد trim وUnicode NFC واختزال فراغات العرض؛ محارف التحكم مرفوضة؛ الحدود بعد التنظيف Unicode code points 100/100/500 على الترتيب. لا curriculum FK أو institutionId أو assignmentId أو timezone/تاريخ لكل slot؛ سياق المؤسسة في العرض من Teacher الحالي. حدود النص تطبقها طبقة التحقق، ولا يفترض قيد SQL لأطوال Unicode.

يمنع قيد PostgreSQL GiST exclusion تداخل `(scheduleId,dayOfWeek,int4range(startMinute,endMinute,'[)'))` لنفس الجدول واليوم؛ `[)` يسمح بتجاور نهاية slot وبداية التالي. `btree_gist` مثبتة في سلسلة migrations منذ TASK-022؛ هجرة TASK-047 forward-only مستقلة، مع تحقق clean+upgrade. الفهارس: unique `(teacherId,academicYear)`، وفهرس slot `(scheduleId,dayOfWeek,startMinute,endMinute)` للقراءة، إلى جانب exclusion للسلامة؛ تفحص خطة الاستعلام قبل أي فهرس زائد. لا مؤسسة لازمة لكل slot في DB؛ TASK-048 تمنع mutation عندما `Teacher.institutionId=NULL`.

## قيود وفهارس

- قرارات TeacherSubmission تتبع مصفوفة [ADR-026](DECISIONS.md#adr-026--teacher-submission-decision-workflow): `PENDING → ACCEPTED/REJECTED/INTERNAL_REVIEW` و`INTERNAL_REVIEW → ACCEPTED/REJECTED` فقط؛ الحالات النهائية لا يعاد فتحها. `decidedAt/decidedByInspectorId` يسجلان آخر إجراء انتقال، بما فيه INTERNAL_REVIEW، ولا يقتصران على القرار النهائي؛ `acceptedTeacherId` يضبط للقبول فقط وفريد حيث غير NULL. القبول ينشئ Teacher واحدًا ويحدّث الطلب ويضيف AuditLog في transaction واحدة؛ الرفض/الإحالة لا ينشئان Teacher، ولكل قرار AuditLog في المعاملة. تستخدم optimistic concurrency أو conditional update؛ لا merge آلي ولا إنشاء Institution/Assignment من التصريحات.
- ضمان السباق في TASK-034: `expectedStatus` إلزامي، ويُطالب بالانتقال ذريًا داخل transaction وفق آلية متوافقة مع PostgreSQL/Prisma؛ تنجح محاولة واحدة على الأكثر، والخاسرة `409` بلا Teacher أو AuditLog قرار إضافيين. إعادة ACCEPT بعد القبول `409`، لا replay ولا idempotency-key storage. تفاصيل ADR-027.
- TeacherSubmission في TASK-030 يحتاج FK إلى District وفهرس `(districtId,status,submittedAt)`؛ يبقى snapshot تصريحًا مستقلًا لكل POST، حتى عند إعادة الإرسال. تُفرض الحقول المطلوبة والحالة `PENDING` عند الإنشاء، ولا تُنشأ علاقات إلى Institution من أسماء المؤسسات المعلنة. تتحقق حدود الأطوال والصيغ وبنية قائمة الأسماء عبر Zod؛ لا تعقيد PostgreSQL إضافي لهذه الصيغ دون حاجة مثبتة.
- TASK-032 يحسب المرشحين عند القراءة من TeacherSubmission أخرى في District الطلب، بحالتي `PENDING/INTERNAL_REVIEW` فقط مع استبعاد الطلب الحالي و`REJECTED/ACCEPTED`؛ لا جدول أو علاقة أو حقل مرشحين مخزن، ولا migration أو فهرس جديد. يكفي الفهرس `(districtId,status,submittedAt)` لحجم MVP الحالي، وتُراجع الحاجة بعد قياس الأداء. بعد TASK-034 يكون Teacher تمثيل المقبولين المعتمد؛ مقارنته فعليًا بالطلبات مؤجلة إلى مهمة ذات عقد قراءة مستقل، ولا يُعرض الطلب المقبول وTeacher الناتج كمرشحين منفصلين.
- FK المركب الجديد يفرض تساوي District بين Teacher وInstitution عند الربط؛ تظل عضوية المفتش ونطاق الوصول والتحقق من الأرشفة مسؤولية service داخل transaction. تغيير مقاطعة Teacher أو Institution ليس جزءًا من هذا المسار؛ ADR-017 مستقل. الأرشفة لا تمحو الزيارات، والمؤسسة المرتبطة لا تُحذف حذفًا صلبًا.
- `InspectorDistrictMembership` تاريخي؛ `validFrom` إلزامي و`validTo = NULL` فترة مفتوحة. إن وُجد `validTo` فيجوز أن يساوي `validFrom` ولا يجوز أن يسبقه. الفترات نصف مفتوحة `[validFrom, validTo)`، ويمنع PostgreSQL تداخل فترتين للـ`inspectorId + districtId` نفسيهما بقيد exclusion زمني. يسمح بتعدد السجلات التاريخية ولا يوجد unique للزوج؛ إغلاق التكليف بتعيين `validTo`، ولا يمنع membership لمقاطعات مختلفة بالتوازي. التفاصيل المعتمدة في [ADR-023](DECISIONS.md#adr-023--inspector--district-membership-policy).
- لا حقل نصاب أسبوعي في علاقة Teacher بالمؤسسة. إذا لزم حساب النصاب لاحقًا فيُشتق من `WeeklyScheduleSlot` وفق ADR-030 بعد تحديد قواعده؛ لا حد نصاب رسمي مفترض في TASK-040.
- `WeeklyScheduleSlot` يتبع قيود [ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract): اليوم 1..7، والدقائق `0 <= startMinute < endMinute <= 1440`، وعدم التداخل داخل الجدول واليوم مع السماح بالتجاور. لا ينشأ Slot في TASK-040.
- فهارس: Submission(districtId,status,submittedAt)، Teacher(districtId,surname,name,recordStatus) و(institutionId) عند إضافة الرابط، Institution(districtId,name) و(id,districtId) لدعم FK المركب، Schedule UNIQUE(teacherId,academicYear)، Slot(scheduleId,dayOfWeek,startMinute,endMinute)، Visit(teacherId,occurredAt)/(inspectorId,scheduledAt)، FollowUp(ownerInspectorId,status,dueAt)، Proposal(inspectorId,kind,status)، AuditLog(districtId,occurredAt). البحث النصي المتقدم يبدأ بـPostgres normalized columns/trigram بعد قياس؛ لا Elasticsearch مبكرًا.
- AuditLog: FK اختيارية إلى Inspector/District بـ`onDelete: Restrict` و`onUpdate: Cascade`. `entityType/entityId` مرجع منطقي بلا FK إلى المورد. يُستمد district من المورد بعد authorization؛ الأحداث المقاطعية تتطلبه. metadata ذات allowlist لكل حدث بلا نسخ بيانات شخصية أو أسرار أو request bodies. لا update/delete في خدمة append؛ لا ضمان immutability على مستوى DB. التفاصيل في [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

## سياسة التاريخ والهجرات

يحفظ القرار والزيارات والتقارير النهائية والمراجعات وسجل التدقيق؛ أرشفة Teacher/Institution/Proposal بدل الحذف المعتاد. عدم تغيير revision منشورة؛ نسخ المقترح يُنشئ proposal جديدًا ذا sourceRevision اختياري. migrations صغيرة بإستراتيجية expand/backfill/contract، مراجعة SQL والقيم الافتراضية والفهارس، backup قبل الإنتاج، تحقق rollback أو خطة forward fix؛ التنفيذ خارج طلب المعمارية. سياسة الاحتفاظ والحذف القانوني [OPEN](DECISIONS.md).
