import type { ReactNode } from 'react';

export type ShellIconName =
  | 'institutions'
  | 'dashboard'
  | 'teachers'
  | 'submissions'
  | 'visits'
  | 'follow-ups'
  | 'account'
  | 'menu'
  | 'close'
  | 'collapse'
  | 'expand'
  | 'shield'
  | 'login'
  | 'lock'
  | 'arrow-back'
  | 'arrow-down'
  | 'reports'
  | 'alert'
  | 'check-circle'
  | 'search'
  | 'phone'
  | 'email'
  | 'location';

const shapes: Record<ShellIconName, ReactNode> = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="12" width="7" height="8.5" rx="1.5" /><rect x="3.5" y="13" width="7" height="7.5" rx="1.5" /></>,
  institutions: <><path d="M3.5 20.5h17" /><path d="M5.5 20.5V7.5l6.5-4 6.5 4v13" /><path d="M9 10h.01M15 10h.01M9 13.5h.01M15 13.5h.01M10 20.5v-4h4v4" /></>,
  teachers: <><circle cx="9" cy="8" r="3.25" /><path d="M3.5 20v-1.4A5.1 5.1 0 0 1 8.6 13.5h.8a5.1 5.1 0 0 1 5.1 5.1V20" /><path d="M15.5 4.9a3.25 3.25 0 0 1 0 6.2M17 14a4.4 4.4 0 0 1 3.5 4.3V20" /></>,
  submissions: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6" /></>,
  visits: <><rect x="4" y="5.5" width="16" height="15" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 9.5h16M8 14l2.2 2.2L16 11.5" /></>,
  'follow-ups': <><path d="M8 4.5H5.5v16h13v-16H16" /><path d="M8 6.5h8v-3H8zM8.5 12h7M8.5 15.5h4" /></>,
  account: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  collapse: <><path d="m9 5 7 7-7 7" /><path d="M20 4v16" /></>,
  expand: <><path d="m15 5-7 7 7 7" /><path d="M20 4v16" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  login: <><path d="M10 17 15 12 10 7" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  'arrow-back': <><path d="m9 18 6-6-6-6" /><path d="M15 12H4" /></>,
  'arrow-down': <><path d="M12 4v15M6 13l6 6 6-6" /></>,
  reports: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 15.5h6M9 8.5h1" /></>,
  alert: <><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4M12 16.3h.01" /></>,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  phone: <><path d="M7 3.5h3l1.4 4-2 1.4a14 14 0 0 0 5.7 5.7l1.4-2 4 1.4v3a2 2 0 0 1-2.2 2A16 16 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" /></>,
  email: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4.5 7 7.5 5.5L19.5 7" /></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
};

export function ShellIcon({ name, className }: { name: ShellIconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
