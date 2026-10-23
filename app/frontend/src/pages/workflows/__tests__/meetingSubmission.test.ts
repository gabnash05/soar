import { beforeEach, describe, expect, it, vi } from 'vitest';
import { meetingDocumentTargetSchema, meetingRequestSchema } from '../../../../../backend/src/requests/validation';
import { safeErrorMessage } from '../../../lib/safeErrors';
import type { UserSession } from '../../../lib/contracts';

const { getFirebaseConfigStatus, getFirebaseRuntime } = vi.hoisted(() => ({
  getFirebaseConfigStatus: vi.fn(() => ({ configured: true })),
  getFirebaseRuntime: vi.fn(() => ({
    auth: { currentUser: { getIdToken: vi.fn(async () => 'synthetic-id-token') } },
    storage: undefined,
  })),
}));

vi.mock('../../../lib/firebase', () => ({ getFirebaseConfigStatus, getFirebaseRuntime }));
vi.mock('@firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}));

import { createProductionWorkflowDataClient } from '../apiClient';

const API_ORIGIN = 'https://api.synthetic.test';
const SIGNED_UPLOAD_URL = 'https://storage.synthetic.test/signed-upload';
const MEETING_REQUEST_ID = 'meeting_synthetic_stable_reference';
const FALLBACK = 'We could not send your meeting request. It was not confirmed. Please try again; if the problem continues, contact support.';

const session: UserSession = {
  uid: 'synthetic-student',
  email: 'student@example.test',
  displayName: 'Demo Student',
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

const meetingInput = (file?: File) => ({
  organizationId: 'synthetic-org',
  dateEntryId: 'availability-1',
  requestedDate: '2026-11-12',
  requestedTime: '14:00',
  note: 'A controlled local request.',
  ...(file ? { document: { file, fileName: file.name, contentType: 'application/pdf' as const, sizeBytes: file.size } } : {}),
});

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function fieldProblems(error: { issues: { path: PropertyKey[]; message: string }[] }): Record<string, string> {
  return Object.fromEntries(error.issues.flatMap((issue) => {
    const field = issue.path[0];
    return typeof field === 'string' ? [[field, issue.message]] : [];
  }));
}

function installSyntheticHttpApi(options: { loseSaveResponse?: boolean; rejectSaveStatus?: number } = {}) {
  const stages: string[] = [];
  const requests: { url: string; method: string; headers: Headers; credentials: RequestCredentials | undefined; body: Record<string, unknown> | undefined }[] = [];
  const savedMeetings: Record<string, unknown>[] = [];
  let uploadedMetadata: Record<string, string> | undefined;
  let uploadedPath: string | undefined;

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    requests.push({ url: `${url.origin}${url.pathname}`, method, headers, credentials: init.credentials, body });

    if (url.origin === API_ORIGIN && url.pathname === '/requests/meetings/document-targets' && method === 'POST') {
      stages.push('target');
      const parsed = meetingDocumentTargetSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ code: 'validation_problem', message: 'The request fields are invalid.', problems: fieldProblems(parsed.error) }, 400);
      }
      const target = {
        meetingRequestId: MEETING_REQUEST_ID,
        organizationId: parsed.data.organizationId,
        dateEntryId: parsed.data.dateEntryId,
        storagePath: `meeting-request-documents/${parsed.data.organizationId}/${MEETING_REQUEST_ID}/${parsed.data.fileName}`,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
        sizeBytes: parsed.data.sizeBytes,
        signedUploadUrl: SIGNED_UPLOAD_URL,
      };
      return jsonResponse(target);
    }

    if (url.href === SIGNED_UPLOAD_URL && method === 'PUT') {
      stages.push('put');
      const metadataHeader = headers.get('x-metadata');
      uploadedMetadata = metadataHeader ? JSON.parse(atob(metadataHeader)) as Record<string, string> : undefined;
      uploadedPath = `meeting-request-documents/${uploadedMetadata?.orgId}/${MEETING_REQUEST_ID}`;
      return new Response(null, { status: 200 });
    }

    if (url.origin === API_ORIGIN && url.pathname === '/requests/meetings' && method === 'POST') {
      stages.push('save');
      if (options.rejectSaveStatus) {
        if (options.rejectSaveStatus === 409) {
          savedMeetings.push({
            id: MEETING_REQUEST_ID,
            organizationId: 'synthetic-org',
            organizationName: 'Synthetic Organization',
            dateEntryId: 'availability-1',
            meetingTitle: 'Synthetic availability',
            requesterUid: session.uid,
            requesterName: session.displayName,
            requestedDate: '2026-11-12',
            requestedTime: '14:00',
            status: 'Pending',
            note: 'A controlled local request.',
            updatedAt: '2026-10-23T00:00:00.000Z',
          });
        }
        const duplicate = options.rejectSaveStatus === 409;
        return jsonResponse({
          code: duplicate ? 'duplicate_meeting_request' : 'unauthenticated',
          message: duplicate ? 'That exact meeting request already exists.' : 'The request was rejected.',
        }, options.rejectSaveStatus);
      }
      const parsed = meetingRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResponse({ code: 'validation_problem', message: 'The request fields are invalid.', problems: fieldProblems(parsed.error) }, 400);
      }
      if (parsed.data.document) {
        const document = parsed.data.document;
        if (!uploadedMetadata || document.storagePath !== `${uploadedPath}/${document.fileName}` ||
            uploadedMetadata.orgId !== parsed.data.organizationId || uploadedMetadata.meetingRequestId !== MEETING_REQUEST_ID ||
            uploadedMetadata.requesterUid !== session.uid) {
          return jsonResponse({ code: 'meeting_document_metadata_mismatch', message: 'The uploaded document does not match this request.' }, 400);
        }
      }
      const meeting = {
        id: MEETING_REQUEST_ID,
        organizationId: parsed.data.organizationId,
        organizationName: 'Synthetic Organization',
        dateEntryId: parsed.data.dateEntryId,
        meetingTitle: 'Synthetic availability',
        requesterUid: session.uid,
        requesterName: session.displayName,
        requestedDate: parsed.data.requestedDate,
        requestedTime: parsed.data.requestedTime,
        status: 'Pending',
        note: parsed.data.note,
        ...(parsed.data.document ? { document: parsed.data.document } : {}),
        updatedAt: '2026-10-23T00:00:00.000Z',
      };
      savedMeetings.push(meeting);
      if (options.loseSaveResponse) throw new TypeError('Failed to fetch');
      return jsonResponse(meeting);
    }

    if (url.origin === API_ORIGIN && url.pathname === '/requests/meetings/mine' && method === 'GET') {
      stages.push('readback');
      return jsonResponse(savedMeetings, 200);
    }

    throw new Error(`Unexpected synthetic request: ${method} ${url.origin}${url.pathname}`);
  }));

  return { stages, requests, savedMeetings };
}

function syntheticMeetingPdf(name = 'formal-request.pdf'): File {
  return new File(['%PDF-1.7\nsynthetic meeting request\n'], name, { type: 'application/pdf' });
}

describe('production meeting request submission over a schema-backed HTTP fixture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('VITE_SOAR_API_BASE_URL', API_ORIGIN);
    getFirebaseConfigStatus.mockReturnValue({ configured: true });
    getFirebaseRuntime.mockReturnValue({
      auth: { currentUser: { getIdToken: vi.fn(async () => 'synthetic-id-token') } },
      storage: undefined,
    });
  });

  it('submits an ordinary PDF through target, private PUT, and save in order with bound metadata', async () => {
    const fixture = installSyntheticHttpApi();
    const client = createProductionWorkflowDataClient();

    const result = await client.requestMeeting(meetingInput(syntheticMeetingPdf()), session);

    expect(result).toMatchObject({ ok: true, persisted: true, data: { id: MEETING_REQUEST_ID, requesterUid: session.uid, status: 'Pending' } });
    expect(fixture.stages).toEqual(['target', 'put', 'save']);
    expect(fixture.requests.map((request) => request.url)).toEqual([
      `${API_ORIGIN}/requests/meetings/document-targets`,
      SIGNED_UPLOAD_URL,
      `${API_ORIGIN}/requests/meetings`,
    ]);
    expect(fixture.requests[0].method).toBe('POST');
    expect(fixture.requests[0].credentials).toBe('include');
    expect(fixture.requests[0].headers.get('authorization')).toBe('Bearer synthetic-id-token');
    expect(fixture.requests[0].headers.get('content-type')).toBe('application/json');
    expect(fixture.requests[0].body).toMatchObject({
      organizationId: 'synthetic-org',
      dateEntryId: 'availability-1',
      requestedDate: '2026-11-12',
      requestedTime: '14:00',
      fileName: 'formal-request.pdf',
      contentType: 'application/pdf',
    });
    expect(fixture.requests[1]).toMatchObject({ method: 'PUT' });
    expect(fixture.requests[1].headers.get('content-type')).toBe('application/pdf');
    expect(fixture.requests[1].headers.get('x-upsert')).toBe('false');
    expect(fixture.requests[1].headers.get('x-metadata')).toBe(btoa(JSON.stringify({
      orgId: 'synthetic-org',
      meetingRequestId: MEETING_REQUEST_ID,
      requesterUid: session.uid,
    })));
    expect(fixture.requests[2].body).toMatchObject({
      organizationId: 'synthetic-org',
      dateEntryId: 'availability-1',
      requestedDate: '2026-11-12',
      requestedTime: '14:00',
      document: {
        storagePath: `meeting-request-documents/synthetic-org/${MEETING_REQUEST_ID}/formal-request.pdf`,
        fileName: 'formal-request.pdf',
        contentType: 'application/pdf',
      },
    });
    expect(fixture.requests[1].credentials).toBeUndefined();
    expect(fixture.requests[2].credentials).toBe('include');
    expect(fixture.requests[2].body).not.toHaveProperty('file');
  });

  it('uses the direct JSON save path when no document is attached', async () => {
    const fixture = installSyntheticHttpApi();
    const client = createProductionWorkflowDataClient();

    const result = await client.requestMeeting(meetingInput(), session);

    expect(result).toMatchObject({ ok: true, persisted: true, data: { id: MEETING_REQUEST_ID, status: 'Pending' } });
    expect(fixture.stages).toEqual(['save']);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0].body).not.toHaveProperty('document');
  });

  it('rejects backend-incompatible PDF names before target creation with a safe explanation', async () => {
    const fixture = installSyntheticHttpApi();
    const client = createProductionWorkflowDataClient();
    const file = syntheticMeetingPdf('request (1).pdf');
    const serverTarget = meetingDocumentTargetSchema.safeParse({
      organizationId: 'synthetic-org',
      dateEntryId: 'availability-1',
      requestedDate: '2026-11-12',
      requestedTime: '14:00',
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    let thrown: unknown;

    try {
      await client.requestMeeting(meetingInput(file), session);
    } catch (error) {
      thrown = error;
    }

    expect(serverTarget.success).toBe(false);
    expect(thrown).toMatchObject({ name: 'UserFacingError' });
    expect(safeErrorMessage(thrown, FALLBACK)).toMatch(/Use a PDF file name of up to 128 characters/i);
    expect(safeErrorMessage(thrown, FALLBACK)).not.toBe(FALLBACK);
    expect(fixture.stages).toEqual([]);
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.savedMeetings).toHaveLength(0);
  });

  it('returns unknown after a committed save response is lost, then exposes the record through My requests', async () => {
    const fixture = installSyntheticHttpApi({ loseSaveResponse: true });
    const client = createProductionWorkflowDataClient();

    const result = await client.requestMeeting(meetingInput(syntheticMeetingPdf()), session);
    const readback = await client.listMyMeetingRequests(session);

    expect(result).toMatchObject({ ok: true, persisted: 'unconfirmed', reason: 'error' });
    expect(result.data).toBeUndefined();
    expect(fixture.stages).toEqual(['target', 'put', 'save', 'readback']);
    expect(fixture.savedMeetings).toHaveLength(1);
    expect(readback.data).toMatchObject([{ id: MEETING_REQUEST_ID, requesterUid: session.uid, status: 'Pending' }]);
  });

  it('treats a duplicate save response as unconfirmed and confirms the existing stable record by readback', async () => {
    const fixture = installSyntheticHttpApi({ rejectSaveStatus: 409 });
    const client = createProductionWorkflowDataClient();

    const result = await client.requestMeeting(meetingInput(), session);
    const readback = await client.listMyMeetingRequests(session);

    expect(result).toMatchObject({ ok: true, persisted: 'unconfirmed', reason: 'error' });
    expect(fixture.stages).toEqual(['save', 'readback']);
    expect(fixture.savedMeetings).toHaveLength(1);
    expect(readback.data).toMatchObject([{ id: MEETING_REQUEST_ID, requesterUid: session.uid, status: 'Pending' }]);
  });

  it('keeps a definitive authorization rejection separate from unknown save outcomes', async () => {
    const fixture = installSyntheticHttpApi({ rejectSaveStatus: 403 });
    const client = createProductionWorkflowDataClient();

    await expect(client.requestMeeting(meetingInput(), session)).rejects.toMatchObject({ code: 'unauthenticated', status: 403 });
    expect(fixture.stages).toEqual(['save']);
    expect(fixture.savedMeetings).toHaveLength(0);
  });
});
