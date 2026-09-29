import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { LoginPage } from './auth/LoginPage';
import { SessionPage } from './auth/SessionPage';
import { InstitutionsPage } from './institutions/InstitutionsPage';
import './ui/tokens.css';
import './ui/shell.css';
import './ui/primitives.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<SessionPage />}>
          <Route index element={<Navigate to="institutions" replace />} />
          <Route path="institutions" element={<InstitutionsPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
