import type { PedagogicalVisitType } from '../auth/client';

export const visitTypeLabels: Record<PedagogicalVisitType, string> = {
  GUIDANCE: 'زيارة توجيهية / تكوينية',
  TENURE_CONFIRMATION: 'زيارة التثبيت / الترسيم',
  PROMOTION_EVALUATION: 'زيارة الترقية / التقييم',
  MONITORING_FOLLOW_UP: 'زيارة المراقبة والمتابعة',
  EXCEPTIONAL: 'زيارة استثنائية',
};

export function visitTypeLabel(type: PedagogicalVisitType | null): string {
  return type ? visitTypeLabels[type] : 'نوع الزيارة غير موثق (سجل سابق)';
}
