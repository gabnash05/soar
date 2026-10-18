import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../../lib/contracts';
import { AnnouncementCard } from '../pageParts';
import { createProductionWorkflowDataClient } from '../apiClient';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn(),
}));

vi.mock('../../../lib/apiClient', () => ({
  apiFetch: mocks.apiFetch,
  authHeaders: mocks.authHeaders,
}));

vi.mock('../../../lib/storageUploads', () => ({
  storageDownloadUrl: vi.fn(),
  uploadMeetingDocumentToTarget: vi.fn(),
  uploadToStorageTarget: vi.fn(),
  validateAnnouncementMediaFiles: vi.fn(),
}));

const session: UserSession = {
  uid: 'comment-viewer',
  email: 'viewer@example.test',
  displayName: 'Viewer Student',
  accountKind: 'student',
  emailVerified: true,
  access: {
    status: 'active',
    annualFeePhp: 10,
    feePhp: 10,
    periodMonths: 6,
    periodLabel: '6 months',
    renewalAvailable: false,
  },
  officerGrants: [],
};

const announcement = {
  id: 'role-post',
  organizationId: 'organization-1',
  organizationName: 'Computer Engineering Department',
  createdAt: '2026-10-15T00:00:00.000Z',
  body: 'Role badge production-client test post.',
  likeCount: 0,
  viewerHasLiked: false,
  commentCount: 4,
  comments: [],
};

describe('production comment DTO to visible author badge path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer synthetic-test-token' });
    mocks.apiFetch.mockResolvedValueOnce({ items: [
      { id: 'student-comment', authorName: 'Student One', authorAccountKind: 'student', body: 'Verified student comment.', createdAt: '2026-10-15T00:01:00.000Z' },
      { id: 'officer-comment', authorName: 'Officer One', authorAccountKind: 'student', authorOrganizationRole: 'approved_officer', body: 'Current-organization officer comment.', createdAt: '2026-10-15T00:02:00.000Z' },
      { id: 'sponsor-comment', authorName: 'Sponsor One', authorAccountKind: 'sponsor', body: 'Other account kind comment.', createdAt: '2026-10-15T00:03:00.000Z' },
      { id: 'unknown-comment', authorName: 'Unknown One', authorAccountKind: 'admin', authorOrganizationRole: 'global_officer', body: 'Unknown role comment.', createdAt: '2026-10-15T00:04:00.000Z' },
    ] });
  });

  it('maps only supported server role values and renders the corresponding visible badges', async () => {
    const user = userEvent.setup();
    const client = createProductionWorkflowDataClient();
    render(
      <MemoryRouter>
        <AnnouncementCard announcement={announcement} session={session} client={client} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Open comments (4)' }));
    const studentBody = await screen.findByText('Verified student comment.');
    const officerBody = screen.getByText('Current-organization officer comment.');
    const sponsorBody = screen.getByText('Other account kind comment.');
    const unknownBody = screen.getByText('Unknown role comment.');

    expect(within(studentBody.closest('li')!).getByText('Student', { exact: true })).toBeInTheDocument();
    expect(within(officerBody.closest('li')!).getByText('Officer', { exact: true })).toBeInTheDocument();
    expect(within(sponsorBody.closest('li')!).queryByText(/^(Student|Officer)$/)).not.toBeInTheDocument();
    expect(within(unknownBody.closest('li')!).queryByText(/^(Student|Officer)$/)).not.toBeInTheDocument();
    expect(mocks.apiFetch).toHaveBeenCalledWith('/announcements/role-post/comments?limit=50', expect.anything());
  });
});
