import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../lib/contracts';
import { createProductionWorkflowDataClient } from './apiClient';

const session = { uid: 'student-1', displayName: 'Student One' } as UserSession;

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('production workflow application intake API', () => {
  it('patches only the applicationsOpen field on the existing organization profile route', async () => {
    vi.stubEnv('VITE_SOAR_API_BASE_URL', 'https://soar-api.example.test');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'robotics', applicationsOpen: false }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProductionWorkflowDataClient().setApplicationsOpen('robotics', false, session);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://soar-api.example.test/organizations/robotics');
    expect(request?.method).toBe('PATCH');
    expect(JSON.parse(String(request?.body))).toEqual({ applicationsOpen: false });
    expect(result).toMatchObject({ ok: true, persisted: true, data: { applicationsOpen: false } });
  });

  it('keeps legacy organization profiles open when the intake setting is absent', async () => {
    vi.stubEnv('VITE_SOAR_API_BASE_URL', 'https://soar-api.example.test');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      id: 'robotics',
      slug: 'robotics',
      name: 'Robotics Organization',
      shortDescription: 'Student robotics group',
      description: 'A legacy organization without an intake setting.',
      contactEmail: 'robotics@example.test',
      recruitment: { title: 'Membership', opportunityId: 'robotics-membership' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createProductionWorkflowDataClient().getOrganization('robotics', session);

    expect(result.data?.applicationsOpen).toBe(true);
  });
});
