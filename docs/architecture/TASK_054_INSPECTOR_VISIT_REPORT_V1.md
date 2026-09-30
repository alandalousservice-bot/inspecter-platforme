# TASK-054 — Inspector Visit Report V1 implementation contract

الحالة: عقد معماري لـ[ADR-034](../DECISIONS.md#adr-034--product-owner-adopted-inspector-visit-report-template) مع تطور [ADR-035](../DECISIONS.md#adr-035--pedagogicalvisit-type-and-retrospective-exceptional-visit)، **ليس تنفيذًا**. **عقد TASK-054 مكتمل، والتنفيذ محجوب فقط بإنجاز وقبول TASK-053A.** [جرد صفحتي المصدر](INSPECTOR_VISIT_REPORT_TEMPLATE.md) معتمد للمنصة، لا تثبت له صفة وزارية. لا تغيّر TASK-052/053/G5 أو ADR-013/TASK-060. المسميات التقنية المعتمدة: `reportType=INSPECTOR_VISIT`, `templateSource=PRODUCT_OWNER_ADOPTED`, `templateVersion=1`؛ الزوج القديم `PEDAGOGICAL_ACCOMPANIMENT/INSPECTOR_AUTHORED/1` يبقى حرفيًا.

## الهوية والدورة والتوافق

يبقى `InspectionReport.visitId @unique`: **تقرير واحد إجمالًا لكل Visit** وليس تقريرًا لكل نوع. يختار المفتش `visitType` عند إنشاء الزيارة لا نوع التقرير؛ زيارة حديثة ذات نوع معروف بلا Report تبدأ V1 الخادم صراحة عند أول حفظ، بلا شاشة اختيار نوع Report. زيارة تاريخية `visitType=NULL` بلا تقرير تبقى لمسار المرافقة القديم فقط حتى اختيار نوع زيارة صريح وفق ADR-035، ولا تحويل لمسودة قديمة أو تقرير FINAL. لا ينشأ تقرير تلقائيًا من Visit. مشتركة بين النوعين: `id/visitId/reportType/templateSource/templateVersion/status/revision/levelClass/lessonTopic/inspectorConclusion/finalizedAt/finalizedByInspectorId` ولقطات أسماء Inspector/Teacher الأربع و`createdAt/updatedAt`. الحقول `pedagogicalObservations/strengths/improvementAreas/guidanceRecommendations` حصرية دلاليًا للنوع القديم؛ تبقى قيمها وأحكامها هناك، وتكون NULL في النوع الجديد. V1 تضيف `visitStrengthsText` و`visitImprovementAreasText` اختيارية للّب المشترك وفق توسعة Product Owner، ولا تكرر النصوص القديمة. `levelClass` = القسم و`lessonTopic` = الميدان/موضوع الحصة، وكلاهما إلزامي عند FINAL كما في ADR-012. `inspectorConclusion` = «الخلاصة»، متعددة الأسطر حتى 4000 code points، إلزامية عند FINAL. `visitType` من Visit للعرض فقط، ولا نسخة قابلة للكتابة في Report؛ يثبت تاريخيًا لأن ADR-035 تمنع تغييره بمجرد وجود أي Report. السياق التاريخي الذي يضمنه Visit (`academicYear`, `occurredAt`, `institutionNameSnapshot`, IDs) يُقرأ منه لا يُنسخ إلى التقرير. لا مصدر حقيقة ثانٍ لنص إرشادات النوع الجديد.

## حقول تقرير V1 الجديدة

كل الحقول أدناه **nullable في DRAFT واختيارية في FINAL**. النص المفرد: NFC، trim، اختزال whitespace الداخلية إلى فراغ واحد، رفض C0/C1 وLF/TAB/Unicode line separators، رفض النص الفارغ بعد التطبيع، حد code points بعد التطبيع. النثر: NFC، CRLF/CR→LF، trim للأطراف، إبقاء الأسطر والمسافات الداخلية، رفض C0/C1 عدا LF، رفض نص فراغات فقط؛ حدود code points. `null` يعني لا قيمة؛ لا يُخزن `""`. لا يرسل العميل حقول اللقطات/الهوية/النوع/النطاق/الأوقات.

| الحقل canonical | خانة المصدر/الغاية | التخزين/حد Unicode | المصدر |
|---|---|---|---|
| `educationDirectorateText` | مديرية التربية لولاية | `String?` مفرد 150 | المفتش، إن لم يوجد مصدر موثوق |
| `administrativeDivisionText` | الدائرة | `String?` مفرد 150 | المفتش |
| `teacherClassificationText` | الصنف | `String?` مفرد 100 | المفتش |
| `teacherGradeText` | الدرجة | `String?` مفرد 100 | المفتش |
| `teacherNationalityText` | الجنسية | `String?` مفرد 100 | المفتش |
| `teacherEffectiveDateText` | تاريخ السريان كما كُتب؛ لا دلالة تاريخية مفترضة | `String?` مفرد 100 | المفتش |
| `teacherLastInspectionText` | آخر تفتيش كما كُتب؛ لا اشتقاق من Visit أخرى | `String?` مفرد 150 | المفتش |
| `teacherAppointmentText` | التعيين؛ لا مساواة آلية بـ`employedAt` | `String?` مفرد 150 | المفتش |
| `teacherProfessionalFrameworkText` | الإطار؛ لا مساواة آلية بـ`professionalStatus` | `String?` مفرد 100 | المفتش |
| `actualLessonDurationText` | مدة الحصة الفعلية كما سجلها المفتش؛ ليست مدة الموعد المخطط | `String?` مفرد 100 | المفتش |
| `studentCount` | عدد التلاميذ | `Int?` عدد صحيح غير سالب ضمن مجال PostgreSQL `int4` | المفتش |
| `studentsPresentCount` | عدد الحاضرين، إضافة Product Owner إلى سياق V1 | `Int?` غير سالب ضمن `int4` | المفتش |
| `studentsAbsentCount` | عدد الغائبين، إضافة Product Owner إلى سياق V1 | `Int?` غير سالب ضمن `int4` | المفتش |
| `lessonObjective` | هدف الدرس | `String?` مفرد 200 | المفتش |
| `pedagogicalGuidanceText` | الإرشادات/التوجيهات التربوية | `String?` نثر 4000 | المفتش |
| `practicalGuidanceText` | الجانب الميداني العملي | `String?` نثر 4000 | المفتش |
| `visitStrengthsText` | نقاط القوة/الملاحظات الإيجابية؛ إضافة Product Owner | `String?` نثر 4000 | المفتش |
| `visitImprovementAreasText` | النقائص/جوانب التحسين؛ إضافة Product Owner | `String?` نثر 4000 | المفتش |
| `tenureConclusionText` | استنتاج مهني اختياري لزيارة التثبيت/الترسيم فقط | `String?` نثر 4000 | المفتش؛ لا enum قانوني |
| `generalAssessmentText` | التقدير العام | `String?` مفرد 200 | المفتش؛ بلا enum/ترتيب |
| `markText` | العلامة بالأرقام وموضع العلامة في الصفحة الأولى | `String?` مفرد 100 | المفتش؛ نص يدوي لا نوع رقمي ولا تحليل/حساب/مجال |
| `markWordsText` | العلامة بالحروف | `String?` مفرد 200 | المفتش؛ لا توليد/فرض تطابق مع `markText` |
| `pedagogicalMark` | علامة الترقية/التقييم البيداغوجي فقط | `Decimal? @db.Decimal(4,2)`، 0..20 | المفتش؛ اختيارية، أقصى منزلتين، لا حساب أو تحويل من `markText` |

`studentCount` يعني إجمالي تلاميذ القسم، لا عدد الحاضرين. عند وجود total مع حاضر أو غائب، لا يزيد الجزء على total؛ وعند وجود الثلاثة يجب `present+absent=total`. لا اشتقاق لقيمة محذوفة أو إلزام الثلاثة؛ القيد في API وDB عندما تتوفر القيم. لا حقل رقمي لـ«لقب الآنسة» غير المقروءة يقينًا، ولا حقل إدخال للعبارات الإدارية/المادة/العنوان أو الإمضاء والختم؛ الأخيرة للطباعة اللاحقة فقط. `finalizedAt` يمثل وقت اعتماد التقرير وإصداره في المنصة، و`occurredAt` تاريخ وقوع الزيارة؛ لا يساوي أحدهما الآخر. لا يُجبر المفتش على ملء خانة مفقودة من مصدره. `Teacher` لا يتغير، و`Visit` يتطور في TASK-053A فقط.

**طبقة النتيجة المهنية حسب `Visit.visitType`:** `tenureConclusionText` تقبل قيمة فقط لـTENURE_CONFIRMATION، وتكون NULL في الأنواع الأخرى، بلا قائمة قانونية مغلقة أو استنتاج آلي. `pedagogicalMark Decimal? @db.Decimal(4,2)` حقل V1 جديد للترقية فقط، اختياري ويُدخل يدويًا؛ `0 <= pedagogicalMark <= 20` وبحد أقصى منزلتين عشريتين في الإدخال. تمثل 14 و14.0 و14.00 القيمة العددية نفسها. `markText` و`markWordsText` يبقيان للتمثيل النصي العام غير الترقية وفق ADR-034، ويكونان NULL في تقرير PROMOTION_EVALUATION V1 منعًا لمصدرَي علامة متعارضين؛ لا مساس بقيم تاريخية ولا تحويل لها. في الأنواع غير الترقية يكون `pedagogicalMark=NULL`، ولا يُعاد استخدام عقد الترقية تلقائيًا في TENURE_CONFIRMATION. لا حساب من المعايير، ولا مقارنة علامة سابقة غير موثوقة أو حفظ وسم «ثابت/تصاعدي/تنازلي». FINAL لا يفرض نتيجة التثبيت أو العلامة أو نقاط القوة أو الحضور.

## لقطات FINAL الجديدة

تكون كل اللقطات الجديدة NULL في DRAFT، تُملأ **من مصادر الخادم في معاملة الإتمام**، ولا تقبل من body أو تُعدّل بعد FINAL. NULL في FINAL مسموح للقيمة التي لا يوجد لها مصدر/كانت NULL؛ لا اختلاق. لقطات أسماء Inspector وTeacher الأربع القائمة إلزامية كما في ADR-012. لقطات V1 الجديدة:

| الحقل | مصدر الإتمام | النوع/الحد | ملاحظة |
|---|---|---|---|
| `finalizedTeacherBirthDateSnapshot` | `Visit.teacher.birthDate` | `Date? @db.Date` | تاريخ `YYYY-MM-DD` عند العرض |
| `finalizedTeacherPlaceOfBirthSnapshot` | `Visit.teacher.placeOfBirth` | `String?`, حد 150 | NULL إذا غير متوفر |
| `finalizedTeacherQualificationsSnapshot` | `Visit.teacher.qualifications` | `String?`, حد 1000 | NULL إذا غير متوفر |
| `finalizedDistrictNameSnapshot` | `Visit.district.name` | `String?` | اسم وقت الإتمام، لا يوم الزيارة؛ بلا افتراض حد لاسم District master |
| `finalizedInstitutionMunicipalitySnapshot` | `Visit.institution.municipality` | `String?`, حد 150 | NULL إذا غير متوفرة؛ من Institution الزيارة لا مؤسسة Teacher الحالية |

إذا حُدثت بيانات المصدر قبل الإتمام، اللقطة تمثل ما قرأته معاملة الإتمام فقط. يستخدم التنفيذ قفل/قراءة متسقة لصفوف Inspector/Teacher/District/Institution ذات الصلة بترتيب ثابت، ويتحقق من صلاحية Visit وrevision قبل تثبيت FINAL؛ لا لقطة هجينة تحت سباق تحديث المصدر. `Visit.institutionNameSnapshot` والسنة/الأوقات تُقرأ من Visit بعد FINAL؛ لا لقطة مكررة. قيم التقرير المحلية ثابتة أصلًا داخل FINAL وليست «لقطات من Teacher». لا PII في AuditLog. لا يستعمل العرض النهائي أي قيمة حية بديلة لهذه اللقطات.

## قاموس معايير Template V1

مصدر الحقيقة للقاموس **ثابت versioned داخل كود API**؛ تُعرض نسخة قراءة مصرح بها عبر endpoint القالب أدناه لتستخدمها UI بدل نسخة مكررة. ليس بيانات قابلة للتحرير أو seed متغيرًا. مفتاح المعيار ونسخة القالب يتحقق منهما الخادم؛ SQL CHECK يسمح مفاتيح V1 نفسها، ويختبر التطابق بين القائمتين عند migration/CI حتى لا ينجرف القاموس عن DB. ترتيب العرض من `sourceOrder` في القاموس، لا من body أو تاريخ الإدخال. كل `valueKind=OPTIONAL_SHORT_TEXT`: نص مفرد NFC/trim/اختزال فراغات، 1..200 Unicode code points بعد التطبيع، C0/C1/LF/TAB/Unicode line separators مرفوضة؛ `null`/غياب الإدخال يعني غياب صف، وليس إجابة «لا». لا قيم معيارية أو درجات أو boolean.

| # | sectionKey | criterionKey | التسمية العربية المعتمدة للمصدر |
|---:|---|---|---|
| 1 | `FACILITY_SAFETY` | `field_planning` | الميدان: التخطيط |
| 2 | `FACILITY_SAFETY` | `field_ground` | الميدان: الأرضية |
| 3 | `FACILITY_SAFETY` | `field_location` | الميدان: الموقع |
| 4 | `FACILITY_SAFETY` | `field_safety` | الميدان: السلامة |
| 5 | `PREPARATION_PLANNING` | `educational_unit_preparation` | الوحدة التعليمية (قسم التحضير) |
| 6 | `PREPARATION_PLANNING` | `annual_distribution_present_respected` | التوزيع السنوي: هل هو موجود ومحترم؟ |
| 7 | `PREPARATION_PLANNING` | `annual_official_guidance` | التوزيع السنوي: هل يعمل بتوجيهات البرنامج الرسمي؟ |
| 8 | `LESSON_PROGRESSION` | `educational_unit_lesson` | الوحدة التعليمية (قسم سير الحصة) |
| 9 | `LESSON_PROGRESSION` | `learning_progression` | التدرج في التعلم ومراحل الحصة |
| 10 | `LESSON_PROGRESSION` | `class_grouping` | تنظيم القسم (التفويج) |
| 11 | `LESSON_PROGRESSION` | `sports_attire` | العمل بالبدلة التربوية الرياضية |
| 12 | `LESSON_PROGRESSION` | `space_resources_use` | استغلال المساحة والوسائل التعليمية |
| 13 | `LESSON_PROGRESSION` | `lesson_application_present` | التطبيق على الدرس: هل هو موجود؟ |
| 14 | `LESSON_PROGRESSION` | `lesson_application_appropriate` | التطبيق على الدرس: هل هو مناسب؟ |
| 15 | `PEDAGOGICAL_SUPERVISION` | `explanation_presentation` | الشرح والعرض |
| 16 | `PEDAGOGICAL_SUPERVISION` | `correction_guidance` | التصحيح والتوجيه |
| 17 | `PEDAGOGICAL_SUPERVISION` | `organization_discipline` | التنظيم والانضباط |
| 18 | `PEDAGOGICAL_SUPERVISION` | `participation_activation` | تنشيط المشاركة |
| 19 | `PEDAGOGICAL_SUPERVISION` | `student_participation` | تقدير مشاركة التلاميذ |
| 20 | `PEDAGOGICAL_SUPERVISION` | `teaching_resources` | الوسائل التعليمية |
| 21 | `DOCUMENT_MONITORING` | `daily_notebook_use` | دفتر اليومي: هل هو مستعمل حسب التوجيهات التربوية؟ |
| 22 | `STUDENT_MONITORING` | `absences_monitored` | مراقبة أعمال التلاميذ: الغيابات، هل هي مراقبة؟ |
| 23 | `STUDENT_MONITORING` | `absences_recorded` | مراقبة أعمال التلاميذ: هل هي مسجلة باستمرار؟ |

الموضعان المطبوعان لـ«الوحدة التعليمية» يحتفظان بمفتاحين/موضعين منفصلين؛ النص بين القوسين توضيح UI للتمييز، لا اقتباس لعبارة إضافية من المصدر ولا معنى تقييم جديد. معيار «التوجيهات الرسمية» يصف سؤال الورقة فقط ولا يجيز استيراد مادة OFFICIAL أو حسم ADR-013.

## نموذج الملاحظة والقيود الفيزيائية

`InspectionReportObservation`: `id String @id @default(uuid()) @db.Uuid`, `reportId String @db.Uuid NOT NULL`, `reportType String NOT NULL DEFAULT INSPECTOR_VISIT`, `templateVersion Int NOT NULL DEFAULT 1`, `criterionKey String NOT NULL`, `valueText String NOT NULL`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`. `UNIQUE(reportId,criterionKey)`؛ FK مركب `(reportId,reportType,templateVersion)` إلى مفتاح فريد جديد `(InspectionReport.id,reportType,templateVersion)` مع `onDelete:Restrict,onUpdate:Restrict`، وCHECK child للنوع/الإصدار ومفاتيح V1 ولـ`char_length(valueText) BETWEEN 1 AND 200` و`btrim(valueText) <> ''`. بذلك لا تُلصق ملاحظة V1 بتقرير قديم. لا صف لقيمة فارغة. يُحذف صف معيار من DRAFT فقط إذا حُذف من full replacement؛ لا delete لصفوف FINAL من API، وإن كانت سياسة immutability عبر service/authorization مثل التقرير نفسه وليست trigger ضد كاتب DB مباشر. لا JSON حر أو تعديل ترتيب من العميل.

`InspectionReport` يحتفظ بالـPK/FK و`visitId` unique. Migration واحدة forward-only تضيف أعمدة V1 nullable، ومفتاح parent المركب، وجدول الملاحظات؛ تستبدل CHECK provenance بـallowlist زوجي حصري للنوع/المصدر مع version=1، لا كل تركيبة مستقلة. تُبقي CHECK status/revision وطول الحقول القديمة. توسّع lifecycle CHECK بحيث يبقى شرط DRAFT الحالي عامًا، ويشترط FINAL لكل نوع حقول الإتمام والأسماء الأربع و`levelClass/lessonTopic/inspectorConclusion`، وتكون كل لقطات V1 الجديدة NULL في DRAFT أو عند النوع القديم. CHECK آخر يفرض أعمدة V1 المحلية NULL للتقرير القديم، وحقول المرافقة الأربعة القديمة NULL للتقرير الجديد؛ لا يُطلب أن تمتلئ حقول V1 الاختيارية في FINAL. فحص Visit COMPLETED وثبات FINAL والـrevision وشروط التزامن المعقدة في service داخل transaction كما في TASK-052. تضاف قيود طول/نص غير فارغ لكل String جديد، وعدادات الحضور غير سالبة مع قيود الاتساق، و`pedagogicalMark NUMERIC(4,2)` nullable مع `CHECK (pedagogicalMark IS NULL OR pedagogicalMark BETWEEN 0 AND 20)`؛ وتتحقق الخدمة، لا CHECK عبر جدول آخر، أن العلامة NULL ما لم يكن `Visit.visitType=PROMOTION_EVALUATION` عند الكتابة والإتمام؛ لا يملك التقرير عمود visitType مستقلًا. لا يسمح API بأكثر من منزلتين؛ تحويل `NUMERIC(4,2)` قد يقرّب مدخلات SQL المباشرة قبل CHECK، لذا حماية precision على حدود API قبل التحويل، مع عدم ادعاء أن عمود NUMERIC يرفض تلقائيًا الإدخال المباشر ذا الدقة الزائدة. تُفرض `markText/markWordsText` NULL في V1 الترقية عبر الخدمة وتُختبر حدود النوع في اختبارات الخدمة/API والتكامل؛ لا تعديل Migration TASK-052 السابقة. اختبار upgrade يثبت أن كل صف قديم يمر بالقيود الجديدة دون backfill أو UPDATE. FK `finalizedByInspectorId` وFKs القائمة لا تتغير.

## API والعقد التشغيلي

المصادقة كما في TASK-052: Inspector ACTIVE صاحب Visit مع عضوية **حالية** في `Visit.districtId`، وCSRF لكل PUT/POST، `Cache-Control:no-store`، request ID/error envelope، 404 عام لخارج النطاق. لا حقول/أسماء/قيم تقرير في logs أو URL أو AuditLog. `GET /api/v1/report-templates/inspector-visit/v1` للمفتش ACTIVE المصادق عليه، `200 {data:{reportType:"INSPECTOR_VISIT",templateSource:"PRODUCT_OWNER_ADOPTED",templateVersion:1,criteria:[{criterionKey,sectionKey,sourceOrder,label,valueKind}]}}` مرتبة؛ بلا بيانات Visit/Teacher ولا mutation أو AuditLog. هذا هو قاموس UI الوحيد.

`GET /api/v1/visits/:id/report` يبقى مسار قراءة Report: `200 {data:{report:null}}` عند عدم وجوده، وإلا projection مميز بـ`reportType/templateSource/templateVersion`. إذا كان قديمًا **نفس إسقاط TASK-052 حرفيًا**. إذا V1 فالإسقاط يحوي base: `{id,visitId,reportType,templateSource,templateVersion,status,revision,levelClass,lessonTopic,pedagogicalObservations:null,strengths:null,improvementAreas:null,guidanceRecommendations:null,inspectorConclusion,finalizedAt,finalizedByInspectorId,finalizedInspectorNameSnapshot,finalizedInspectorSurnameSnapshot,finalizedTeacherNameSnapshot,finalizedTeacherSurnameSnapshot,createdAt,updatedAt,displayIdentity,visit}` بذات أنواع/دلالات TASK-052، وإضافة `inspectorVisitV1` فقط. داخله **حقول V1 المحلية الـ23 بالاسم والقيمة nullable كما في الجدول أعلاه**، ثم `observations:[{criterionKey:string,valueText:string}]` بترتيب القاموس، و`displayContext:{teacherBirthDate:string|null,teacherPlaceOfBirth:string|null,teacherQualifications:string|null,districtName:string|null,institutionMunicipality:string|null,visitType:<five values>}`. `displayContext.visitType` من Visit للقراءة فقط، وفي FINAL ثابت بقفل Visit type بعد وجود Report. بقية `displayContext` في DRAFT من Teacher/District/Institution الحاليين بما يلزم فقط، مع `Visit.institutionNameSnapshot` دائمًا؛ في FINAL من لقطات V1 فقط، مع null عند عدم توفر قيمة ولا fallback حي. `teacherBirthDate` تاريخ تقويمي `YYYY-MM-DD` لا UTC timestamp. ترتيب observations من القاموس، ولا أسماء معيار أو sourceOrder قادمان من DB؛ القاموس نفسه للواجهة. `inspectorVisitV1` غير موجودة في الرد القديم. لا يضيف هذا حقولًا/PII إلى إسقاطه.

`PUT /api/v1/visits/:id/report` يبقى حصريًا لعقد ADR-012 القديم وعلى زيارة تاريخية `visitType=NULL` بلا Report فقط عند الإنشاء؛ وجود V1 أو زيارة typed يمنع إنشاء legacy بـ`409 REPORT_TYPE_CONFLICT`. `PUT /api/v1/visits/:id/inspector-visit-report` ينشئ أو يحفظ V1 لزيارة typed، دون اختيار Report type من العميل. الجسم strict full replacement: الحقول المشتركة `expectedRevision,levelClass,lessonTopic,inspectorConclusion` وكائن `inspectorVisitV1` بجميع الحقول الـ23 في الجدول أعلاه، مع `observations:[{criterionKey,valueText}]`. كل مفاتيح الحقول مطلوبة؛ `null` يعني عدم إدخال قيمة اختيارية. `pedagogicalMark` يقبل سلسلة ASCII عشرية أو `null`: الجزء الصحيح من 0 إلى 20، ونقطة اختيارية يتبعها رقم أو رقمان. يتحقق API من المجال الشامل 0..20 ومن ألا تتجاوز الدقة منزلتين قبل التحويل إلى Decimal دقيق؛ يرفض السالب وغير الرقمي وexponent والفاصل المحلي والدقة الزائدة. القيم 14 و14.0 و14.00 متساوية ولا تفرض أصفارًا لاحقة. لا يمر الإدخال عبر floating point. GET يعيد القيمة كسلسلة عشرية canonical أو null. لا تقبل قيمة غير null إلا في PROMOTION_EVALUATION، وفي تقرير الترقية تبقى `markText/markWordsText` null؛ وإلا `400 VALIDATION_ERROR` آمن. لا يشترط الحقل عند FINAL. observations الفارغة تعني غياب القيم؛ ترفض المفاتيح الزائدة/المكررة والمعايير المجهولة أو المكررة أو حقول snapshot/visitType وأي قيمة نصية فارغة برسالة حقول عامة بلا صدى. إنشاء التقرير الأول يستخدم expectedRevision null ويرد 201 مع DRAFT revision 1؛ التعارضات ترد 409. تحديث DRAFT الموافق revision يرد 200؛ FINAL أو Visit CANCELLED لا يقبل التعديل. no-op لا يغير revision أو updatedAt ولا يكتب AuditLog؛ التغيير الفعلي يزيد revision مرة ويحدث التقرير وملاحظاته في transaction واحدة. PLANNED وCOMPLETED يسمحان بالمسودة وفق العقد القائم.

`POST /api/v1/reports/:id/finalize` يبقى بجسم strict `{expectedRevision:<positive integer>}` و`200 {data:{report:<type-aware projection>}}`. يختار الخادم تحقق النوع. لـV1 يلزم DRAFT، Visit `COMPLETED`، `levelClass`,`lessonTopic`,`inspectorConclusion` غير NULL وغير فارغة، وهوية Inspector المهنية المكتملة وTeacher name/surname القائمة؛ لا يُطلب معيار أو قيمة ورقية أخرى. يثبت `finalizedAt/by` والأسماء الأربع واللقطات V1 في المعاملة مع تحديث مشروط على revision واحد؛ لا تغيير Visit. يضيف الحدث الحالي `INSPECTION_REPORT_FINALIZED`, `entityType=InspectionReport`, `entityId=report.id`, `districtId=visit.districtId`, `metadata={}` مع actor/requestId من الخادم **في المعاملة نفسها**. فشل AuditLog يرجع FINAL ولقطاته/child writes؛ لا حدث آخر ولا نص/علامة/PII في metadata. النهائي read-only بلا PUT أو إعادة إتمام/حذف/نسخ. `GET/POST /reports/:id/follow-ups` يبقيان يعملان لكل FINAL، دون تعديل schema أو إرجاع نص التقرير في رد المتابعة.

الأخطاء القديمة `400 VALIDATION_ERROR`, `404` عام, `409 REPORT_STATE_CONFLICT`, `409 REPORT_REVISION_CONFLICT`, `409 INSPECTOR_PROFESSIONAL_IDENTITY_REQUIRED` باقية. الجديد فقط `409 REPORT_TYPE_CONFLICT` لمحاولة الكتابة عبر مسار نوع مخالف؛ لا كشف نوع تقرير خارج النطاق، لأن authorization يسبق فحص النوع. إنشاءان متزامنان لنفس Visit (بأي نوع) يفوز أحدهما بقيد unique ويخسر الآخر 409 مناسب بلا إعادة تلقائية. تحديثان بنفس revision أو إتمامان: فائز واحد، 409 ثابت للخاسر، AuditLog إتمام واحد ولقطات غير جزئية. مقارنة/قفل source rows وترتيبها يعيدان استعمال أسلوب TASK-052، مع إضافة District/Institution للقطات؛ لا body logging أو stack/DB details أو تقرير prose في الأخطاء.

## واجهة RTL والاختبارات والبوابات

المسار الحالي `/app/visits/:id/report` باقٍ. GET يحدد إن كان التقرير قديمًا أو V1، فيفتح المحرر الصحيح. إذا `report:null` وVisit جديدة ذات `visitType` معروف وغير CANCELLED، تفتح الواجهة V1 دون اختيار نوع Report؛ إذا Visit تاريخية `visitType=NULL` بلا تقرير، يبقى مسار المرافقة القديم فقط. إذا كان تقرير قائمًا فلا تبديل للنوع أو إنشاء ثانٍ. تعرض V1 `visitType` للقراءة فقط من Visit. أقسام V1 بترتيب المصدر: (1) هوية الزيارة والتقرير، (2) بيانات الأستاذ المهنية والحضور، (3) ظروف التفتيش/سياق الحصة، (4) التحضير/التخطيط، (5) صلاحية الميدان/السلامة، (6) التدرج ومراحل الحصة، (7) تقدير الإشراف التربوي، (8) الدفتر اليومي، (9) مراقبة أعمال التلاميذ، (10) نقاط القوة/جوانب التحسين والإرشادات التربوية، (11) الخلاصة/النتيجة المهنية الملائمة للنوع/التقدير العام/العلامة. بيانات Visit/Teacher/Institution/District الموثوقة للقراءة؛ خانات التقرير الاختيارية قابلة للإدخال؛ كل معيار مفتاح/label من القاموس وshort text، لا مربعات درجات/تقييم. لا يُعرض UUID أو نص تقني. يحفظ المستخدم صراحة بلا autosave؛ تحذير بيانات غير محفوظة عند التنقل، لا إسقاط صامت عند 409، تحديث يدوي/إعادة مراجعة؛ إتمام بتأكيد يشرح الثبات، FINAL للقراءة فقط. loading/empty/error/success، validation عربية، focus/keyboard/200% zoom، desktop/tablet/mobile وفق design tokens، `lang=ar dir=rtl`. لا print preview أو stylesheet/PDF/A4 في TASK-054.

Migration **واحدة** جديدة بعد HEAD الحالي، بلا تعديل migration قديمة، clean chain + upgrade من HEAD على PostgreSQL اختبار معزول. DB tests: القديم DRAFT/FINAL وFollowUps ثابتون؛ الزوجان فقط للنوع/المصدر، limits/CHECK/status/revision، V1-only child وFK/uniqueness/unknown keys، text bounds والحضور وNUMERIC(4,2)/range ورفض أكثر من منزلتين في API، nullable V1 fields وFINAL minimum واللقطات، صفر backfill. API: auth/CSRF/scope/404، draft null/full replacement/remove/no-op، Unicode/NFC/strict/unknown/wrong-version، type conflict، سباقي update/finalize وfirst-create across types، atomic audit/rollback/privacy وimmutable FINAL، FollowUp من V1. UI: النوع القديم لم ينكسر، نوع Visit مشتق بلا اختيار Report، أقسام المصدر 23 معيارًا، derived vs editable، dirty state/conflict، RTL/a11y/responsive، FINAL read-only. Connected Chromium E2E على API/Vite/DB معزولة: Visit COMPLETED typed → V1 → DRAFT → إدخال معايير/حفظ → FINAL → إعادة تحميل ثابتة → FollowUp OPEN → إكمال → جميع قيم تقرير V1 واللقطات والحدث الأصلي لم تتغير. شغّل regressions TASK-052/053/G5، `typecheck/lint/tests/build`, DB integration, connected E2E, `git diff --check`؛ لا Production/5432/remote. الطباعة لاحقًا في مهمة مستقلة محددة مع TASK-072/G7، تحفظ بنية الرأس/الصفحتين والمواضع الورقية دون تنفيذها هنا.
