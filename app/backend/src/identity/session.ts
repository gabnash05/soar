import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAccessState, listApprovedOfficerGrants, syncVerifiedAuthEmail } from './access';

export async function getUserSession(user: DecodedIdToken) {
  const [account, access, officerGrants] = await Promise.all([
    syncVerifiedAuthEmail(user.uid),
    getAccessState(user.uid),
    listApprovedOfficerGrants(user.uid)
  ]);

  const expiresAt = access.accessExpiresAt?.toDate().toISOString();
  return {
    uid: user.uid,
    email: account.email,
    displayName: account.displayName,
    accountKind: account.role,
    studentId: account.studentId,
    companyName: account.companyName,
    emailVerified: user.email_verified === true || account.emailVerified,
    access: {
      status: access.status === 'revoked' ? 'expired' : access.status,
      annualFeePhp: 10,
      expiresAt,
      renewalAvailable: access.status !== 'active'
    },
    officerGrants
  };
}
