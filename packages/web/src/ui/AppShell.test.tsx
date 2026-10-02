import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AppShell } from './AppShell';

function renderShell(path = '/app/institutions') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell inspector={{ id: 'inspector-1', email: 'inspector@example.invalid' }}>
        <h1>محتوى الصفحة</h1>
      </AppShell>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('G6-02 professional application shell', () => {
  it('shows only implemented operational workspaces and separates inspector identity', () => {
    renderShell();
    const primary = screen.getByRole('navigation', { name: 'مساحات العمل' });
    expect([...primary.querySelectorAll('a')].map((link) => link.getAttribute('aria-label'))).toEqual([
      'المؤسسات', 'دليل الأساتذة', 'طلبات الأساتذة', 'الزيارات', 'المتابعات',
    ]);
    expect(screen.queryByRole('link', { name: 'الرئيسية' })).toBeNull();
    expect(screen.queryByRole('link', { name: /المرجع|المقترحات|النشاط/u })).toBeNull();
    expect(screen.getByRole('link', { name: 'هويتي المهنية' })).toBeTruthy();
    expect(screen.getByText('inspector@example.invalid').getAttribute('dir')).toBe('ltr');
  });

  it('marks top-level and nested Teacher/Visit routes active and exposes one main landmark', () => {
    const { unmount } = renderShell('/app/teachers/teacher-1/information-card');
    expect(screen.getByRole('link', { name: 'دليل الأساتذة' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.querySelector('#main-content .ui-page')).toBeTruthy();
    unmount();
    renderShell('/app/visits/visit-1/report');
    expect(screen.getByRole('link', { name: 'الزيارات' }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps the authenticated print route outside the page system and screen shell', () => {
    renderShell('/app/teachers/teacher-1/information-card/print');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.querySelector('.ui-page')).toBeNull();
    expect(document.querySelector('.app-sidebar')).toBeNull();
    expect(document.querySelector('.app-topbar')).toBeNull();
  });

  it('collapses and expands desktop navigation without losing accessible link names', () => {
    renderShell();
    const sidebar = screen.getByRole('complementary', { name: 'مساحة العمل والتنقل' });
    const collapse = screen.getByRole('button', { name: 'طي القائمة الجانبية' });
    fireEvent.click(collapse);
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByRole('link', { name: 'طلبات الأساتذة' }).getAttribute('aria-label')).toBe('طلبات الأساتذة');
    fireEvent.click(screen.getByRole('button', { name: 'توسيع القائمة الجانبية' }));
    expect(sidebar.hasAttribute('data-collapsed')).toBe(false);
  });

  it('opens a modal mobile drawer, contains keyboard focus, and restores focus after Escape', async () => {
    renderShell();
    const opener = screen.getByRole('button', { name: 'فتح قائمة التنقل' });
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'قائمة التنقل الرئيسية' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('.app-shell__content')?.hasAttribute('inert')).toBe(true);
    const close = screen.getByRole('button', { name: 'إغلاق القائمة' });
    await waitFor(() => expect(document.activeElement).toBe(close));
    const backdrop = screen.getByRole('button', { name: 'إغلاق قائمة التنقل' });
    backdrop.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const accountLink = screen.getByRole('link', { name: 'هويتي المهنية' });
    expect(document.activeElement).toBe(accountLink);
    accountLink.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(backdrop);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.querySelector('.app-shell__content')?.hasAttribute('inert')).toBe(false);
  });

  it('closes from the explicit close control and backdrop and returns focus to the opener', async () => {
    renderShell();
    const opener = screen.getByRole('button', { name: 'فتح قائمة التنقل' });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق القائمة' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق قائمة التنقل' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
