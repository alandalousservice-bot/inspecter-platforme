# Architecture v0.1

## Current product evolution — ADR-041 (2026-10-05)

The explicitly confirmed comprehensive Product Vision supersedes the original **no Teacher account** and **Inspector-entered timetable** assumptions. Original Master remains an immutable historical requirements artifact; no wholesale architecture replacement. [Current evolution contract](architecture/PRODUCT_EVOLUTION_2026.md) defines the precise changes; older task descriptions below retain their historical context.

React/Vite, Express modular monolith, PostgreSQL/Prisma, Zod, existing Inspector authentication, district policy and append service remain shared. `teacher-portal` is a bounded API module, not another backend/database. Separate TeacherAccount/TeacherSession credentials, role-specific CSRF and `/teacher` UX grant only own-resource access. Never infer Inspector authority from a Teacher session or mutable contact email. Public intake stays a declaration channel; manual Inspector acceptance and separate identity-confirmed invitation are prerequisites to onboarding.

Typed proposals separate self-service declarations from current professional/institutional data. Accept/reject, canonical mutation and minimal audit run in one Prisma transaction under Teacher locks and revision/baseline checks. Photo metadata and private storage remain separate from professional fields. sharp 0.35.5 is the bounded native PNG/JPEG decoding/re-encoding adapter; bytes/decoded pixels/dimensions/time are bounded, orientation normalized and EXIF/GPS/other metadata discarded before storage. Only sanitized-version output is served; no raw-asset backfill. Local private filesystem adapter is the initial implementation of ADR-009's provider-neutral interface, **not a public directory**; outside-repository absolute `PRIVATE_ASSET_DIR`, operator-restricted ACLs, no-store authenticated serving, and fail-closed when missing. S3/provider deployment is not implemented.

Timetable initial Teacher submission writes canonical immediately. Independent later update → SUBMITTED proposal; Inspector correction REQUESTED → Teacher replacement SUBMITTED. Both origins share ScheduleCorrection, explicit ACCEPTED/REJECTED with required rejection reason, revision locks, history and atomic minimal audit. Canonical changes only upon successful acceptance; invalid/stale acceptance returns safe 409, explicit rejection closes it without revalidating old workplaces. ALL legacy Inspector writes are closed regardless of TeacherAccount; reads/review remain. No exceptional override is invented. Prospective visit eligibility checks do not reinterpret history. Transfer approval from the originating Inspector does not activate transfer or widen access; ADR-017's receiving authority/history policy remains OPEN.

Operational alerts are bounded read models from pending proposals/corrections, not a generic messaging/notification platform. Geography derives existing Institution municipality text; no official administrative registry or map/geocoding dependency. Dossier history is a recent ID/action/time projection, not fabricated professional events. Migration rollout to persistent UAT or production requires a separate explicit operator action; comprehensive test schemas are owned and disposable.

العقود التابعة: [DATABASE](DATABASE.md)، [API](API_CONTRACTS.md)، [UI](UI_MAP.md)، [DECISIONS](DECISIONS.md). سجل إعادة الاستخدام: [TASK-000](audits/ARENASPEX_REUSE_AUDIT.md).

## البدائل والاختيار

| خيار | ميزة | تكلفة/خطر | القرار |
|---|---|---|---|
| React + Vite SPA / Express API منفصلان | API واضحة للأجهزة مستقبلًا، نشر مستقل | إعداد طبقتين وauth/CORS | المفضل |
| Next.js monolith | بدء سريع، SSR | اقتران أكبر بمسارات الويب ونشر خاص؛ SSR قليل الفائدة لبيانات المفتش الداخلية | غير مفضل |
| Django + React | Backend ناضج | لغتان وخط أنابيب تنفيذ أعقد لفريق Codex صغير | غير مفضل |

Stack المفضل: TypeScript؛ React + Vite + React Router للواجهة؛ Express API بنمط modular monolith؛ PostgreSQL؛ Prisma ORM/migrations؛ Zod للتحقق عند حدود الطلب؛ Inspector auth ببريد/كلمة مرور، hash آمن وجلسة خادمية قابلة للإبطال في cookie `HttpOnly/Secure/SameSite`؛ فحص صلاحية بالـdistrict وملكية الموارد على الخادم لكل endpoint؛ ملفات خاصة في object storage متوافق S3 عبر adapter (بدون اختيار مزود)؛ طباعة HTML/CSS A4 أولًا، PDF عبر browser Save as PDF مع تمثيل مطبوع ثابت؛ Vitest/unit + API integration + Playwright E2E؛ structured logs مع request ID وحذف البيانات الحساسة؛ نشر container أو Node service على Render أو مماثل، PostgreSQL مُدار وmigrations في release job منفصل.

السبب: TypeScript وعقود Zod مشتركة بين الواجهة والخادم؛ API مستقلة يمكن أن تستخدمها لاحقًا واجهات Windows/Mobile؛ modular monolith يقلل التشغيل والتنسيق في MVP. لا microservices أو offline sync الآن. لا يرتبط Runtime بـArenaSPEX. لا تُثبت إصدارات المكتبات حتى التنفيذ.

## حدود الوحدات والتدفق

`public form → intake API → TeacherSubmission PENDING → inspector review → transaction creates Teacher/decision/audit`.

Public intake هو قناة جمع أولية scoped بمقاطعة المسار؛ بياناته غير متحقق منها ولا تنشئ Teacher أو Institution أو Assignment قبل قرار المفتش. تحفظ أسماء المؤسسات كتصريحات نصية فقط، ولا تكشف route العام PII أو duplicate candidates أو حالة الطلب؛ قرار المفتش ينشئ Teacher عند القبول لاحقًا. حماية abuse تشمل strict validation وحدود إدخال وrate limiting configurable. [ADR-015](DECISIONS.md#adr-015--public-teacher-intake-fields-and-handling).

TASK-030 يفترض نسخة API واحدة؛ محدد المعدل في الذاكرة (10 طلبات/IP/15 دقيقة) يُصفّر عند إعادة التشغيل. قبل نشر عدة نسخ يلزم محدد معدل مشترك أو موثوق على الحافة؛ لا Redis في MVP. في production يُضبط `TRUSTED_CLIENT_IP_SOURCE=cloudflare` ويُستخدم `CF-Connecting-IP` فقط مع قصر الوصول على ingress الموثوق؛ `X-Forwarded-For` غير موثوق. التفاصيل في [API](API_CONTRACTS.md#public-teacher-intake-task-030).

`inspector UI → authenticated API → domain service + policy check → Prisma → PostgreSQL`؛ الاستعلامات والتصفية والتجميع على الخادم. الوحدات: identity/district؛ intake؛ teacher/institution؛ schedule؛ visit/report/follow-up؛ pedagogy reference؛ inspector proposals؛ dashboard/read models؛ files/print؛ audit. كل وحدة تملك قواعدها؛ يجوز API مشترك دون وصل نماذج الواجهة مباشرة بقاعدة البيانات. مجال schedule مستقل عن رابط المؤسسة الحالية وفق [ADR-030](DECISIONS.md#adr-030--weekly-schedule-mvp-contract)، ويستخدم `Africa/Algiers` للتفسير التشغيلي لليوم/الساعة دون timezone لكل slot. الوثائق الرسمية read-only/reference ولا تتحول إلى اقتراحات إلا بنسخة منفصلة ذات provenance. نموذج LessonMemoTemplate داخل proposals، بلا FK إلى زيارة أو تقرير.

ضمن وحدة visit/report/follow-up، يضيف [ADR-034](DECISIONS.md#adr-034--product-owner-adopted-inspector-visit-report-template) نوع تقرير زيارة مستقلًا داخل `InspectionReport` ذي القالب المرقّم، مع بقاء تقارير ADR-012 وFollowUps الحالية كما هي. [TASK-054](architecture/TASK_054_INSPECTOR_VISIT_REPORT_V1.md) تفصّل عقد تنفيذه لاحقًا دون بناء نظام تقارير موازٍ. اعتماد نموذج المنصة لا يثبت مصدرًا وزاريًا ولا يغيّر ADR-013/TASK-060؛ الطباعة A4 للقالب مهمة لاحقة مستقلة، دون توقيع رقمي.

[ADR-035](DECISIONS.md#adr-035--pedagogicalvisit-type-and-retrospective-exceptional-visit) يفصل سبب الزيارة (`PedagogicalVisit.visitType`) عن نوع التقرير وإصداره، ويُدخل نوع الزيارة في TASK-053A قبل TASK-054. V1 تقرير مشترك للأنواع الخمسة مع طبقة نتيجة مهنية محدودة حسب النوع، لا خمسة جذور تقارير ولا JSON غير منظم. لا تتغير تقارير FINAL أو FollowUps القديمة، ولا تُعد زيارة استثنائية ماضية زيارة مجدولة؛ الفترة الفعلية منفصلة. دقة علامة الترقية الاختيارية 0..20 حُسمت بمنزلتين عشريتين كحد أقصى وتخزين Decimal دقيق؛ يبدأ التقرير فقط بعد إتمام وقبول TASK-053A.

## أمن وتطور

تُفرض حدود المقاطعة وملكية المستند على الخادم، وليس بإخفاء الأزرار. endpoint العام محدود المعدل، يحمي من spam، يقلل البيانات في الرد، ولا يكشف وجود أستاذ أو مرشح مكرر. mutations محمية من CSRF عند اعتماد cookie. الملفات تُفحص نوعًا وحجمًا وتُخزن خاصة وتُخدم بروابط قصيرة العمر؛ تفعيل الرفع مؤجل حتى وجود حاجة ملموسة. النسخ الاحتياطية والاستعادة واختبارها شرط نشر. كل تعديل حساس يسجل AuditLog في نفس المعاملة عند الإمكان. سجلات التطبيق لا تحتوي بيانات شخصية. Offline لاحقًا يحتاج سياسة conflict/version مستقلة؛ UUID وتواريخ تعديل قابلة للاستخدام مستقبلًا، دون تنفيذ مزامنة الآن.

AuditLog سجل تدقيق للأفعال التي يتطلب عقدها التسجيل، منفصل عن سجلات تشغيل التطبيق والتحليلات وtelemetry. خدمة append تأخذ Prisma transaction client من العملية؛ فشل إضافة حدث مطلوب يُرجع mutation معها. payload محدود بمخطط الحدث ويستبعد الأسرار والبيانات الشخصية المعتادة. الإضافة فقط مضمونة عبر الخدمة، لا ضد الكتابة المباشرة بامتيازات DB؛ سياسة الاحتفاظ والحذف تبقى ضمن ADR-014 OPEN. [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

## Institution location proposal evolution (ADR-040)

Canonical location is Institution-owned; TeacherSubmission may hold only an untrusted HOME Institution proposal. Manual entry only; supplementary proposals and browser geolocation deferred. Existing submission acceptance and explicit Institution resolution/linking precede a separate proposal approval transaction. No Teacher/device/tracking coordinates or automatic matching. Proposal decision, canonical mutation and required audit append are atomic under existing transaction conventions, with stale canonical overwrite protection. [TASK-077 contract](architecture/TASK_077_INSTITUTION_LOCATION_PROPOSAL.md) centralizes persistence, boundaries and privacy. ADR-039 remains the historical TASK-076A baseline; its unimplemented rendering direction is prospectively superseded: no in-platform maps, only future explicit external Google Maps directions from canonical coordinates. No implementation in TASK-077A and no change to ADR-038 import semantics or ADR-014 retention.

## قرار الترتيب


تقدم audit وDesign System وأمن الجلسات على توسع الشاشات. يسبق audit log عمليات القبول. تأتي أساسيات الطباعة مع أول وثيقة تحتاجها، ويُستكمل PDF لاحقًا. خطة التنفيذ الدقيقة في [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md).
