# UI Map v0.1

جميع شاشات المفتش authenticated وباتجاه RTL وفق [DESIGN_SYSTEM](DESIGN_SYSTEM.md). paths مقترحة ثابتة للـMVP؛ تغييرها قرار عقد. كل شاشة بيانات لها loading skeleton، empty مع إجراء مناسب، error مع retry، success feedback بعد mutation. Query filters في URL حيث يفيد الرجوع والمشاركة الداخلية، دون بيانات حساسة فيه.

| Route | الشاشة والغرض | API الأساسي |
|---|---|---|
| `/public/d/:districtId/register` | نموذج تقديم الأستاذ، تحقق وتسليم receipt محايد | POST public submissions |
| `/login` | دخول المفتش، فشل آمن | auth |
| `/app` | Dashboard: KPIs، طلبات معلقة، زيارات قادمة، متابعة، نشاط حديث، إجراءات سريعة؛ رسم فقط عند بيانات مفيدة | dashboard summary |
| `/app/submissions` | قائمة قراءة للمفتش مع فلترة الحالة والبحث ومؤشر تشابه محتمل وتصفح | submissions (TASK-032) |
| `/app/submissions/:id` | عرض البيانات المعلنة وملخص المرشحات والقرار؛ بعد القبول رابط ملف Teacher من `acceptedTeacherId` المصرح، دون تغيير رد القرار | submission detail (TASK-032); decision UI (TASK-033/034); link (TASK-035) |
| `/app/teachers` | بحث متعدد المعايير وجدول عملي لـ180+ أستاذ؛ TASK-044/045 لاحقًا لا TASK-035 | teachers |
| `/app/teachers/:id` | TASK-035: ملف مهني حالي بعرض/تحرير صريح للهوية والاتصال والمهنة، الحالة read-only، وتصريحات المؤسسة الأصلية بوسم «معلومات صرّح بها المرسل—غير معتمدة»؛ الإسنادات والزيارات والتاريخ التشغيلي لاحقًا | GET/PATCH teacher profile؛ accepted submission declarations للقراءة فقط |
| `/app/institutions` | قائمة ومحرر المؤسسة | institutions |
| `/app/teachers/:id/assignments` | تحرير إسنادات بفترات وحساب النصاب | assignments |
| `/app/teachers/:id/schedules` | جدول أسبوعي structured، عرض/تحرير نسخة | schedules/slots |
| `/app/visits` و`/app/visits/:id` | تخطيط زيارة وتفاصيلها الهيكلية | visits |
| `/app/reports/:id` | مسودة تقرير/اعتماد وطباعة، لا نموذج رسمي مفترض | reports/follow-ups |
| `/app/reference` | مكتبة مصادر موثقة ومستويات/ميادين/كفاءات/أهداف | reference |
| `/app/proposals` | قائمة مع نوع/حالة/نسخ/أرشفة، ووسم مقترح ظاهر | proposals |
| `/app/proposals/:id` | محرر بحسب النوع: مقطع، مخطط سنوي، توزيع سنوي، أو نموذج مذكرة للأساتذة؛ حفظ revision ونسخ وطباعة | proposal/revisions |
| `/app/follow-ups` | تنبيهات ومهام متابعة | follow-ups |
| `/app/activity` | سجل نشاط مصرح ومخفف البيانات | audit-events |
| `/app/print/:kind/:id` | نسخة طباعة A4 ذات عنوان ونوع/مصدر واضح | resource snapshot |

النموذج العام لا يعطي بحثًا عن أستاذ ولا حالة قبول؛ رسالة الإرسال لا تثبت وجود سجل. قائمة Teacher ليست frontend-only filter. على الهاتف تتحول الجداول إلى عرض سجلات قابل للتصفح مع فلاتر قابلة للفتح، بينما desktop يحتفظ بكثافة الأعمدة. MemoTemplate لا يظهر كجزء من زيارة/تقرير. شاشات التكوين والحضور مؤجلة حتى قرارات المنتج.

TASK-035 يستخدم عرضًا افتراضيًا ثم وضع تحرير صريحًا مع حفظ/إلغاء؛ الإلغاء يهمل المسودة، والحفظ يمنع الإرسال المكرر وينتظر رد الخادم قبل تحديث العرض. أقسام الملف: الهوية، معلومات الاتصال، المعلومات المهنية، وتصريحات المؤسسة الأصلية للقراءة فقط؛ حالة Teacher بتسمية عربية غير قابلة للتعديل. loading/error/empty/success وحقول بأسماء ورسائل عربية واضحة، focus/keyboard وRTL/responsive وفق Design System؛ خطأ 404 عام، وخطأ الجلسة آمن، وأخطاء الحقول دون عرض تفاصيل تقنية. لا روابط حساب أستاذ أو محرر Assignment/زيارة/تدريب أو قائمة Teacher ضمن TASK-035.
