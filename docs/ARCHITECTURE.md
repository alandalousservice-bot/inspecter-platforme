# Architecture v0.1

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

`inspector UI → authenticated API → domain service + policy check → Prisma → PostgreSQL`؛ الاستعلامات والتصفية والتجميع على الخادم. الوحدات: identity/district؛ intake؛ teacher/institution/assignment؛ schedule؛ visit/report/follow-up؛ pedagogy reference؛ inspector proposals؛ dashboard/read models؛ files/print؛ audit. كل وحدة تملك قواعدها؛ يجوز API مشترك دون وصل نماذج الواجهة مباشرة بقاعدة البيانات. الوثائق الرسمية read-only/reference ولا تتحول إلى اقتراحات إلا بنسخة منفصلة ذات provenance. نموذج LessonMemoTemplate داخل proposals، بلا FK إلى زيارة أو تقرير.

## أمن وتطور

تُفرض حدود المقاطعة وملكية المستند على الخادم، وليس بإخفاء الأزرار. endpoint العام محدود المعدل، يحمي من spam، يقلل البيانات في الرد، ولا يكشف وجود أستاذ أو مرشح مكرر. mutations محمية من CSRF عند اعتماد cookie. الملفات تُفحص نوعًا وحجمًا وتُخزن خاصة وتُخدم بروابط قصيرة العمر؛ تفعيل الرفع مؤجل حتى وجود حاجة ملموسة. النسخ الاحتياطية والاستعادة واختبارها شرط نشر. كل تعديل حساس يسجل AuditLog في نفس المعاملة عند الإمكان. سجلات التطبيق لا تحتوي بيانات شخصية. Offline لاحقًا يحتاج سياسة conflict/version مستقلة؛ UUID وتواريخ تعديل قابلة للاستخدام مستقبلًا، دون تنفيذ مزامنة الآن.

AuditLog سجل تدقيق للأفعال التي يتطلب عقدها التسجيل، منفصل عن سجلات تشغيل التطبيق والتحليلات وtelemetry. خدمة append تأخذ Prisma transaction client من العملية؛ فشل إضافة حدث مطلوب يُرجع mutation معها. payload محدود بمخطط الحدث ويستبعد الأسرار والبيانات الشخصية المعتادة. الإضافة فقط مضمونة عبر الخدمة، لا ضد الكتابة المباشرة بامتيازات DB؛ سياسة الاحتفاظ والحذف تبقى ضمن ADR-014 OPEN. [ADR-025](DECISIONS.md#adr-025--auditlog-event-payload-and-append-contract).

## قرار الترتيب


تقدم audit وDesign System وأمن الجلسات على توسع الشاشات. يسبق audit log عمليات القبول. تأتي أساسيات الطباعة مع أول وثيقة تحتاجها، ويُستكمل PDF لاحقًا. خطة التنفيذ الدقيقة في [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md).
