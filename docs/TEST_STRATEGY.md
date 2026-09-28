# Test Strategy v0.1

تحدد [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) الحد الأدنى لكل مهمة؛ لا تختبر تفاصيل داخلية بلا قيمة. Unit بـVitest لقواعد النطاق، API integration على PostgreSQL اختبار معزول، Playwright لمسارات حرجة بمتصفح حقيقي. اختبارات SQL/migrations على قاعدة اختبار لا production. Fixtures اصطناعية فقط، لا بيانات شخصية حقيقية.

| مستوى | تحقق حرج |
|---|---|
| Unit | تطبيع البحث/مرشحات التكرار دون merge؛ مجموع النصاب حسب التاريخ؛ صلاحية فترات الإسناد؛ تداخل slots؛ transitions للطلب/الزيارة/التقرير؛ schema المقترحات حسب kind |
| Integration | 202 public receipt بلا تسريب؛ rate limit/CSRF/auth؛ قبول واحد فقط عند طلبين متزامنين مع Teacher وAuditLog؛ رفض/مراجعة بلا Teacher؛ فحص ownership/district لكل query/mutation؛ pagination/filtering؛ قيود FK/transactions؛ migration clean+upgrade |
| E2E | تسجيل المفتش؛ إرسال عام ثم مراجعة واعتماد؛ أستاذ بمؤسستين ونصاب صحيح؛ البحث الثلاثاء صباحًا؛ زيارة→تقرير→متابعة؛ proposal إنشاء/تعديل/نسخ/أرشفة/طباعة؛ MemoTemplate مستقل عن زيارة |
| UI/print | RTL وkeyboard/focus/error/loading/empty، desktop/tablet/mobile، 200% zoom؛ A4 متعدد الصفحات وعربية وأرقام/PDF browser preview |
| Ops | logs بلا PII، session revoke، restore test قبل النشر، health check، migration gate منفصل |

عند كل task: tests الخاصة به، typecheck، lint، build عند تغير wiring، regression مرتبط بالموديول. Gate المرحلي يتطلب الأدلة لا مجرد نجاح الأمر. لا يجري اختبارات إنتاج أو migrations عليه في هذه المرحلة.
