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
import { InspectorSchedulePage } from './teacher-portal/InspectorSchedulePage';
import { TeacherLoginPage } from './teacher-portal/TeacherLoginPage';
import { TeacherPortalPage } from './teacher-portal/TeacherPortalPage';
import { InspectorTeacherRequestsPage } from './teacher-portal/InspectorTeacherRequestsPage';
import { InstitutionWorkspacePage } from './teacher-portal/InstitutionWorkspacePage';
import { VisitCreatePage } from './visits/VisitCreatePage';
import { VisitDetailPage } from './visits/VisitDetailPage';
import { VisitListPage } from './visits/VisitListPage';
import { InspectionReportPage } from './visits/InspectionReportPage';
import { InspectorVisitReportPrintPage } from './visits/InspectorVisitReportPrintPage';
import { FollowUpsPage } from './followups/FollowUpsPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { LandingPage } from './landing/LandingPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/public/d/:districtId/register" element={<PublicTeacherIntakePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/teacher/login" element={<TeacherLoginPage />} />
      <Route path="/teacher" element={<TeacherPortalPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/app" element={<SessionPage />}>
        <Route index element={<DashboardPage />} />
        <Route path="institutions" element={<InstitutionsPage />} />
        <Route path="institutions/:id" element={<InstitutionWorkspacePage />} />
        <Route path="submissions" element={<SubmissionsPage />} />
        <Route path="teacher-requests" element={<InspectorTeacherRequestsPage />} />
        <Route path="submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="teachers" element={<TeacherDirectoryPage />} />
        <Route path="teachers/:id" element={<TeacherProfilePage />} />
        <Route path="teachers/:id/information-card" element={<TeacherInformationCardPage />} />
        <Route path="teachers/:id/information-card/print" element={<TeacherInformationCardPrintPage />} />
        <Route path="teachers/:id/schedules" element={<InspectorSchedulePage />} />
        <Route path="visits" element={<VisitListPage />} />
        <Route path="visits/new" element={<VisitCreatePage />} />
        <Route path="visits/:id" element={<VisitDetailPage />} />
        <Route path="visits/:id/report" element={<InspectionReportPage />} />
        <Route path="visits/:id/report/print" element={<InspectorVisitReportPrintPage />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="me/professional-identity" element={<ProfessionalIdentityPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
