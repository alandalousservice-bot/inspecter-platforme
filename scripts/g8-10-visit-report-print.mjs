import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.G8_10_BASE_URL ?? 'http://127.0.0.1:5173';
const outputDir = path.join(os.tmpdir(), 'g8-10-visit-report-print');
const visitId = '55555555-5555-4555-8555-555555555555';
const { inspectorVisitV1Criteria: criteria } = await import(pathToFileURL(path.resolve('packages/api/dist/reports/inspector-visit-v1.js')));

const blankFields = {
  educationDirectorateText: null, administrativeDivisionText: null, teacherClassificationText: null, teacherGradeText: null,
  teacherNationalityText: null, teacherEffectiveDateText: null, teacherLastInspectionText: null, teacherAppointmentText: null,
  teacherProfessionalFrameworkText: null, actualLessonDurationText: null, studentCount: null, studentsPresentCount: null,
  studentsAbsentCount: null, lessonObjective: null, pedagogicalGuidanceText: null, practicalGuidanceText: null,
  visitStrengthsText: null, visitImprovementAreasText: null, tenureConclusionText: null, generalAssessmentText: null,
  markText: null, markWordsText: null, pedagogicalMark: null,
};

function fixture(kind) {
  const dense = kind === 'dense';
  const minimal = kind === 'minimal';
  const observations = minimal ? [] : criteria.map(({ criterionKey }) => ({
    criterionKey,
    valueText: dense ? 'ملاحظة اختبارية موجزة للحقل.' : 'قيمة معيارية للاختبار.',
  }));
  const fields = minimal ? { ...blankFields } : {
    ...blankFields,
    educationDirectorateText: 'ولاية تجريبية', administrativeDivisionText: 'دائرة النور', teacherClassificationText: 'الصنف 12',
    teacherGradeText: 'الدرجة 3', teacherNationalityText: 'جزائرية', teacherEffectiveDateText: '2025/09/01',
    teacherLastInspectionText: '2025/03/18', teacherAppointmentText: 'تعيين 2020/09/01', teacherProfessionalFrameworkText: 'أستاذ التعليم الابتدائي',
    actualLessonDurationText: '60 دقيقة', studentCount: 38, studentsPresentCount: 36, studentsAbsentCount: 2,
    lessonObjective: 'تنمية التوافق الحركي والتعاون بين التلاميذ.', pedagogicalGuidanceText: dense
      ? 'ينبغي تنويع الأنشطة والألعاب حسب مستوى التلاميذ ومراعاة الفروق الفردية بينهم، مع التدرج من السهل إلى الصعب. '.repeat(5)
      : 'ينبغي تنويع الأنشطة ومراعاة الفروق الفردية، مع احترام قواعد السلامة.' ,
    practicalGuidanceText: dense
      ? 'تنظيم التلاميذ في مجموعات واضحة وتحديد فضاء آمن ومناسب لكل نشاط مع متابعة المشاركة العملية. '.repeat(4)
      : 'تنظيم التلاميذ في مجموعات وتحديد فضاء آمن للنشاط.',
    visitStrengthsText: dense ? 'أظهر الأستاذ قدرة جيدة على إشراك التلاميذ وتنظيم الحصة والتفاعل مع ملاحظاتهم. '.repeat(3) : 'تنظيم جيد ومشاركة فعالة.',
    visitImprovementAreasText: dense ? 'يمكن تعزيز تنويع الوسائل وإتاحة وقت إضافي للتطبيق الفردي ومتابعة التلاميذ المترددين. '.repeat(3) : 'تنويع الوسائل التعليمية.',
    generalAssessmentText: 'تقدير افتراضي للاختبار', markText: '14', markWordsText: 'أربعة عشر',
    ...(kind === 'normal' ? { pedagogicalMark: '14.25', markText: null, markWordsText: null } : {}),
  };
  const visitType = kind === 'normal' ? 'PROMOTION_EVALUATION' : 'GUIDANCE';
  return {
    id: `report-${kind}`, visitId, reportType: 'INSPECTOR_VISIT', templateSource: 'PRODUCT_OWNER_ADOPTED', templateVersion: 1,
    status: 'FINAL', revision: 2, levelClass: minimal ? null : 'السنة الثالثة ابتدائي',
    lessonTopic: minimal ? null : 'الألعاب الحركية والتوازن', pedagogicalObservations: null, strengths: null, improvementAreas: null,
    guidanceRecommendations: null, inspectorConclusion: minimal ? null : dense
      ? 'حضر المفتش الحصة وتابع مختلف مراحلها. أظهر الأستاذ التزامًا بالتوجيهات المهنية، مع الحاجة إلى متابعة بعض النقاط العملية وتطوير تنويع الأنشطة بما يناسب مستويات التلاميذ. '.repeat(4)
      : 'كان حضور الأستاذ إيجابيًا، وأظهر التزامًا ومجهودًا في تقديم الحصة.',
    finalizedAt: '2026-10-02T10:00:00.000Z', finalizedByInspectorId: 'inspector-id',
    finalizedInspectorNameSnapshot: 'مفتش', finalizedInspectorSurnameSnapshot: 'تجريبي',
    finalizedTeacherNameSnapshot: 'سلمى', finalizedTeacherSurnameSnapshot: 'أمين', createdAt: '', updatedAt: '',
    displayIdentity: { inspector: { name: 'مفتش', surname: 'تجريبي' }, teacher: { name: 'سلمى', surname: 'أمين' } },
    visit: { id: visitId, status: 'COMPLETED', academicYear: '2026-2027', scheduledStartAt: null, scheduledEndAt: null,
      actualStartAt: '2026-10-02T08:00:00.000Z', actualEndAt: '2026-10-02T09:00:00.000Z', occurredAt: '2026-10-02T09:00:00.000Z',
      intervalKind: 'ACTUAL_RETROSPECTIVE', visitType, institution: { id: 'institution-id', name: 'ابتدائية الأمل' }, teacher: { id: 'teacher-id' } },
    inspectorVisitV1: { ...fields, observations },
    displayContext: { teacherBirthDate: '1990-05-13', teacherPlaceOfBirth: 'مدينة النور', teacherQualifications: 'شهادة جامعية',
      districtName: 'مقاطعة النور', institutionMunicipality: 'بلدية النور', visitType },
  };
}

function pageCount(pdfPath) {
  const result = spawnSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`pdfinfo failed: ${result.stderr}`);
  const pages = Number(result.stdout.match(/^Pages:\s+(\d+)/mu)?.[1]);
  const size = result.stdout.match(/^Page size:\s+(.+)$/mu)?.[1] ?? '';
  return { pages, size };
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const kind of ['normal', 'minimal', 'dense']) {
    const page = await browser.newPage();
    const report = fixture(kind);
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: { id: 'synthetic-inspector', email: 'print-test@example.invalid' } } }));
    await page.route(`**/api/v1/visits/${visitId}/report`, (route) => route.fulfill({ json: { data: { report } } }));
    await page.route('**/api/v1/report-templates/inspector-visit/v1', (route) => route.fulfill({ json: { data: { criteria } } }));
    const response = await page.goto(`${baseUrl}/app/visits/${visitId}/report/print`, { waitUntil: 'networkidle' });
    if (!response?.ok()) throw new Error(`${kind}: app route returned ${response?.status() ?? 'no response'}`);
    await page.getByRole('main', { name: 'نموذج تقرير زيارة معتمد للمنصة' }).waitFor();
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const isolation = await page.evaluate(() => ({
      sidebar: getComputedStyle(document.querySelector('.app-sidebar')).display,
      topbar: getComputedStyle(document.querySelector('.app-topbar')).display,
      controls: getComputedStyle(document.querySelector('.visit-report-print__controls')).display,
      bodyClass: document.body.classList.contains('visit-report-print-active'),
      grayscale: [
        getComputedStyle(document.querySelector('.visit-report-print__sheet')).color,
        getComputedStyle(document.querySelector('.visit-report-print__sheet')).backgroundColor,
        getComputedStyle(document.querySelector('.visit-report-print__sheet')).borderTopColor,
      ],
      sheets: [...document.querySelectorAll('.visit-report-print__sheet')].map((sheet) => ({
        scroll: sheet.scrollHeight, client: sheet.clientHeight,
        heightMm: sheet.getBoundingClientRect().height * 25.4 / 96,
      })),
    }));
    if (isolation.sidebar !== 'none' || isolation.topbar !== 'none' || isolation.controls !== 'none' || !isolation.bodyClass) {
      throw new Error(`${kind}: print shell isolation failed: ${JSON.stringify(isolation)}`);
    }
    if (isolation.grayscale.some((color) => !/^rgb\((\d+), \1, \1\)$/u.test(color))) throw new Error(`${kind}: non-grayscale print color found: ${isolation.grayscale}`);
    if (isolation.sheets.some(({ scroll, client, heightMm }) => scroll > client + 2 || heightMm > 286)) {
      throw new Error(`${kind}: content overflows its page sheet: ${JSON.stringify(isolation.sheets)}`);
    }
    const pdfPath = path.join(outputDir, `visit-report-${kind}.pdf`);
    await page.pdf({ path: pdfPath, preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, scale: 1 });
    const pdf = pageCount(pdfPath);
    const dimensions = pdf.size.match(/^([\d.]+) x ([\d.]+) pts \(A4\)$/u);
    if (!dimensions || Number(dimensions[1]) < 594 || Number(dimensions[1]) > 596 || Number(dimensions[2]) < 841 || Number(dimensions[2]) > 843) {
      throw new Error(`${kind}: expected A4 portrait, got ${pdf.size}`);
    }
    if (pdf.pages !== 2) throw new Error(`${kind}: expected two pages, got ${pdf.pages}; artifact: ${pdfPath}`);
    const text = await readFile(pdfPath);
    if (text.length === 0) throw new Error(`${kind}: empty print PDF`);
    console.log(`${kind}: pages=${pdf.pages}, size=${pdf.size}, shell=isolated, sheet-overflow=none, artifact=${pdfPath}`);
    await page.close();
  }
} finally {
  await browser.close();
}
