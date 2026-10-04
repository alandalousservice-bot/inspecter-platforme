import { Navigate, Route, Routes } from 'react-router';
import { LoginPage } from './auth/LoginPage';
import { SessionPage } from './auth/SessionPage';
import { ProfessionalIdentityPage } from './auth/ProfessionalIdentityPage';
import { InstitutionsPage } from './institutions/InstitutionsPage';
import { PublicTeacherIntakePage } from './public-intake/PublicTeacherIntakePage';
import { SubmissionsPage } from './submissions/SubmissionsPage';
import { SubmissionDetailPage } from './submissions/SubmissionDetailPage';
import { TeacherProfilePage } from './teachers/TeacherProfilePage';
import { TeacherInformationCardPage } from './teachers/TeacherInformationCardPage';
import { TeacherInformationCardPrintPage } from './teachers/TeacherInformationCardPrintPage';
import { TeacherDirectoryPage } from './teachers/TeacherDirectoryPage';
import { WeeklySchedulePage } from './teachers/WeeklySchedulePage';
import { VisitCreatePage } from './visits/VisitCreatePage';
import { VisitDetailPage } from './visits/VisitDetailPage';
import { VisitListPage } from './visits/VisitListPage';
import { InspectionReportPage } from './visits/InspectionReportPage';
import { FollowUpsPage } from './followups/FollowUpsPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { LandingPage } from './landing/LandingPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/public/d/:districtId/register" element={<PublicTeacherIntakePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<SessionPage />}>
        <Route index element={<DashboardPage />} />
        <Route path="institutions" element={<InstitutionsPage />} />
        <Route path="submissions" element={<SubmissionsPage />} />
        <Route path="submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="teachers" element={<TeacherDirectoryPage />} />
        <Route path="teachers/:id" element={<TeacherProfilePage />} />
        <Route path="teachers/:id/information-card" element={<TeacherInformationCardPage />} />
        <Route path="teachers/:id/information-card/print" element={<TeacherInformationCardPrintPage />} />
        <Route path="teachers/:id/schedules" element={<WeeklySchedulePage />} />
        <Route path="visits" element={<VisitListPage />} />
        <Route path="visits/new" element={<VisitCreatePage />} />
        <Route path="visits/:id" element={<VisitDetailPage />} />
        <Route path="visits/:id/report" element={<InspectionReportPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="me/professional-identity" element={<ProfessionalIdentityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
