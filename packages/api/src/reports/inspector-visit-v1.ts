export const INSPECTOR_VISIT_REPORT_TYPE = 'INSPECTOR_VISIT' as const;
export const INSPECTOR_VISIT_TEMPLATE_SOURCE = 'PRODUCT_OWNER_ADOPTED' as const;
export const INSPECTOR_VISIT_TEMPLATE_VERSION = 1 as const;

export const inspectorVisitV1Criteria = [
  { criterionKey: 'field_planning', sectionKey: 'FACILITY_SAFETY', sourceOrder: 1, label: 'الميدان: التخطيط', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'field_ground', sectionKey: 'FACILITY_SAFETY', sourceOrder: 2, label: 'الميدان: الأرضية', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'field_location', sectionKey: 'FACILITY_SAFETY', sourceOrder: 3, label: 'الميدان: الموقع', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'field_safety', sectionKey: 'FACILITY_SAFETY', sourceOrder: 4, label: 'الميدان: السلامة', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'educational_unit_preparation', sectionKey: 'PREPARATION_PLANNING', sourceOrder: 5, label: 'الوحدة التعليمية (قسم التحضير)', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'annual_distribution_present_respected', sectionKey: 'PREPARATION_PLANNING', sourceOrder: 6, label: 'التوزيع السنوي: هل هو موجود ومحترم؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'annual_official_guidance', sectionKey: 'PREPARATION_PLANNING', sourceOrder: 7, label: 'التوزيع السنوي: هل يعمل بتوجيهات البرنامج الرسمي؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'educational_unit_lesson', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 8, label: 'الوحدة التعليمية (قسم سير الحصة)', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'learning_progression', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 9, label: 'التدرج في التعلم ومراحل الحصة', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'class_grouping', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 10, label: 'تنظيم القسم (التفويج)', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'sports_attire', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 11, label: 'العمل بالبدلة التربوية الرياضية', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'space_resources_use', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 12, label: 'استغلال المساحة والوسائل التعليمية', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'lesson_application_present', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 13, label: 'التطبيق على الدرس: هل هو موجود؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'lesson_application_appropriate', sectionKey: 'LESSON_PROGRESSION', sourceOrder: 14, label: 'التطبيق على الدرس: هل هو مناسب؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'explanation_presentation', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 15, label: 'الشرح والعرض', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'correction_guidance', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 16, label: 'التصحيح والتوجيه', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'organization_discipline', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 17, label: 'التنظيم والانضباط', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'participation_activation', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 18, label: 'تنشيط المشاركة', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'student_participation', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 19, label: 'تقدير مشاركة التلاميذ', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'teaching_resources', sectionKey: 'PEDAGOGICAL_SUPERVISION', sourceOrder: 20, label: 'الوسائل التعليمية', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'daily_notebook_use', sectionKey: 'DOCUMENT_MONITORING', sourceOrder: 21, label: 'دفتر اليومي: هل هو مستعمل حسب التوجيهات التربوية؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'absences_monitored', sectionKey: 'STUDENT_MONITORING', sourceOrder: 22, label: 'مراقبة أعمال التلاميذ: الغيابات، هل هي مراقبة؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
  { criterionKey: 'absences_recorded', sectionKey: 'STUDENT_MONITORING', sourceOrder: 23, label: 'مراقبة أعمال التلاميذ: هل هي مسجلة باستمرار؟', valueKind: 'OPTIONAL_SHORT_TEXT' },
] as const;

export const inspectorVisitV1CriterionKeys = inspectorVisitV1Criteria.map((item) => item.criterionKey);
export const inspectorVisitV1CriterionKeySet = new Set<string>(inspectorVisitV1CriterionKeys);

export const inspectorVisitV1Sections = [
  { key: 'IDENTITY_CONTEXT', label: 'هوية الزيارة والتقرير' },
  { key: 'TEACHER_CONTEXT', label: 'معلومات الأستاذ والوضعية المهنية' },
  { key: 'LESSON_CONTEXT', label: 'ظروف التفتيش وسياق الحصة' },
  { key: 'PREPARATION_PLANNING', label: 'التحضير والتخطيط' },
  { key: 'FACILITY_SAFETY', label: 'الفضاء والوسائل والسلامة' },
  { key: 'LESSON_PROGRESSION', label: 'سير الحصة والملاحظة الميدانية' },
  { key: 'PEDAGOGICAL_SUPERVISION', label: 'الإشراف البيداغوجي' },
  { key: 'DOCUMENT_MONITORING', label: 'الوثائق البيداغوجية والدفتر اليومي' },
  { key: 'STUDENT_MONITORING', label: 'متابعة التلاميذ' },
  { key: 'GUIDANCE', label: 'الإرشادات التربوية' },
  { key: 'CONCLUSION_OUTCOME', label: 'الخلاصة والنتيجة المهنية' },
] as const;
