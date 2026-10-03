import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ApiRequestError, type SubmissionLocationProposal } from '../auth/client';
import { InstitutionLocationProposalReview } from './InstitutionLocationProposalReview';

const { decideInstitutionLocationProposal } = vi.hoisted(() => ({ decideInstitutionLocationProposal: vi.fn() }));
vi.mock('../auth/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/client')>(), decideInstitutionLocationProposal,
}));

const canonical = { latitude: '35.123456', longitude: '-0.123456', source: 'MANUAL_INSPECTOR' as const };
const pendingProposal: SubmissionLocationProposal = {
  status: 'PENDING', latitude: '35.654321', longitude: '-0.654321', decidedAt: null,
  decidedByInspectorId: null, decisionReason: null,
  institution: { id: 'institution-id', name: 'ابتدائية النور', municipality: 'وهران', location: null },
};

function Harness({ initial, afterRefresh = initial }: { initial: SubmissionLocationProposal | null; afterRefresh?: SubmissionLocationProposal | null }) {
  const [proposal, setProposal] = useState(initial);
  return <div dir="rtl"><InstitutionLocationProposalReview
    submissionId="submission-id" proposal={proposal}
    onRefresh={async () => { setProposal(afterRefresh); }}
  /></div>;
}

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value: function (this: HTMLDialogElement) { this.open = false; },
  });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('TASK-077D institution location proposal review', () => {
  it('renders absent proposal as a neutral state without decision controls', () => {
    render(<Harness initial={null} />);
    expect(screen.getByText('لم يقدّم الأستاذ إحداثيات لموقع المؤسسة.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeNull();
  });

  it('keeps proposed and canonical coordinates distinct and labels their trusted source', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<Harness initial={{ ...pendingProposal, institution: { ...pendingProposal.institution!, location: canonical } }} />);
    expect(screen.getByText('35.654321')).toBeTruthy();
    expect(screen.getByText('-0.654321')).toBeTruthy();
    expect(screen.getByText('35.123456')).toBeTruthy();
    expect(screen.getByText('-0.123456')).toBeTruthy();
    expect(screen.getByText(/مدخل يدويًا من طرف المفتش/)).toBeTruthy();
    expect(screen.getAllByText(/35\./).every((node) => node.closest('bdi')?.getAttribute('dir') === 'ltr')).toBe(true);
    expect(screen.getByRole('button', { name: 'الاحتفاظ بالموقع الحالي' })).toBeTruthy();
    const directions = screen.getByRole('link', { name: 'الاتجاه إلى المؤسسة' });
    const directionsUrl = new URL((directions as HTMLAnchorElement).href);
    expect([...directionsUrl.searchParams.entries()]).toEqual([['api', '1'], ['destination', '35.123456,-0.123456']]);
    expect(directionsUrl.searchParams.get('destination')).not.toContain('35.654321');
    expect(directionsUrl.searchParams.get('destination')).not.toContain('-0.654321');
    expect(directions.getAttribute('target')).toBe('_blank');
    expect(directions.getAttribute('rel')).toBe('noopener noreferrer');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('shows teacher-proposed source and hides all actions for persisted terminal states', () => {
    render(<Harness initial={{ ...pendingProposal, status: 'ACCEPTED', institution: {
      ...pendingProposal.institution!, location: { ...canonical, source: 'TEACHER_PROPOSED_APPROVED' },
    } }} />);
    expect(screen.getByText(/مقترح سابق تم اعتماده من طرف المفتش/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toBeTruthy();
    expect(screen.getByText('تم اعتماد الموقع المقترح')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'رفض المقترح' })).toBeNull();
  });

  it('keeps rejected proposals terminal and explains KEEP_CURRENT without actions', () => {
    render(<Harness initial={{ ...pendingProposal, status: 'REJECTED', decisionReason: 'KEEP_CURRENT', institution: {
      ...pendingProposal.institution!, location: canonical,
    } }} />);
    expect(screen.getByText('تم رفض مقترح الموقع')).toBeTruthy();
    expect(screen.getByText('تم الاحتفاظ بالموقع المعتمد للمؤسسة.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'الاحتفاظ بالموقع الحالي' })).toBeNull();
  });

  it('hides directions when there is no canonical location, including a pending proposal with coordinates', () => {
    render(<Harness initial={pendingProposal} />);
    expect(screen.getByText('35.654321')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'الاتجاه إلى المؤسسة' })).toBeNull();
  });

  it('keeps equal proposal and canonical coordinates pending until an explicit decision', () => {
    render(<Harness initial={{ ...pendingProposal, latitude: canonical.latitude, longitude: canonical.longitude,
      institution: { ...pendingProposal.institution!, location: canonical } }} />);
    expect(screen.getByText('قيد مراجعة المفتش')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'رفض المقترح' })).toBeTruthy();
    expect(decideInstitutionLocationProposal).not.toHaveBeenCalled();
  });

  it('accepts without a canonical location and refreshes to server-authoritative state', async () => {
    decideInstitutionLocationProposal.mockResolvedValue({ data: { status: 'ACCEPTED', institutionId: 'institution-id' } });
    const finalProposal = { ...pendingProposal, status: 'ACCEPTED' as const };
    render(<Harness initial={pendingProposal} afterRefresh={finalProposal} />);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الموقع المقترح' }));
    await waitFor(() => expect(decideInstitutionLocationProposal).toHaveBeenCalledOnce());
    expect(decideInstitutionLocationProposal).toHaveBeenCalledWith({ id: 'submission-id', decision: { action: 'ACCEPT_PROPOSED', expectedCanonicalLocation: null } });
    expect(await screen.findByText('تم اعتماد الموقع المقترح')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'رفض المقترح' })).toBeNull();
  });

  it('requires confirmation before replacing canonical coordinates and cancellation sends no request', async () => {
    render(<Harness initial={{ ...pendingProposal, institution: { ...pendingProposal.institution!, location: canonical } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الموقع المقترح' }));
    expect(screen.getByRole('dialog', { name: 'تأكيد استبدال موقع المؤسسة' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(decideInstitutionLocationProposal).not.toHaveBeenCalled();
  });

  it('sends exact expected snapshot for keep-current and refreshes persisted decision', async () => {
    decideInstitutionLocationProposal.mockResolvedValue({ data: { status: 'REJECTED', institutionId: 'institution-id' } });
    const finalProposal = { ...pendingProposal, status: 'REJECTED' as const, decisionReason: 'KEEP_CURRENT', institution: { ...pendingProposal.institution!, location: canonical } };
    render(<Harness initial={{ ...pendingProposal, institution: { ...pendingProposal.institution!, location: canonical } }} afterRefresh={finalProposal} />);
    fireEvent.click(screen.getByRole('button', { name: 'الاحتفاظ بالموقع الحالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاحتفاظ بالموقع الحالي' }));
    await waitFor(() => expect(decideInstitutionLocationProposal).toHaveBeenCalledOnce());
    expect(decideInstitutionLocationProposal).toHaveBeenCalledWith({ id: 'submission-id', decision: { action: 'KEEP_CURRENT', expectedCanonicalLocation: canonical } });
    expect(await screen.findByText('تم الاحتفاظ بالموقع المعتمد للمؤسسة.')).toBeTruthy();
  });

  it('confirms reject, sends only the bounded action, and removes actions after authoritative refetch', async () => {
    decideInstitutionLocationProposal.mockResolvedValue({ data: { status: 'REJECTED' } });
    render(<Harness initial={pendingProposal} afterRefresh={{ ...pendingProposal, status: 'REJECTED' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'رفض المقترح' }));
    expect(screen.getByRole('dialog', { name: 'تأكيد رفض مقترح الموقع' })).toBeTruthy();
    expect(decideInstitutionLocationProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرفض' }));
    await waitFor(() => expect(decideInstitutionLocationProposal).toHaveBeenCalledOnce());
    expect(decideInstitutionLocationProposal).toHaveBeenCalledWith({ id: 'submission-id', decision: { action: 'REJECT' } });
    expect(await screen.findByText('تم رفض مقترح الموقع')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اعتماد الموقع المقترح' })).toBeNull();
  });

  it('sends reject without free-text fields and safely refreshes once on a stale 409', async () => {
    decideInstitutionLocationProposal.mockRejectedValueOnce(new ApiRequestError('private conflict detail', undefined, 409));
    const finalProposal = { ...pendingProposal, status: 'REJECTED' as const };
    render(<Harness initial={pendingProposal} afterRefresh={finalProposal} />);
    fireEvent.click(screen.getByRole('button', { name: 'رفض المقترح' }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الرفض' }));
    expect(await screen.findByText('تم تحديث بيانات الموقع منذ فتح هذه الصفحة. راجع البيانات الحالية قبل اتخاذ القرار.')).toBeTruthy();
    expect(decideInstitutionLocationProposal).toHaveBeenCalledOnce();
    expect(decideInstitutionLocationProposal).toHaveBeenCalledWith({ id: 'submission-id', decision: { action: 'REJECT' } });
    expect(screen.queryByText('private conflict detail')).toBeNull();
    expect(screen.queryByRole('button', { name: 'رفض المقترح' })).toBeNull();
  });

  it('shows a generic safe error for a failed mutation without exposing transport details', async () => {
    decideInstitutionLocationProposal.mockRejectedValueOnce(new Error('SQL stack, private path, 35.654321'));
    render(<Harness initial={pendingProposal} />);
    fireEvent.click(screen.getByRole('button', { name: 'اعتماد الموقع المقترح' }));
    const alert = await screen.findByRole('alert');
    expect(screen.getByText('تعذر إكمال القرار. تحقق من الاتصال ثم راجع البيانات الحالية.')).toBeTruthy();
    expect(alert.textContent).not.toMatch(/SQL stack|private path|35\.654321/u);
    expect(screen.getByText('35.654321')).toBeTruthy();
  });

  it('prevents duplicate submission while a decision request is in flight', async () => {
    let release!: (value: { data: { status: 'ACCEPTED'; institutionId: string } }) => void;
    decideInstitutionLocationProposal.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    render(<Harness initial={pendingProposal} afterRefresh={{ ...pendingProposal, status: 'ACCEPTED' }} />);
    const accept = screen.getByRole('button', { name: 'اعتماد الموقع المقترح' });
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(decideInstitutionLocationProposal).toHaveBeenCalledOnce();
    release({ data: { status: 'ACCEPTED', institutionId: 'institution-id' } });
    await screen.findByText('تم اعتماد الموقع المقترح');
  });
});
