import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LoginPage } from './auth/LoginPage';
import { SessionPage } from './auth/SessionPage';
import { InstitutionsPage } from './institutions/InstitutionsPage';
import { PublicTeacherIntakePage } from './public-intake/PublicTeacherIntakePage';
import { SubmissionsPage } from './submissions/SubmissionsPage';
import { SubmissionDetailPage } from './submissions/SubmissionDetailPage';
import { TeacherProfilePage } from './teachers/TeacherProfilePage';
import { TeacherDirectoryPage } from './teachers/TeacherDirectoryPage';
import { WeeklySchedulePage } from './teachers/WeeklySchedulePage';
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
          <Route path="teachers/:id/schedules" element={<WeeklySchedulePage />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
