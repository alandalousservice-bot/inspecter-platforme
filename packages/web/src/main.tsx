import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
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
import './ui/tokens.css';
import './ui/shell.css';
import './ui/primitives.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/public/d/:districtId/register" element={<PublicTeacherIntakePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<SessionPage />}>
          <Route index element={<Navigate to="institutions" replace />} />
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
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
