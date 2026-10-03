# Database v0.1

تصميم منطقي؛ لا migrations في هذه المراجعة. PostgreSQL/Prisma وفق [ARCHITECTURE](ARCHITECTURE.md). `id` UUID، `createdAt/updatedAt` وFKs مسماة لكل سجل قابل للتعديل. تواريخ الأحداث UTC، واليوم/الساعة التشغيلية وفق `Africa/Algiers`. أسماء الحقول التالية عقود مبدئية، وليست استمارة رسمية.

## الكيانات (23 أساسية بعد ADR-029)

| مجموعة | كيان | حقول/علاقات أساسية وحدود |
|---|---|---|
| Identity | Inspector | email unique، passwordHash، status؛ `name/surname` مهنيان nullable كزوج بعد TASK-052A؛ ليس Teacher |
| Identity | District | name، externalCode اختياري؛ لا افتراض مقاطعة واحدة |
| Identity | InspectorDistrictMembership | inspectorId/districtId، role، validFrom/validTo؛ نطاق وصول قابل للتغيير تاريخيًا |
| Intake | TeacherSubmission | `districtId` FK من رابط المقاطعة؛ `submittedProfile` snapshot تاريخي غير متحقق. شكل G3 القديم يحفظ `primaryInstitutionName/additionalInstitutionNames`؛ شكل ما بعد TASK-041 يحفظ `workplace` لمؤسسة واحدة، دون تغيير snapshots القديمة. status يبدأ `PENDING` ثم `ACCEPTED/REJECTED/INTERNAL_REVIEW`، submittedAt وبيانات القرار وacceptedTeacherId؛ لا login أو Institution/Teacher أو ربط مؤسسة من public POST؛ ADR-015/ADR-029 |
| Core | Teacher | سجل مهني حالي يُنشأ عند قبول TeacherSubmission فقط؛ `institutionId` nullable من TASK-040 للمؤسسة الحالية المعتمدة الواحدة كحد أقصى؛ لا password أو notes أو علاقة مؤسسات متعددة |
| Core | Institution | districtId، name، externalCode اختياري، archivedAt؛ من TASK-040: municipality/address/directorPhone nullable للصفوف القائمة؛ من ADR-039/TASK-076A: زوج موقع يدوي nullable موضح أدناه |
| Core | ProfessionalHistory | أساس مؤجل لأحداث مهنية أخرى عند وجود عقد؛ لا يُستخدم لنقل مؤسسة أو تاريخ علاقة Teacher بها، ولا يحل محل AuditLog |
| Schedule | WeeklySchedule | teacherId، academicYear، revision؛ جدول حالي واحد لكل Teacher وسنة، بلا status أو validFrom/validTo أو تاريخ نسخ |
| Schedule | WeeklyScheduleSlot | scheduleId، dayOfWeek، startMinute/endMinute، levelLabel/groupLabel/notes اختيارية؛ سياق المكان من مؤسسة Teacher الحالية المعتمدة، بلا institutionId أو assignmentId |
| Visit | PedagogicalVisit | عقد ADR-031 الأصلي للفترة المخططة والتاريخ؛ [ADR-035](DECISIONS.md#adr-035--pedagogicalvisit-type-and-retrospective-exceptional-visit) يضيف `visitType` صريحًا nullable للقديم وفترة فعلية منفصلة للاستثنائية المسجلة بأثر رجعي، دون حقول تقرير |
| Visit | InspectionReport | عقد [ADR-012](DECISIONS.md#adr-012--inspector-authored-pedagogical-accompaniment-report-task-052): visitId unique، نوع/مصدر/إصدار ثابت، نصوص مرافقة محددة، DRAFT/FINAL، revision، finalizedAt/by، لقطة هوية نهائية؛ ليس قالبًا وزاريًا |
| Visit | FollowUp | `reportId` فقط إلى InspectionReport، `ownerInspectorId`، `dueDate`، `status`، `note`، `completionNote`، `completedAt`، `revision`؛ إجراء متابعة مستقل وفق ADR-033 |
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

## Teacher-proposed Institution location (ADR-040 / TASK-077B planned)

العقد المستقبلي المعتمد في [TASK-077](architecture/TASK_077_INSTITUTION_LOCATION_PROPOSAL.md#persistence-and-history): سبعة حقول typed nullable على TeacherSubmission للموقع المقترح وحالته وقراره، بلا جدول عام أو تغيير snapshot القديم. الزوج immutable وقرار الموقع مستقل عن قرار الطلب. الموقع المعتمد يبقى Institution فقط؛ يتوسع source CHECK مستقبلًا إلى MANUAL_INSPECTOR وTEACHER_PROPOSED_APPROVED. لا coordinates على Teacher/TeacherSupplementaryWorkplace/WeeklyScheduleSlot/PedagogicalVisit. migration forward-only في TASK-077B، بلا backfill أو تغيير تاريخ؛ التفاصيل والقيود والعلاقات في العقد المركزي. لم يُنفذ هذا التطور في TASK-077A؛ القسم التالي هو baseline TASK-076A التاريخي.

## Institution location persistence (ADR-039 / TASK-076A)

تضيف migration واحدة forward-only إلى `Institution`: `latitude Decimal? @db.Decimal(9,6)`, `longitude Decimal? @db.Decimal(9,6)`, و`locationSource String? @db.VarChar(32)`. التخزين PostgreSQL `NUMERIC(9,6)` دقيق؛ الإحداثيات درجات WGS84. CHECKs تفرض `-90 <= latitude <= 90`, و`-180 <= longitude <= 180`، والحالتين فقط: الحقول الثلاثة NULL، أو كلا الإحداثيين غير NULL والمصدر `MANUAL_INSPECTOR`. المصدر يصف إدخال المفتش ولا يثبت تحققًا خارجيًا. `0,0` زوج صالح.

كل الصفوف القائمة تبقى NULL؛ لا backfill أو استنتاج من العنوان. API يرفض أكثر من ست منازل عشرية والصيغ الأسية وغير العشرية قبل تحويل Prisma Decimal لأن NUMERIC(scale) يقرّب الإدخال. لا جدول تاريخ مواقع أو حقول تحقق/نسخ على Teacher أو علاقات العمل/الجدول/الزيارة، ولا PostGIS أو spatial index. الصلاحيات والتسلسل الذري مع AuditLog في [ADR-039](DECISIONS.md#adr-039--inspector-managed-institution-location-and-explicit-map-access) وعقد [API](API_CONTRACTS.md#institution-location-adr-039--task-076a).

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

إنشاء Institution وربط Teacher في تأكيد واحد عمليتان ذريتان مع أحداث AuditLog المطلوبة. اختيار مؤسسة قائمة لا ينسخ بيانات التصريح فوقها. تغيير الرابط يستبدل قيمة `institutionId` فقط بعد التحقق، ولا ينشئ صفًا تاريخيًا؛ قد يسجل AuditLog معرّف الرابط السابق والجديد دون بيانات شخصية. `WeeklySchedule` مستقل عن علاقة المؤسسة وفق ADR-030، و`WeeklyScheduleSlot` يرتبط بالجدول/Teacher لا بـAssignment. لا migration لـProfessionalHistory أو جدول مكان عمل مستقل لهذا القرار.

## Weekly Schedule persistence contract (ADR-030 / TASK-047)

`WeeklySchedule`: `id UUID PK`, `teacherId UUID NOT NULL` FK إلى Teacher (`onDelete: Restrict`, `onUpdate: Cascade`)، `academicYear String NOT NULL` بصيغة `YYYY-YYYY` وسنة النهاية = البداية + 1، `revision Int NOT NULL DEFAULT 1` مع `revision >= 1`، و`createdAt/updatedAt`؛ `UNIQUE(teacherId,academicYear)` يضمن جدولًا حاليًا واحدًا على الأكثر للسنة. لا status أو validFrom/validTo أو سجل نسخ. يتحقق التطبيق من شكل السنة ويؤكده قيد DB، ولا تُعدل السنة في مسار تحرير slots.

`WeeklyScheduleSlot`: `id UUID PK`, `scheduleId UUID NOT NULL` FK إلى WeeklySchedule (`onDelete: Restrict`, `onUpdate: Cascade`)، `dayOfWeek Int NOT NULL` من 1 الاثنين إلى 7 الأحد، `startMinute/endMinute Int NOT NULL` مع `0 <= startMinute < endMinute <= 1440`، `levelLabel String?`, `groupLabel String?`, `notes String?`، و`createdAt/updatedAt`. القيم الاختيارية غير الفارغة بعد trim وUnicode NFC واختزال فراغات العرض؛ محارف التحكم مرفوضة؛ الحدود بعد التنظيف Unicode code points 100/100/500 على الترتيب. تفرض الهجرة أيضًا حدود `char_length` نفسها على الأعمدة الاختيارية كدفاع DB (وتحسب PostgreSQL بها المحارف، لا UTF-8 bytes)؛ التطبيع والتحقق من محارف التحكم مسؤولية طبقة التطبيق، بلا triggers. لا curriculum FK أو institutionId أو assignmentId أو timezone/تاريخ لكل slot؛ سياق المؤسسة في العرض من Teacher الحالي.

يمنع قيد PostgreSQL GiST exclusion تداخل `(scheduleId,dayOfWeek,int4range(startMinute,endMinute,'[)'))` لنفس الجدول واليوم؛ `[)` يسمح بتجاور نهاية slot وبداية التالي. `btree_gist` مثبتة في سلسلة migrations منذ TASK-022؛ هجرة TASK-047 forward-only مستقلة، مع تحقق clean+upgrade. الفهارس: unique `(teacherId,academicYear)`، وslot `(scheduleId,dayOfWeek,startMinute,endMinute)` لقراءة اليوم بترتيب الوقت، و`(dayOfWeek,startMinute)` لدعم بحث TASK-044 المستقبلي؛ لا فهرس إضافي على `teacherId` إذ يغطيه مفتاح uniqueness كبادئة. لا مؤسسة لازمة لكل slot في DB؛ TASK-048 تمنع mutation عندما `Teacher.institutionId=NULL`.

## Inspector professional identity prerequisite (TASK-052A)

Migration مستقلة forward-only تضيف إلى `Inspector` حقلَي `name String?` و`surname String?` فقط، دون تغيير `email/passwordHash/status/id/Session/memberships`. القيم القديمة NULL ولا يُشتق الاسم من البريد ولا يُملأ اصطناعيًا. قيد DB يجعل الحقلين NULL معًا أو غير NULL معًا، ويرفض النص الفارغ/المكوّن من فراغات في كل حقل غير NULL؛ 1..100 Unicode code points لكل حقل بعد التطبيع في API. لا `NOT NULL` الآن لأن Inspector rows قائمة ولا مصدر أسماء معتمدًا لها. عند إدخال Inspector جديد في مسار إنشاء حساب مستقبلي، يشترط ذلك المسار الاسم واللقب قبل التفعيل؛ لا يضيف TASK-052A مسار إنشاء حساب. إتمام Report يشترط الاسمَين فعليًا مهما كانت nullability التخزينية.

## InspectionReport persistence contract (ADR-012 / TASK-052)

**بوابة مستقبلية فقط:** [ADR-034 المعتمد](DECISIONS.md#adr-034--product-owner-adopted-inspector-visit-report-template) و[جرد القالب](architecture/INSPECTOR_VISIT_REPORT_TEMPLATE.md) يحددان نوعًا مستقلًا `INSPECTOR_VISIT / PRODUCT_OWNER_ADOPTED / 1` داخل `InspectionReport`، ومعايير اختيارية تابعة بمفاتيح ثابتة، وتقديرًا وعلامة يدويين اختياريين، ولقطات عرض جديدة عند الحاجة. القيود أدناه تصف النوع الحالي المُنفذ فقط؛ لا تغيير في Prisma/DB الآن. عند التنفيذ تُنشأ migration forward-only توسّع CHECK النوع/المصدر وتضيف شرط FINAL خاصًا بالنوع الجديد، دون تعديل صفوف ADR-012 القديمة أو Teacher/Visit/FollowUp؛ `visitId` يظل فريدًا، والنهائي ثابت. لا يلزم مجال رقمي للعلامة النصية اليدوية غير المحسوبة.

Migration واحدة جديدة forward-only بعد TASK-052A تنشئ `InspectionReport` فقط، دون تعديل Visit أو migrations سابقة أو backfill. جدول الحقول:

| Field | Prisma / DB | Invariant |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | هوية التقرير |
| `visitId` | `String @unique @db.Uuid` | FK إلى `PedagogicalVisit.id`؛ تقرير واحد/زيارة |
| `reportType` | `String` NOT NULL DEFAULT `PEDAGOGICAL_ACCOMPANIMENT` | قيمة أولى وحيدة؛ CHECK allowlist |
| `templateSource` | `String` NOT NULL DEFAULT `INSPECTOR_AUTHORED` | ليست OFFICIAL؛ CHECK allowlist |
| `templateVersion` | `Int` NOT NULL DEFAULT 1 | الإصدار الأول ثابت، CHECK `=1` لهذا النوع/المصدر؛ لا يُعدل بعد الإنشاء |
| `status` | `String` NOT NULL DEFAULT `DRAFT` | `DRAFT/FINAL` فقط؛ CHECK |
| `revision` | `Int` NOT NULL DEFAULT 1 | CHECK `>=1`، يزيد مرة لكل تغيير فعلي/إتمام |
| `levelClass` | `String?` | مستوى/قسم؛ حد 100 code points |
| `lessonTopic` | `String?` | ميدان بيداغوجي أو موضوع حصة؛ حد 200 code points |
| `pedagogicalObservations`, `strengths`, `improvementAreas`, `guidanceRecommendations`, `inspectorConclusion` | `String?` لكل منها | نصوص مستقلة؛ حد 4000 code points لكل حقل |
| `finalizedAt` | `DateTime? @db.Timestamp(3)` | وقت الخادم UTC؛ NULL في DRAFT |
| `finalizedByInspectorId` | `String? @db.Uuid` | Inspector المصادق؛ NULL في DRAFT |
| `finalizedInspectorNameSnapshot`, `finalizedInspectorSurnameSnapshot` | `String?` | لقطة مهنية من Inspector.name/surname عند FINAL فقط، حد 100 لكل منها |
| `finalizedTeacherNameSnapshot`, `finalizedTeacherSurnameSnapshot` | `String?` | لقطة من Teacher.name/surname عند FINAL فقط، حد 100 لكل منها |
| `createdAt`, `updatedAt` | `DateTime` default now / `@updatedAt` | تواريخ سجل قابلة للتعديل |

كل النصوص nullable في المسودة؛ عدم وجود قيمة يُحفظ `NULL` لا `''`. `FINAL` يشترط DB CHECK: `levelClass`, `lessonTopic`, `inspectorConclusion` غير NULL وغير فارغة بعد trim؛ `finalizedAt/finalizedByInspectorId` واللقطات الأربع غير NULL وغير فارغة. `DRAFT` يشترط أن حقول الإتمام واللقطات جميعها NULL. CHECK يضبط طول code points بــPostgreSQL `char_length` للحقول المذكورة، ويرفض النص الفارغ/المكوّن من فراغات في كل حقل نصي غير NULL. فحص زيارة `COMPLETED`، ثبات النهائي، و`revision`/انتقالات الحالة تُنفذ في الخدمة/تحديث مشروط داخل transaction، لأن CHECK لا يفحص صف Visit أو تاريخ التحديث. لا حقل Report لاسم Institution أو academicYear أو وقت Visit؛ تُقرأ من Visit التاريخي. لا `content JSON` أو جدول نسخ أو حقول توقيع/تنقيط/مرفقات.

FK `visitId → PedagogicalVisit.id` و`finalizedByInspectorId → Inspector.id` بـ`onDelete: Restrict,onUpdate: Restrict`. `visitId` unique يخدم البحث من زيارة؛ فهرس `finalizedByInspectorId` فقط للـFK، ولا دليل تقارير عام في TASK-052. قراءة/إتمام Report تتطلب المفتش المسؤول وعضويته الحالية في `Visit.districtId` وفق ADR-031؛ لا يُستمد النطاق من Report body. لا حذف صلب أو أرشفة في MVP؛ ADR-014 OPEN.

## TASK-054 — Inspector Visit Report V1 persistence contract

[عقد الحقول والقيود الكامل](architecture/TASK_054_INSPECTOR_VISIT_REPORT_V1.md) و[ADR-034](DECISIONS.md#adr-034--product-owner-adopted-inspector-visit-report-template) يحكمان المهمة الجديدة؛ هذا القسم لا يغير جدول ADR-012 المُنفذ حتى migration TASK-054. `InspectionReport.visitId` يظل unique **لجميع الأنواع معًا**. الجديد `reportType=INSPECTOR_VISIT`, `templateSource=PRODUCT_OWNER_ADOPTED`, `templateVersion=1`، مع إبقاء الزوج القديم/الصفوف/لقطات FINAL/FollowUps حرفيًا. Migration واحدة forward-only تضيف أعمدة V1 nullable ولقطات FINAL من Teacher.birthDate/placeOfBirth/qualifications وDistrict.name وInstitution.municipality، ومفتاح FK مركب وجدول `InspectionReportObservation` بمفتاح معيار V1 و`UNIQUE(reportId,criterionKey)` وCHECK المفاتيح/الطول. تُقيد أعمدة V1 بـNULL للنوع القديم، وأعمدة المرافقة الحصرية بـNULL للنوع الجديد، وتظل الحقول المشتركة وشروط FINAL الأساسية لكل نوع. لا امتداد Teacher/Visit/FollowUp، ولا backfill أو تعديل migration سابقة؛ اختبارات clean+upgrade وثبات القديم شرط gate.

تطور [ADR-035](DECISIONS.md#adr-035--pedagogicalvisit-type-and-retrospective-exceptional-visit) يضيف إلى V1 فقط حقول `visitStrengthsText`, `visitImprovementAreasText` و`tenureConclusionText` الاختيارية، وعدادات `studentCount` (الإجمالي)، `studentsPresentCount`, `studentsAbsentCount` كأعداد صحيحة غير سالبة اختيارية. إن وُجد الإجمالي فلا يزيد عليه أي جزء، وإن وُجدت الثلاثة فالحاضر+الغائب=الإجمالي؛ لا تُستنتج قيمة ناقصة. `tenureConclusionText` تنطبق على TENURE_CONFIRMATION فقط، والأنواع الأخرى NULL. نوع Visit مشتق لا ينسخ كحقل تقرير. علامة PROMOTION_EVALUATION الاختيارية `pedagogicalMark Decimal? @db.Decimal(4,2)` تُخزن كـ`NUMERIC(4,2)` دقيق، لا floating point؛ API يرفض أكثر من منزلتين قبل التحويل ويثبت `0..20`، وDB CHECK يحمي المجال مع `NULL` ويضمن النوع الفيزيائي scale 2. تُرفض العلامة لغير PROMOTION_EVALUATION في خدمة التقرير، و`markText/markWordsText` يكونان NULL في V1 الترقية منعًا لمصدرَي علامة، دون تعديل بيانات تاريخية أو إعادة تفسيرها. TASK-054 محجوبة فقط بإنجاز وقبول TASK-053A، ولا تنشأ migration في هذه البوابة. لا يتغير جدول Visit إلا في TASK-053A.

## FollowUp persistence contract (ADR-033 / TASK-053)

Migration واحدة forward-only بعد TASK-052 تنشئ `FollowUp` فقط؛ لا تعديل Visit/Report أو migrations سابقة، ولا backfill. النموذج:

| Field | Prisma / DB | Invariant |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | هوية مستقلة |
| `reportId` | `String @db.Uuid` NOT NULL | FK إلى `InspectionReport.id`؛ غير unique، `0..N` لكل تقرير |
| `ownerInspectorId` | `String @db.Uuid` NOT NULL | FK إلى `Inspector.id`؛ ثابت بعد الإنشاء |
| `status` | `String` NOT NULL DEFAULT `OPEN` | CHECK `OPEN/COMPLETED` |
| `note` | `String` NOT NULL | وصف إجراء؛ 1..1000 Unicode code points بعد التطبيع |
| `dueDate` | `DateTime @db.Date` NOT NULL | تاريخ تقويمي خالص؛ API `YYYY-MM-DD`، بلا وقت أو timezone في التخزين |
| `completionNote` | `String?` | نتيجة موجزة؛ NULL أو 1..1000 Unicode code points |
| `completedAt` | `DateTime? @db.Timestamp(3)` | UTC من الخادم؛ NULL إذا OPEN، غير NULL إذا COMPLETED |
| `revision` | `Int` NOT NULL DEFAULT 1 | CHECK `>=1`؛ compare-and-swap في الخدمة |
| `createdAt`, `updatedAt` | `DateTime` default now / `@updatedAt` | اصطلاح السجلات القابلة للتعديل |

CHECK يربط `status=OPEN` بـ`completedAt IS NULL AND completionNote IS NULL`، و`status=COMPLETED` بـ`completedAt IS NOT NULL`؛ `completionNote` تظل اختيارية. CHECK يمنع `note` الفارغة/الفراغية ويقيد طولها `char_length <=1000`، ويمنع `completionNote` غير NULL الفارغة/الفراغية ويقيدها كذلك. API تطبّق NFC وtrim واختزال whitespace المتكرر إلى فراغ واحد، وترفض محارف التحكم و`""`/الفراغ فقط؛ الاختيارية الغائبة أو `null` تحفظ NULL. `dueDate` تاريخ Gregorian حقيقي canonical؛ يقبل الماضي ولا تُخزّن حالة تنبيه مشتقة. لا JSON أو `teacherId/visitId/districtId` أو لقطة PII على FollowUp.

FKs إلى `InspectionReport` و`Inspector`: `onDelete: Restrict,onUpdate: Restrict`. فهرس `(reportId,dueDate,id)` للقائمة المرتبطة بالتقرير، وفهرس `(status,dueDate,id)` للقائمة التشغيلية مع نطاق المقاطعة المشتق عبر Report→Visit؛ فهرس `ownerInspectorId` لدعم FK/تحقق المالك. لا unique على `reportId`، ولا trigger لمنع تغيّر تقرير/Visit: شرط FINAL، Visit غير CANCELLED، الملكية والنطاق والتحرير/الإكمال والـrevision تُفرض في معاملات الخدمة المشروطة. القراءة تستعمل Report→Visit التاريخية؛ لا تغيير لتقرير FINAL أو نسخه بسبب FollowUp.

## PedagogicalVisit persistence contract (ADR-031 / TASK-050)

Migration مستقلة forward-only تنشئ `PedagogicalVisit` فقط؛ لا تعدل الجداول التاريخية أو تنشئ InspectionReport. أسماء الحقول وأنواعها:

| Field | Type / nullability | Rule |
|---|---|---|
| `id` | UUID PK، NOT NULL | generated |
| `districtId` | UUID NOT NULL | District الزيارة وقت الإنشاء، لا يُشتق لاحقًا من Teacher |
| `inspectorId` | UUID NOT NULL | المفتش المسؤول؛ Inspector المصادق عليه وقت الإنشاء |
| `teacherId` | UUID NOT NULL | Teacher واحد للزيارة |
| `institutionId` | UUID NOT NULL | مؤسسة Teacher الحالية المعتمدة عند الإنشاء؛ مرجع تاريخي ثابت |
| `institutionNameSnapshot` | String NOT NULL | الاسم غير الفارغ من Institution وقت الإنشاء؛ لا يُعاد ملؤه بعد إعادة التسمية |
| `academicYear` | String NOT NULL | `YYYY-YYYY` بسنتين متتاليتين؛ سياق فحص الجدول، لا FK إلى WeeklySchedule |
| `scheduledStartAt`, `scheduledEndAt` | DateTime NOT NULL | UTC normalized وفق أعمدة DateTime الحالية؛ start < end، بلا مدة افتراضية |
| `occurredAt` | DateTime NULL | NULL إلا عند COMPLETED؛ عندها وقت الإنجاز الفعلي المطلوب من المفتش |
| `status` | String NOT NULL، DEFAULT `PLANNED` | `PLANNED/COMPLETED/CANCELLED` فقط |
| `revision` | Int NOT NULL، DEFAULT 1 | موجب؛ يزيد مرة لكل mutation فعلية |
| `createdAt`, `updatedAt` | DateTime NOT NULL | default now / Prisma `@updatedAt` |

FKs `districtId → District.id`, `inspectorId → Inspector.id`, `teacherId → Teacher.id` جميعها `onDelete: Restrict`, `onUpdate: Restrict`. FK مركب `(institutionId,districtId) → Institution(id,districtId)` يستخدم المفتاح الفريد الموجود مع `onDelete: Restrict`, `onUpdate: Restrict`؛ يمنع حذف المؤسسة أو تغيير مقاطعتها مع وجود زيارة تاريخية، ولا يمنع تعديل اسمها أو أرشفتها. لا FK مركب بين `(teacherId,districtId)` وTeacher لأن `districtId` لقطة تاريخية ولا ينبغي أن تعيد حركة Teacher مستقبلًا كتابة الزيارة أو تمنعها تلقائيًا؛ تتحقق الخدمة ذريًا من تطابق District عند الإنشاء، بينما يظل ADR-017 قرار نقل مستقلًا. تقرأ الخدمة Teacher ثم Institution وتقفل صفّيهما بترتيب ثابت داخل معاملة الإنشاء قبل التحقق والنسخ والتدقيق؛ لا يجوز أن يتغير رابط المؤسسة أو اسمها في منتصف التقاط سياق الزيارة. تقرأ قائمة/تفاصيل الزيارة اسم المؤسسة من `institutionNameSnapshot`، لا من اسم المؤسسة الحي ولا من `Teacher.institutionId` الحالي.

تفرض migration قيود CHECK على `scheduledStartAt < scheduledEndAt`, و`revision >= 1`, وقائمة `status`، و`occurredAt IS NOT NULL` إذا وفقط إذا `status='COMPLETED'`، وعدم فراغ `institutionNameSnapshot`، وشكل `academicYear` وسنتيه المتتابعتين وفق ADR-030. لا تفرض DB انتقالات الحالة التاريخية بلا trigger؛ تعالجها خدمة mutation مع شرط revision/current status. لا عمود `type`, `notes`, `scheduleId`, `reportId` أو بيانات تقييم/تقرير، ولا حذف صلب في TASK-050.

تستخدم migration امتداد `btree_gist` الموجود وتضيف قيدي GiST exclusion جزئيين على `tsrange(scheduledStartAt,scheduledEndAt,'[)')`، أحدهما مع مساواة `inspectorId` والآخر مع مساواة `teacherId`، بشرط `status <> 'CANCELLED'`. التاريخان مخزنان كقيم UTC وفق DateTime الحالي؛ يجب ألا يؤثر timezone جلسة PostgreSQL في تكوين المدى. يمنع القيدان السباق حتى لو تجاوز متطلبان فحص الخدمة، ويسمحان بالتجاور وبإعادة استعمال موعد زيارة أُلغيت؛ الزيارة `COMPLETED` تبقى مانعة للتداخل. الفهارس العادية لخدمة النطاق/القائمة: `(districtId,scheduledStartAt DESC,id DESC)`, `(teacherId,scheduledStartAt)`, `(inspectorId,scheduledStartAt)`, `(institutionId,scheduledStartAt)`؛ لا فهرس تاريخي آخر بلا قياس. سجلات قائمة مسبقة أو هجرة ترقية لا تتطلب backfill؛ الاختبار يجب أن يثبت بقاء G4 كما هو.

## Post-G5 PedagogicalVisit type evolution (ADR-035 / TASK-053A)

Migration واحدة forward-only **بعد** سلسلة G5 وقبل TASK-054: `visitType String?` بلا default، CHECK (`NULL` أو إحدى `GUIDANCE/TENURE_CONFIRMATION/PROMOTION_EVALUATION/MONITORING_FOLLOW_UP/EXCEPTIONAL`)، و`actualStartAt DateTime? @db.Timestamp(3)`, `actualEndAt DateTime? @db.Timestamp(3)`. كل الصفوف القديمة تبقى `visitType=NULL`, والفترة المخططة القائمة غير NULL دون backfill. `scheduledStartAt/EndAt` يصيران nullable في schema الفيزيائي فقط لاستثنائية retrospective. CHECK زمني حصري: إما `scheduledStartAt/EndAt` كلاهما موجودان و`start<end` مع `actualStartAt/EndAt` كلاهما NULL؛ أو `visitType='EXCEPTIONAL'` و`scheduledStartAt/EndAt=NULL` و`actualStartAt/EndAt` كلاهما موجودان و`actualStartAt<actualEndAt` و`status='COMPLETED'` و`occurredAt=actualEndAt`. تبقى CHECK `occurredAt` iff COMPLETED وrevision/status/year/institution snapshot القائمة. لا يسمح RETROSPECTIVE لغير EXCEPTIONAL، ولا تغيير فترة أو نوع بعد هذا الإنشاء. API الجديدة تُلزم `visitType` في كل POST؛ لا يمكن CHECK بـNOT NULL على العمود ذاته دون اختلاق قيمة للصفوف القديمة، لذا لا يضمن DB التفريق الزمني بين API جديدة وكتابة مباشرة بامتيازات DB.

قيدا GiST للتداخل يستبدلان **في migration الجديدة فقط** بتعبير `tsrange(COALESCE(actualStartAt,scheduledStartAt),COALESCE(actualEndAt,scheduledEndAt),'[)')` مع نفس مفاتيح `inspectorId` و`teacherId` وشرط `status <> 'CANCELLED'`. لم تتغير فترات الصفوف القديمة أو معيار التجاور/الإلغاء، وتمنع الفترة الفعلية الاستثنائية التداخل أيضًا تحت السباق. فرز/مرشح القائمة يعتمدان بداية الفترة الفعالة نفسها؛ تضاف فهارس `(districtId,visitType)` والبديل اللازم لبداية الفترة الفعالة عند إثبات خطة الاستعلام في اختبار 180+ زيارات، لا نسخة ثانية من مؤسسة/Teacher. لا تعديل migration TASK-050 ولا FollowUp/Report. قفل نوع Visit بعد وجود Report (حتى DRAFT) وشرط `expectedRevision` يعملان في service transaction لأن CHECK لا يستعلم عن تقرير تابع؛ FINAL لا يرى نوعًا مختلفًا لاحقًا دون snapshot مكرر.

## Public intake declaration evolution — TASK-085 (completed)

The single forward migration `20261003100000_task_085_public_intake_evolution` adds 14 nullable typed columns to `TeacherSubmission`: `birthProvince varchar(100)`, `professionalFramework varchar(120)`, `firstEducationAppointmentDate DATE`, `firstEducationAppointmentDecisionNumber varchar(120)`, `firstInstallationDate DATE`, `traineeshipDate DATE`, `institutionAppointmentDate DATE`, `institutionAppointmentNumber varchar(120)`, `administrativeCategory varchar(100)`, `administrativeSection varchar(100)`, `administrativeGrade varchar(100)`, `administrativeClassificationEffectiveDate DATE`, `personalAddress varchar(300)`, and `declaredHomeInstitutionEmail varchar(254)`. Optional omission is stored as NULL; no legacy data is backfilled and `submittedProfile` is not rewritten.

The same migration adds `TeacherSubmissionQualificationDeclaration` (UUID id, submission FK, zero-based SMALLINT position, name varchar(200), optional issuingBody varchar(200), optional qualificationDate DATE, createdAt) and `TeacherSubmissionSupplementaryWorkplaceDeclaration` (UUID id, submission FK, position, institutionName varchar(200), optional municipality varchar(150), institutionAddress varchar(300), directorPhone varchar(20), createdAt). Each has a parent-leading unique `(submissionId,position)` retrieval index and position CHECK (0..4 / 0..2). Child FK is `ON DELETE RESTRICT ON UPDATE CASCADE`; no content uniqueness or authoritative Teacher/Institution/qualification FK. These immutable declaration rows are created atomically with a public submission, have no update/delete API, and legacy submissions receive no children. The migration leaves all historical Teacher, Institution, TeacherQualification and TeacherSupplementaryWorkplace records untouched.

Only the ten explicitly classified ACCEPTANCE_SEED scalars are copied from persisted columns when ACCEPT creates a new Teacher. Decision/reference numbers, institution appointment facts, declared home email, structured qualification declarations and supplementary-workplace declarations remain on TeacherSubmission. No public declaration creates an Institution, authoritative child qualification/workplace, schedule or home Institution link. Existing confirmationDate and legacy free-text qualifications mappings remain unchanged. See [TASK-085 contract](architecture/TASK_085_PUBLIC_INTAKE_EVOLUTION.md) and the current [API contract](API_CONTRACTS.md#task-085--current-public-teacher-intake-evolution-completed).

## قيود وفهارس

- قرارات TeacherSubmission تتبع مصفوفة [ADR-026](DECISIONS.md#adr-026--teacher-submission-decision-workflow): `PENDING → ACCEPTED/REJECTED/INTERNAL_REVIEW` و`INTERNAL_REVIEW → ACCEPTED/REJECTED` فقط؛ الحالات النهائية لا يعاد فتحها. `decidedAt/decidedByInspectorId` يسجلان آخر إجراء انتقال، بما فيه INTERNAL_REVIEW، ولا يقتصران على القرار النهائي؛ `acceptedTeacherId` يضبط للقبول فقط وفريد حيث غير NULL. القبول ينشئ Teacher واحدًا ويحدّث الطلب ويضيف AuditLog في transaction واحدة؛ الرفض/الإحالة لا ينشئان Teacher، ولكل قرار AuditLog في المعاملة. تستخدم optimistic concurrency أو conditional update؛ لا merge آلي ولا إنشاء Institution/Assignment من التصريحات.
- ضمان السباق في TASK-034: `expectedStatus` إلزامي، ويُطالب بالانتقال ذريًا داخل transaction وفق آلية متوافقة مع PostgreSQL/Prisma؛ تنجح محاولة واحدة على الأكثر، والخاسرة `409` بلا Teacher أو AuditLog قرار إضافيين. إعادة ACCEPT بعد القبول `409`، لا replay ولا idempotency-key storage. تفاصيل ADR-027.
- TeacherSubmission في TASK-030 يحتاج FK إلى District وفهرس `(districtId,status,submittedAt)`؛ يبقى snapshot تصريحًا مستقلًا لكل POST، حتى عند إعادة الإرسال. تُفرض الحقول المطلوبة والحالة `PENDING` عند الإنشاء، ولا تُنشأ علاقات إلى Institution من أسماء المؤسسات المعلنة. تتحقق حدود الأطوال والصيغ وبنية قائمة الأسماء عبر Zod؛ لا تعقيد PostgreSQL إضافي لهذه الصيغ دون حاجة مثبتة.
- TASK-032 يحسب المرشحين عند القراءة من TeacherSubmission أخرى في District الطلب، بحالتي `PENDING/INTERNAL_REVIEW` فقط مع استبعاد الطلب الحالي و`REJECTED/ACCEPTED`؛ لا جدول أو علاقة أو حقل مرشحين مخزن، ولا migration أو فهرس جديد. يكفي الفهرس `(districtId,status,submittedAt)` لحجم MVP الحالي، وتُراجع الحاجة بعد قياس الأداء. بعد TASK-034 يكون Teacher تمثيل المقبولين المعتمد؛ مقارنته فعليًا بالطلبات مؤجلة إلى مهمة ذات عقد قراءة مستقل، ولا يُعرض الطلب المقبول وTeacher الناتج كمرشحين منفصلين.
- FK المركب الجديد يفرض تساوي District بين Teacher وInstitution عند الربط؛ تظل عضوية المفتش ونطاق الوصول والتحقق من الأرشفة مسؤولية service داخل transaction. تغيير مقاطعة Teacher أو Institution ليس جزءًا من هذا المسار؛ ADR-017 مستقل. الأرشفة لا تمحو الزيارات، والمؤسسة المرتبطة لا تُحذف حذفًا صلبًا.
- `InspectorDistrictMembership` تاريخي؛ `validFrom` إلزامي و`validTo = NULL` فترة مفتوحة. إن وُجد `validTo` فيجوز أن يساوي `validFrom` ولا يجوز أن يسبقه. الفترات نصف مفتوحة `[validFrom, validTo)`، ويمنع PostgreSQL تداخل فترتين للـ`inspectorId + districtId` نفسيهما بقيد exclusion زمني. يسمح بتعدد السجلات التاريخية ولا يوجد unique للزوج؛ إغلاق التكليف بتعيين `validTo`، ولا يمنع membership لمقاطعات مختلفة بالتوازي. التفاصيل المعتمدة في [ADR-023](DECISIONS.md#adr-023--inspector--district-membership-policy).
- لا حقل نصاب أسبوعي في علاقة Teacher بالمؤسسة. إذا لزم حساب النصاب لاحقًا فيُشتق من `WeeklyScheduleSlot` وفق ADR-030 بعد تحديد قواعده؛ لا حد نصاب رسمي مفترض في TASK-040.
- `WeeklyScheduleSlot` يتبع قيود [ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract): اليوم 1..7، والدقائق `0 <= startMinute < endMinute <= 1440`، وعدم التداخل داخل الجدول واليوم مع السماح بالتجاور. لا ينشأ Slot في TASK-040.
- فهارس: Submission(districtId,status,submittedAt)، Teacher(districtId,surname,name,recordStatus) و(institutionId)، Institution(districtId,name) و(id,districtId)، Schedule UNIQUE(teacherId,academicYear)، Slot(scheduleId,dayOfWeek,startMinute,endMinute)؛ فهارس Visit وقيدا التداخل في [عقدها أعلاه](#pedagogicalvisit-persistence-contract-adr-031--task-050)؛ فهارس FollowUp في [عقد ADR-033](#followup-persistence-contract-adr-033--task-053)، Proposal(inspectorId,kind,status)، AuditLog(districtId,occurredAt). البحث النصي المتقدم يبدأ بـPostgres normalized columns/trigram بعد قياس؛ لا Elasticsearch مبكرًا.
- AuditLog: FK اختيارية إلى Inspector/District بـ`onDelete: Restrict` و`onUpdate: Cascade`. `entityType/entityId` مرجع منطقي بلا FK إلى المورد. يُستمد district من المورد بعد authorization؛ الأحداث المقاطعية تتطلبه. metadata ذات allowlist لكل حدث بلا نسخ بيانات شخصية أو أسرار أو request bodies. لا update/delete في خدمة append؛ لا ضمان immutability على مستوى DB. التفاصيل في [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

## سياسة التاريخ والهجرات

يحفظ القرار والزيارات والتقارير النهائية والمراجعات وسجل التدقيق؛ أرشفة Teacher/Institution/Proposal بدل الحذف المعتاد. عدم تغيير revision منشورة؛ نسخ المقترح يُنشئ proposal جديدًا ذا sourceRevision اختياري. migrations صغيرة بإستراتيجية expand/backfill/contract، مراجعة SQL والقيم الافتراضية والفهارس، backup قبل الإنتاج، تحقق rollback أو خطة forward fix؛ التنفيذ خارج طلب المعمارية. سياسة الاحتفاظ والحذف القانوني [OPEN](DECISIONS.md).

## TASK-080 additive Teacher/Institution evolution (ADR-036, completed)

بعد [ADR-036](DECISIONS.md#adr-036--teacher-information-workplace-and-administrative-profile-evolution)، سجل [TASK-080](architecture/TASK_080_TEACHER_ADMINISTRATIVE_MASTER_DATA.md) الحقول والأنواع والحدود، ونُفذت بإضافة migration واحدة forward-only. جداول/حقول TASK-081..086 خارجها. `professionalStatus` String وليس PostgreSQL enum؛ أضيفت `SUBSTITUTE` دون تحويل القيم السابقة. الأعمدة الجديدة nullable دون backfill، وتبقى `Teacher.qualifications` واللقطات التاريخية كما هي. وصف Teacher/Institution الفيزيائي الأقدم أعلاه هو baseline السابق لهذا التطور.
