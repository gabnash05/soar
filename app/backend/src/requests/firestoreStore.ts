import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { accountPath, COLLECTIONS, officerGrantPath, organizationPath } from '../contracts/paths';
import type { AccountRole, ApplicationStatus, OrganizationDocument, MeetingStatus } from '../contracts/schema';
import type { ApplicationDocument, CalendarEntryDocument, MeetingRequestDocument, RequestStore } from './contracts';

const MAX_TRACKER_RESULTS = 100;
const MAX_OFFICER_QUEUE_RESULTS = 250;

export class FirestoreRequestStore implements RequestStore {
  constructor(private readonly db: Firestore) {}

  async getAccount(uid: string): Promise<{ uid: string; role: AccountRole; displayName: string } | undefined> {
    const snap = await this.db.doc(accountPath(uid)).get();
    if (!snap.exists) return undefined;
    const data = snap.data();
    return {
      uid,
      role: data?.role,
      displayName: data?.displayName ?? 'SOAR user'
    } as { uid: string; role: AccountRole; displayName: string };
  }

  async getOrganization(orgId: string): Promise<OrganizationDocument | undefined> {
    const snap = await this.db.doc(organizationPath(orgId)).get();
    return snap.exists ? snap.data() as OrganizationDocument : undefined;
  }

  async getOfficerGrant(orgId: string, uid: string): Promise<{ status?: string } | undefined> {
    const snap = await this.db.doc(officerGrantPath(orgId, uid)).get();
    return snap.exists ? snap.data() as { status?: string } : undefined;
  }

  async getCalendarEntry(dateEntryId: string): Promise<CalendarEntryDocument | undefined> {
    const snap = await this.db.collection(COLLECTIONS.calendarEntries).doc(dateEntryId).get();
    return snap.exists ? snap.data() as CalendarEntryDocument : undefined;
  }

  async createApplicationIfAbsent(applicationId: string, application: ApplicationDocument): Promise<'created' | 'exists' | 'closed' | 'organization_missing'> {
    const applicationRef = this.db.collection(COLLECTIONS.applications).doc(applicationId);
    const organizationRef = this.db.doc(organizationPath(application.orgId));
    const existingApplicationQuery = this.db.collection(COLLECTIONS.applications)
      .where('studentUid', '==', application.studentUid)
      .where('orgId', '==', application.orgId)
      .limit(1);

    return this.db.runTransaction(async (tx) => {
      const [applicationSnap, organizationSnap, existingApplications] = await Promise.all([
        tx.get(applicationRef),
        tx.get(organizationRef),
        tx.get(existingApplicationQuery)
      ]);
      if (!organizationSnap.exists) return 'organization_missing' as const;
      if (organizationSnap.data()?.applicationsOpen === false) return 'closed' as const;
      if (applicationSnap.exists || !existingApplications.empty) return 'exists' as const;
      tx.create(applicationRef, application);
      return 'created' as const;
    });
  }

  async getApplication(applicationId: string): Promise<ApplicationDocument | undefined> {
    const snap = await this.db.collection(COLLECTIONS.applications).doc(applicationId).get();
    return snap.exists ? snap.data() as ApplicationDocument : undefined;
  }

  async listApplicationsByStudent(studentUid: string): Promise<ApplicationDocument[]> {
    const snap = await this.db.collection(COLLECTIONS.applications)
      .where('studentUid', '==', studentUid)
      .orderBy('updatedAt', 'desc')
      .limit(MAX_TRACKER_RESULTS)
      .get();
    return snap.docs.map((doc) => doc.data() as ApplicationDocument);
  }

  async listApplicationsByOrganization(orgId: string): Promise<ApplicationDocument[]> {
    const snap = await this.db.collection(COLLECTIONS.applications)
      .where('orgId', '==', orgId)
      .orderBy('updatedAt', 'desc')
      .limit(MAX_OFFICER_QUEUE_RESULTS)
      .get();
    return snap.docs.map((doc) => doc.data() as ApplicationDocument);
  }

  async updateApplicationStage(applicationId: string, orgId: string, status: ApplicationStatus, reviewerUid: string, reviewedAt: Timestamp): Promise<ApplicationDocument | undefined> {
    const ref = this.db.collection(COLLECTIONS.applications).doc(applicationId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return undefined;
      const current = snap.data() as ApplicationDocument;
      if (current.orgId !== orgId) return undefined;
      const next: ApplicationDocument = {
        ...current,
        status,
        reviewedByUid: reviewerUid,
        reviewedAt,
        updatedAt: reviewedAt
      };
      tx.update(ref, {
        status,
        reviewedByUid: reviewerUid,
        reviewedAt,
        updatedAt: reviewedAt
      });
      return next;
    });
  }

  async createMeetingIfAbsent(meetingRequestId: string, meeting: MeetingRequestDocument): Promise<'created' | 'exists'> {
    const ref = this.db.collection(COLLECTIONS.meetingRequests).doc(meetingRequestId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return 'exists' as const;
      tx.create(ref, meeting);
      return 'created' as const;
    });
  }

  async getMeetingRequest(meetingRequestId: string): Promise<MeetingRequestDocument | undefined> {
    const snap = await this.db.collection(COLLECTIONS.meetingRequests).doc(meetingRequestId).get();
    return snap.exists ? snap.data() as MeetingRequestDocument : undefined;
  }

  async listMeetingsByRequester(requesterUid: string): Promise<MeetingRequestDocument[]> {
    const snap = await this.db.collection(COLLECTIONS.meetingRequests)
      .where('requesterUid', '==', requesterUid)
      .orderBy('updatedAt', 'desc')
      .limit(MAX_TRACKER_RESULTS)
      .get();
    return snap.docs.map((doc) => doc.data() as MeetingRequestDocument);
  }

  async listMeetingsByOrganization(orgId: string): Promise<MeetingRequestDocument[]> {
    const snap = await this.db.collection(COLLECTIONS.meetingRequests)
      .where('orgId', '==', orgId)
      .orderBy('updatedAt', 'desc')
      .limit(MAX_OFFICER_QUEUE_RESULTS)
      .get();
    return snap.docs.map((doc) => doc.data() as MeetingRequestDocument);
  }

  async updateMeetingStatus(meetingRequestId: string, orgId: string, status: MeetingStatus, decidedByUid: string, decidedAt: Timestamp): Promise<MeetingRequestDocument | undefined> {
    const ref = this.db.collection(COLLECTIONS.meetingRequests).doc(meetingRequestId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return undefined;
      const current = snap.data() as MeetingRequestDocument;
      if (current.orgId !== orgId) return undefined;
      const next: MeetingRequestDocument = {
        ...current,
        status,
        decidedByUid,
        decidedAt,
        updatedAt: decidedAt
      };
      tx.update(ref, {
        status,
        decidedByUid,
        decidedAt,
        updatedAt: decidedAt
      });
      return next;
    });
  }
}
