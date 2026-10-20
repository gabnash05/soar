import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AccountRole, ApplicationStatus, MeetingStatus, OrganizationDocument } from '../src/contracts/schema';
import type { ApplicationDocument, CalendarEntryDocument, MeetingRequestDocument, RequestStore } from '../src/requests/contracts';
import { createRequestService, verifyMeetingDocumentMetadata } from '../src/requests/service';

const fixedNow = Timestamp.fromDate(new Date('2026-10-08T12:00:00.000Z'));

function user(uid: string): DecodedIdToken {
  return { uid, email_verified: true } as DecodedIdToken;
}

class FakeRequestStore implements RequestStore {
  accounts = new Map<string, { uid: string; role: AccountRole; displayName: string }>();
  organizations = new Map<string, OrganizationDocument>();
  grants = new Map<string, { status?: string }>();
  calendarEntries = new Map<string, CalendarEntryDocument>();
  applications = new Map<string, ApplicationDocument>();
  meetings = new Map<string, MeetingRequestDocument>();
  closeIntakeBeforeNextApplicationCreate = false;

  async getAccount(uid: string) {
    return this.accounts.get(uid);
  }

  async getOrganization(orgId: string) {
    return this.organizations.get(orgId);
  }

  async getOfficerGrant(orgId: string, uid: string) {
    return this.grants.get(`${orgId}/${uid}`);
  }

  async getCalendarEntry(dateEntryId: string) {
    return this.calendarEntries.get(dateEntryId);
  }

  async createApplicationIfAbsent(applicationId: string, application: ApplicationDocument) {
    if (this.closeIntakeBeforeNextApplicationCreate) {
      this.closeIntakeBeforeNextApplicationCreate = false;
      const organization = this.organizations.get(application.orgId);
      if (organization) organization.applicationsOpen = false;
    }
    const organization = this.organizations.get(application.orgId);
    if (!organization) return 'organization_missing' as const;
    if (organization.applicationsOpen === false) return 'closed' as const;
    if (this.applications.has(applicationId) || [...this.applications.values()].some(
      (existing) => existing.studentUid === application.studentUid && existing.orgId === application.orgId,
    )) return 'exists' as const;
    this.applications.set(applicationId, application);
    return 'created' as const;
  }

  async getApplication(applicationId: string) {
    return this.applications.get(applicationId);
  }

  async listApplicationsByStudent(studentUid: string) {
    return [...this.applications.values()].filter((application) => application.studentUid === studentUid);
  }

  async listApplicationsByOrganization(orgId: string) {
    return [...this.applications.values()].filter((application) => application.orgId === orgId);
  }

  async updateApplicationStage(applicationId: string, orgId: string, status: ApplicationStatus, reviewerUid: string, reviewedAt: Timestamp) {
    const current = this.applications.get(applicationId);
    if (!current || current.orgId !== orgId) return undefined;
    const next = { ...current, status, reviewedByUid: reviewerUid, reviewedAt, updatedAt: reviewedAt };
    this.applications.set(applicationId, next);
    return next;
  }

  async createMeetingIfAbsent(meetingRequestId: string, meeting: MeetingRequestDocument) {
    if (this.meetings.has(meetingRequestId)) return 'exists' as const;
    this.meetings.set(meetingRequestId, meeting);
    return 'created' as const;
  }

  async getMeetingRequest(meetingRequestId: string) {
    return this.meetings.get(meetingRequestId);
  }

  async listMeetingsByRequester(requesterUid: string) {
    return [...this.meetings.values()].filter((meeting) => meeting.requesterUid === requesterUid);
  }

  async listMeetingsByOrganization(orgId: string) {
    return [...this.meetings.values()].filter((meeting) => meeting.orgId === orgId);
  }

  async updateMeetingStatus(meetingRequestId: string, orgId: string, status: MeetingStatus, decidedByUid: string, decidedAt: Timestamp) {
    const current = this.meetings.get(meetingRequestId);
    if (!current || current.orgId !== orgId) return undefined;
    const next = { ...current, status, decidedByUid, decidedAt, updatedAt: decidedAt };
    this.meetings.set(meetingRequestId, next);
    return next;
  }
}

function seedStore() {
  const store = new FakeRequestStore();
  store.accounts.set('student', { uid: 'student', role: 'student', displayName: 'Student User' });
  store.accounts.set('student2', { uid: 'student2', role: 'student', displayName: 'Second Student' });
  store.accounts.set('sponsor', { uid: 'sponsor', role: 'sponsor', displayName: 'Sponsor User' });
  store.accounts.set('owner', { uid: 'owner', role: 'student', displayName: 'Owner User' });
  store.accounts.set('officer', { uid: 'officer', role: 'student', displayName: 'Officer User' });
  store.accounts.set('foreign', { uid: 'foreign', role: 'student', displayName: 'Foreign User' });
  store.organizations.set('org1', {
    orgId: 'org1',
    name: 'Robotics Club',
    slug: 'robotics-club',
    ownerUid: 'owner',
    shortDescription: 'Robotics',
    description: 'Build robots.',
    contactEmail: 'robotics@example.test',
    recruitment: {
      opportunityId: 'org1-member-2026',
      title: 'Member 2026',
      requirements: 'External form',
      instructions: 'Submit externally and confirm.',
      applicationLink: 'https://forms.example.test/apply'
    },
    createdAt: fixedNow,
    updatedAt: fixedNow,
    createdByUid: 'admin'
  });
  store.grants.set('org1/officer', { status: 'active' });
  store.calendarEntries.set('availability1', {
    orgId: 'org1',
    organizationName: 'Robotics Club',
    kind: 'availability',
    title: 'Interview window',
    date: '2026-11-12',
    startTime: '09:00',
    endTime: '12:00'
  });
  store.calendarEntries.set('event1', {
    orgId: 'org1',
    kind: 'event',
    title: 'Build Night',
    date: '2026-11-10'
  });
  return store;
}

function serviceFor(store: FakeRequestStore, verifyMeetingDocumentUpload = async () => undefined) {
  return createRequestService({
    store,
    ensureActiveAccess: async () => undefined,
    now: () => fixedNow,
    verifyMeetingDocumentUpload
  });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

async function expectValidation(promise: Promise<unknown>) {
  await expect(promise).rejects.toHaveProperty('issues');
}

describe('meeting document metadata diagnostics', () => {
  it('logs only allowlisted match booleans and a safe shape category on binding mismatch', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const check = {
      document: {
        storagePath: 'private/meeting-secret-path/formal-request.pdf',
        fileName: 'private-form-name.pdf',
        contentType: 'application/pdf' as const,
        sizeBytes: 620,
      },
      requesterUid: 'private-requester-uid',
      orgId: 'private-organization-id',
      meetingRequestId: 'private-meeting-id',
    };
    const metadata = {
      contentType: 'application/pdf',
      sizeBytes: 620,
      metadataShape: 'outer' as const,
      customMetadata: {
        orgId: 'observed-private-organization',
        meetingRequestId: 'private-meeting-id',
        providerSecretKey: 'Bearer private-provider-token',
        providerRawBody: 'private raw provider body',
      },
    };

    try {
      let thrown: unknown;
      try {
        verifyMeetingDocumentMetadata(check, metadata);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({ code: 'meeting_document_metadata_mismatch', status: 400 });
      expect(diagnostic).toHaveBeenCalledWith('Meeting document metadata verification failed', JSON.stringify({
        event: 'meeting_document_metadata_binding_mismatch',
        metadataShape: 'outer',
        contentTypeMatches: true,
        sizeMatches: true,
        organizationBindingPresent: true,
        organizationBindingMatches: false,
        meetingBindingPresent: true,
        meetingBindingMatches: true,
        requesterBindingPresent: false,
        requesterBindingMatches: false,
      }));
      const emitted = JSON.stringify(diagnostic.mock.calls);
      for (const privateValue of [
        check.document.storagePath,
        check.document.fileName,
        check.requesterUid,
        check.orgId,
        check.meetingRequestId,
        metadata.customMetadata.orgId,
        metadata.customMetadata.meetingRequestId,
        metadata.customMetadata.providerSecretKey,
        metadata.customMetadata.providerRawBody,
        'orgId',
        'meetingRequestId',
        'requesterUid',
        'providerSecretKey',
      ]) {
        expect(emitted).not.toContain(privateValue);
      }
    } finally {
      diagnostic.mockRestore();
    }
  });

  it('does not emit the binding diagnostic before content and size validation passes', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => verifyMeetingDocumentMetadata({
        document: { storagePath: 'private/file.pdf', fileName: 'file.pdf', contentType: 'application/pdf', sizeBytes: 620 },
        requesterUid: 'requester',
        orgId: 'org',
        meetingRequestId: 'meeting',
      }, {
        contentType: 'image/png',
        sizeBytes: 620,
        customMetadata: {},
      })).toThrow();
      expect(diagnostic).not.toHaveBeenCalled();
    } finally {
      diagnostic.mockRestore();
    }
  });
});

describe('request service application workflow', () => {
  let store: FakeRequestStore;

  beforeEach(() => {
    store = seedStore();
  });

  it('requires explicit external-form acknowledgement before creating a student application', async () => {
    const service = serviceFor(store);
    await expectValidation(service.confirmExternalApplication(user('student'), {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: false,
      confirmedExternalSubmission: true
    }));

    const record = await service.confirmExternalApplication(user('student'), {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    });

    expect(record.stage).toBe('Pending');
    expect(record.confirmedExternalSubmissionAt).toBe('2026-10-08T12:00:00.000Z');
    expect(store.applications.size).toBe(1);
  });

  it('prevents a second application by the same student when the organization posts a different opportunity', async () => {
    const service = serviceFor(store);
    const input = {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    };

    await service.confirmExternalApplication(user('student'), input);
    const organization = store.organizations.get('org1')!;
    organization.recruitment = { ...(organization.recruitment ?? {}), opportunityId: 'org1-member-2027', title: 'Member 2027' };
    await expectCode(service.confirmExternalApplication(user('student'), { ...input, opportunityId: 'org1-member-2027' }), 'duplicate_application');
    expect(store.applications.size).toBe(1);
  });

  it('serializes concurrent same-account organization submissions to one application', async () => {
    const service = serviceFor(store);
    const input = {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    };

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.confirmExternalApplication(user('student'), input)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(7);
    expect(store.applications.size).toBe(1);
    expect(await service.listMyApplications(user('student'))).toHaveLength(1);
  });

  it('keeps application uniqueness independent across accounts and organizations', async () => {
    const service = serviceFor(store);
    const organization = store.organizations.get('org1')!;
    store.organizations.set('org2', {
      ...organization,
      orgId: 'org2',
      name: 'Architecture Club',
      slug: 'architecture-club',
      recruitment: { ...(organization.recruitment ?? {}), opportunityId: 'org2-member-2026' }
    });
    const confirmation = (studentUid: string, organizationId: string, opportunityId: string) => service.confirmExternalApplication(user(studentUid), {
      organizationId,
      opportunityId,
      externalFormOpened: true,
      confirmedExternalSubmission: true
    });

    await Promise.all([
      confirmation('student', 'org1', 'org1-member-2026'),
      confirmation('student', 'org2', 'org2-member-2026'),
      confirmation('student2', 'org1', 'org1-member-2026')
    ]);
    expect(store.applications.size).toBe(3);
  });

  it('rejects closed intake, including a close racing an already-open confirmation', async () => {
    const service = serviceFor(store);
    const input = {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    };
    store.organizations.get('org1')!.applicationsOpen = false;
    await expectCode(service.confirmExternalApplication(user('student'), input), 'applications_closed');
    expect(store.applications.size).toBe(0);

    store.organizations.get('org1')!.applicationsOpen = true;
    store.closeIntakeBeforeNextApplicationCreate = true;
    await expectCode(service.confirmExternalApplication(user('student'), input), 'applications_closed');
    expect(store.organizations.get('org1')?.applicationsOpen).toBe(false);
    expect(store.applications.size).toBe(0);
  });

  it('preserves an existing legacy application and its status across close and reopen', async () => {
    const service = serviceFor(store);
    store.applications.set('legacy-application-record', {
      applicationId: 'legacy-application-record',
      studentUid: 'student',
      studentName: 'Student User',
      orgId: 'org1',
      organizationName: 'Robotics Club',
      opportunityId: 'org1-member-2025',
      opportunityTitle: 'Member 2025',
      status: 'Declined',
      externalFormOpenedAt: fixedNow,
      externalSubmissionConfirmedAt: fixedNow,
      createdAt: fixedNow,
      updatedAt: fixedNow
    });
    const input = {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    };

    store.organizations.get('org1')!.applicationsOpen = false;
    await expect(service.listMyApplications(user('student'))).resolves.toMatchObject([{ id: 'legacy-application-record', stage: 'Declined' }]);
    store.organizations.get('org1')!.applicationsOpen = true;
    await expectCode(service.confirmExternalApplication(user('student'), input), 'duplicate_application');
    expect(store.applications.size).toBe(1);
    expect(store.applications.get('legacy-application-record')?.status).toBe('Declined');
    await expect(service.listMyApplications(user('student'))).resolves.toMatchObject([{ id: 'legacy-application-record', stage: 'Declined' }]);
  });

  it('blocks sponsor applications and non-manager applicant queues', async () => {
    const service = serviceFor(store);
    await expectCode(service.confirmExternalApplication(user('sponsor'), {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    }), 'student_required');

    await expectCode(service.listOrganizationApplications(user('foreign'), 'org1'), 'not_organization_manager');
  });

  it('lets approved organization managers update exact application stages only', async () => {
    const service = serviceFor(store);
    const created = await service.confirmExternalApplication(user('student'), {
      organizationId: 'org1',
      opportunityId: 'org1-member-2026',
      externalFormOpened: true,
      confirmedExternalSubmission: true
    });

    const updated = await service.updateApplicationStage(user('officer'), created.id, 'org1', { status: 'Under review' });
    expect(updated.stage).toBe('Under review');
    await expectValidation(service.updateApplicationStage(user('officer'), created.id, 'org1', { status: 'Interview' }));
  });
});

describe('request service meeting workflow', () => {
  let store: FakeRequestStore;

  beforeEach(() => {
    store = seedStore();
  });

  it('creates pending meeting requests from posted availability for students and sponsors', async () => {
    const service = serviceFor(store);
    const studentMeeting = await service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      note: 'Submitted application externally.'
    });
    const sponsorMeeting = await service.requestMeeting(user('sponsor'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '10:00'
    });

    expect(studentMeeting.status).toBe('Pending');
    expect(sponsorMeeting.status).toBe('Pending');
    expect(store.meetings.size).toBe(2);
    expect(store.meetings.get(studentMeeting.id)).not.toHaveProperty('document');
    expect(store.meetings.get(sponsorMeeting.id)).not.toHaveProperty('note');
    expect(store.meetings.get(sponsorMeeting.id)).not.toHaveProperty('document');
  });

  it('creates validated private PDF document targets and stores matching request metadata', async () => {
    const verifyUpload = vi.fn(async () => undefined);
    const service = serviceFor(store, verifyUpload);
    const target = await service.createMeetingDocumentTarget(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      fileName: 'formal-request.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    });

    expect(target.storagePath).toMatch(/^meeting-request-documents\/org1\/meeting_/);
    expect(target.allowedContentTypes).toEqual(['application/pdf']);

    const meeting = await service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      document: {
        storagePath: target.storagePath,
        fileName: 'formal-request.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024
      }
    });

    expect(meeting.document?.storagePath).toBe(target.storagePath);
    expect(verifyUpload).toHaveBeenCalledWith(expect.objectContaining({ requesterUid: 'student', orgId: 'org1', meetingRequestId: target.meetingRequestId }));
    await expectValidation(service.createMeetingDocumentTarget(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      fileName: 'script.html',
      contentType: 'text/html',
      sizeBytes: 1024
    }));
  });

  it('rejects missing or mismatched actual meeting document uploads before creating the request', async () => {
    const service = serviceFor(store, async () => {
      throw Object.assign(new Error('missing upload'), { code: 'meeting_document_missing' });
    });
    const target = await service.createMeetingDocumentTarget(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      fileName: 'formal-request.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    });

    await expect(service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      document: {
        storagePath: target.storagePath,
        fileName: 'formal-request.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024
      }
    })).rejects.toMatchObject({ code: 'meeting_document_missing' });
    expect(store.meetings.size).toBe(0);
  });

  it('rejects meeting document paths that do not match the deterministic request id', async () => {
    const service = serviceFor(store);
    await expectCode(service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      document: {
        storagePath: 'meeting-request-documents/org1/meeting_attacker/formal-request.pdf',
        fileName: 'formal-request.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024
      }
    }), 'invalid_meeting_document_path');
  });

  it('rejects duplicate identical meeting requests and event entries', async () => {
    const service = serviceFor(store);
    const input = {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30'
    };

    await service.requestMeeting(user('student'), input);
    await expectCode(service.requestMeeting(user('student'), input), 'duplicate_meeting_request');
    await expectCode(service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'event1',
      requestedDate: '2026-11-10',
      requestedTime: '18:00'
    }), 'date_entry_not_availability');
  });

  it('returns requester history, private documents, and organization queues through scoped service methods', async () => {
    const service = serviceFor(store);
    const target = await service.createMeetingDocumentTarget(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      fileName: 'formal-request.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    });
    const meeting = await service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30',
      document: { storagePath: target.storagePath, fileName: 'formal-request.pdf', contentType: 'application/pdf', sizeBytes: 1024 }
    });

    await expect(service.listMyMeetings(user('student'))).resolves.toHaveLength(1);
    await expect(service.getMeetingDocument(user('student'), meeting.id)).resolves.toMatchObject({ document: { storagePath: target.storagePath } });
    await expect(service.getMeetingDocument(user('officer'), meeting.id)).resolves.toMatchObject({ document: { storagePath: target.storagePath } });
    await expectCode(service.getMeetingDocument(user('foreign'), meeting.id), 'not_organization_manager');
    store.grants.set('org1/officer', { status: 'revoked' });
    await expectCode(service.getMeetingDocument(user('officer'), meeting.id), 'not_organization_manager');
    await expect(service.listOrganizationMeetings(user('owner'), 'org1')).resolves.toHaveLength(1);
  });

  it('lets a granted officer accept or decline their own requests and repeat the same decision safely', async () => {
    const service = serviceFor(store);
    const ownApproved = await service.requestMeeting(user('officer'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30'
    });
    const ownDeclined = await service.requestMeeting(user('officer'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:45'
    });

    const approvals = await Promise.all(Array.from({ length: 3 }, () =>
      service.updateMeetingStatus(user('officer'), ownApproved.id, 'org1', { status: 'Approved' }),
    ));
    const declined = await service.updateMeetingStatus(user('officer'), ownDeclined.id, 'org1', { status: 'Declined' });

    expect(approvals.map((decision) => decision.status)).toEqual(['Approved', 'Approved', 'Approved']);
    expect(declined.status).toBe('Declined');
    expect(store.meetings.get(ownApproved.id)).toMatchObject({ status: 'Approved', decidedByUid: 'officer', decidedAt: fixedNow });
    expect(store.meetings.get(ownDeclined.id)).toMatchObject({ status: 'Declined', decidedByUid: 'officer', decidedAt: fixedNow });
  });

  it('keeps decisions on other requests working and rejects missing or cross-organization grants', async () => {
    const service = serviceFor(store);
    const otherRequest = await service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30'
    });
    const approved = await service.updateMeetingStatus(user('officer'), otherRequest.id, 'org1', { status: 'Approved' });
    expect(approved.status).toBe('Approved');

    store.organizations.set('org2', {
      ...store.organizations.get('org1')!,
      orgId: 'org2',
      name: 'Architecture Club',
      slug: 'architecture-club'
    });
    store.calendarEntries.set('availability2', {
      orgId: 'org2',
      organizationName: 'Architecture Club',
      kind: 'availability',
      title: 'Studio consultation',
      date: '2026-11-12',
      startTime: '09:00',
      endTime: '12:00'
    });
    const crossOrganizationRequest = await service.requestMeeting(user('student'), {
      organizationId: 'org2',
      dateEntryId: 'availability2',
      requestedDate: '2026-11-12',
      requestedTime: '10:00'
    });
    await expectCode(service.updateMeetingStatus(user('officer'), crossOrganizationRequest.id, 'org2', { status: 'Approved' }), 'not_organization_manager');
    await expectCode(service.updateMeetingStatus(user('officer'), crossOrganizationRequest.id, 'org1', { status: 'Approved' }), 'meeting_request_missing');

    store.grants.delete('org1/officer');
    await expectCode(service.updateMeetingStatus(user('officer'), otherRequest.id, 'org1', { status: 'Approved' }), 'not_organization_manager');
    store.grants.set('org1/officer', { status: 'revoked' });
    await expectCode(service.updateMeetingStatus(user('officer'), otherRequest.id, 'org1', { status: 'Approved' }), 'not_organization_manager');
    await expectCode(service.updateMeetingStatus(user('student'), otherRequest.id, 'org1', { status: 'Approved' }), 'not_organization_manager');
    await expectCode(service.updateMeetingStatus(user('sponsor'), otherRequest.id, 'org1', { status: 'Approved' }), 'not_organization_manager');
    store.accounts.set('admin', { uid: 'admin', role: 'admin', displayName: 'Admin User' });
    await expectCode(service.updateMeetingStatus(user('admin'), otherRequest.id, 'org1', { status: 'Approved' }), 'not_organization_manager');
  });

  it('requires active verified access before an otherwise authorized officer can decide a request', async () => {
    const created = await serviceFor(store).requestMeeting(user('officer'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30'
    });
    const guardedAccessService = createRequestService({
      store,
      ensureActiveAccess: async (actor) => {
        if (actor.email_verified !== true) throw Object.assign(new Error('Verify your email first.'), { code: 'email_not_verified' });
        throw Object.assign(new Error('Access is expired.'), { code: 'access_inactive' });
      },
      now: () => fixedNow,
      verifyMeetingDocumentUpload: async () => undefined
    });

    await expectCode(guardedAccessService.updateMeetingStatus(user('officer'), created.id, 'org1', { status: 'Approved' }), 'access_inactive');
    await expectCode(guardedAccessService.updateMeetingStatus({ ...user('officer'), email_verified: false } as DecodedIdToken, created.id, 'org1', { status: 'Approved' }), 'email_not_verified');
  });

  it('lets the assigned organization owner approve and decline requests without an interview stage', async () => {
    const service = serviceFor(store);
    const created = await service.requestMeeting(user('student'), {
      organizationId: 'org1',
      dateEntryId: 'availability1',
      requestedDate: '2026-11-12',
      requestedTime: '09:30'
    });

    const approved = await service.updateMeetingStatus(user('owner'), created.id, 'org1', { status: 'Approved' });
    expect(approved.status).toBe('Approved');
    await expectValidation(service.updateMeetingStatus(user('owner'), created.id, 'org1', { status: 'Interview' }));
  });
});
