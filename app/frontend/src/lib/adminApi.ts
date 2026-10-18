import { apiFetch, authHeaders } from './apiClient';

export interface AdminOrganizationOption {
  id: string;
  name: string;
}

export interface AdminOfficerGrantOption {
  uid: string;
  displayName: string;
  status: 'active' | 'revoked';
  isOrganizationOwner: boolean;
}

export interface AdminStudentOption {
  uid: string;
  displayName: string;
  studentId?: string;
}

export interface AdminPage<T> {
  items: T[];
  nextPageToken?: string;
}

export interface CreateAdminOrganizationInput {
  orgId: string;
  slug: string;
  name: string;
  ownerUid: string;
  shortDescription?: string;
  contactEmail?: string;
  department?: string;
}

export async function listAdminOrganizations(pageToken?: string): Promise<AdminPage<AdminOrganizationOption>> {
  const params = new URLSearchParams({ limit: '50' });
  if (pageToken) params.set('pageToken', pageToken);
  return apiFetch(`/admin/organizations?${params}`, { headers: await authHeaders() });
}

export async function listAdminOfficerGrants(organizationId: string, pageToken?: string): Promise<AdminPage<AdminOfficerGrantOption>> {
  const params = new URLSearchParams({ limit: '50' });
  if (pageToken) params.set('pageToken', pageToken);
  return apiFetch(`/admin/organizations/${encodeURIComponent(organizationId)}/officer-grants?${params}`, { headers: await authHeaders() });
}

export async function searchAdminStudents(query: string, pageToken?: string): Promise<AdminPage<AdminStudentOption>> {
  const params = new URLSearchParams({ q: query });
  if (pageToken) params.set('pageToken', pageToken);
  return apiFetch(`/admin/students?${params}`, { headers: await authHeaders() });
}

export async function createAdminOrganization(input: CreateAdminOrganizationInput): Promise<{ orgId: string }> {
  return apiFetch('/admin/organizations', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
}

export async function revokeAdminOfficer(organizationId: string, uid: string): Promise<{
  orgId: string;
  uid: string;
  status: 'revoked';
  alreadyRevoked: boolean;
}> {
  return apiFetch(`/admin/organizations/${encodeURIComponent(organizationId)}/officer-grants/${encodeURIComponent(uid)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
}

export async function assignAdminOfficer(organizationId: string, uid: string): Promise<{
  orgId: string;
  uid: string;
  status: 'approved';
  alreadyAssigned: boolean;
}> {
  return apiFetch(`/admin/organizations/${encodeURIComponent(organizationId)}/officer-grants`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ uid }),
  });
}
