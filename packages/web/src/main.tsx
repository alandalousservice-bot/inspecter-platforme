import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from './ui/AppShell';
import './ui/tokens.css';
import './ui/shell.css';
import './ui/primitives.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <StrictMode>
    <AppShell>
      <h1>تهيئة المشروع</h1>
    </AppShell>
  </StrictMode>,
);
