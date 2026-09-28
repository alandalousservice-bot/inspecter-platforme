# Codex Rules v0.1 — executor contract

Prompt اليومي: «نفذ TASK-XXX وفق [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md) والتزم بـ[CODEX_RULES](CODEX_RULES.md).» اقرأ صف المهمة فقط والمتطلبات المشار إليها، ثم الملفات المعنية فعليًا. لا يحتاج Master كاملًا لكل Task؛ هو مرجع أعلى عند تعارض الوثائق أو غموض قرار مؤثر.

## مسار القراءة الأدنى

| نوع المهمة | اقرأ |
|---|---|
| كل مهمة | صف task، هذا الملف، [DECISIONS](DECISIONS.md) للقرارات ذات الصلة |
| bootstrap/infrastructure/auth | [ARCHITECTURE](ARCHITECTURE.md)، [API](API_CONTRACTS.md) عند route |
| schema/migration/domain | [DATABASE](DATABASE.md)، [ARCHITECTURE](ARCHITECTURE.md) للحدود، [API](API_CONTRACTS.md) إن عُدّل contract |
| API/validation | [API](API_CONTRACTS.md)، [DATABASE](DATABASE.md) للكيانات المعنية |
| UI | [UI_MAP](UI_MAP.md)، [DESIGN_SYSTEM](DESIGN_SYSTEM.md)، [API](API_CONTRACTS.md) لشاشتها |
| pedagogy/proposals | [PROJECT](PROJECT.md)، أجزاء المرجع/المقترح من [DATABASE](DATABASE.md) و[API](API_CONTRACTS.md)، [DESIGN_SYSTEM](DESIGN_SYSTEM.md) إن UI |
| print/PDF | [DESIGN_SYSTEM](DESIGN_SYSTEM.md)، [UI_MAP](UI_MAP.md)، [API](API_CONTRACTS.md) للمصدر |
| reuse from ArenaSPEX | [audit](audits/ARENASPEX_REUSE_AUDIT.md) والملفات المحددة فقط؛ اقرأ الترخيص قبل أي نقل |

## قواعد ملزمة

- نفّذ Scope وAcceptance Criteria فقط؛ لا تضف feature أو dependency دون حاجة موثقة في المهمة، ولا تغيّر وحدات سليمة لأجل أسلوب. لا mock data في production path.
- Contracts في docs مركزية. إذا لزم تغيير Architecture/API/DB/UI contract أو قرار OPEN مؤثر: **STOP → BLOCKED → request architecture decision**. لا تعديل صامت للوثائق أو الكود لتجاوز العقد. التفاصيل المحلية غير المؤثرة متروكة للمنفذ.
- لا تفترض teacher user أو schoolId وحيد، ولا حقولًا رسمية للتقرير/المنهاج/المذكرة غير موثقة. لا تنسخ ArenaSPEX أو تستخدمه runtime؛ أي نقل لاحق يحتاج تدقيق ترخيص وتبعيات واختبارات وقرار واضح.
- كل route يطبق validation وauthorization وdistrict/owner scope على الخادم؛ كل mutation حساس يسجل audit حيث ينطبق. لا تكشف PII في logs/errors، لا تخزن أسرارًا في git. لا تعدل Schema خارج task؛ migrations تتبع سياسة [DATABASE](DATABASE.md) وتراجع قبل التشغيل.
- كل شاشة تستخدم [DESIGN_SYSTEM](DESIGN_SYSTEM.md) من أول مكون؛ لا palette/theme خاص. لا تكسر API قائمة، وإذا احتاج تغييرًا متوافقًا وثّقه واختبره.
- Definition of Done: acceptance criteria، اختبارات [TEST_STRATEGY](TEST_STRATEGY.md) المناسبة، typecheck/lint/build حسب أثر التغيير، migration check عنده، auth/validation وRTL/print عندها، مراجعة regression، ثم ملخص الملفات والنتائج والقيود. لا تعلن COMPLETE على فشل gate.
