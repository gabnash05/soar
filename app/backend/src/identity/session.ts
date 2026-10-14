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
    ...(account.role === 'student' ? { studentId: account.studentId, department: account.department } : {}),
    ...(account.role === 'sponsor' ? { companyName: account.companyName } : {}),
    emailVerified: user.email_verified === true || account.emailVerified,
    access: {
      status: access.status === 'revoked' ? 'expired' : access.status,
      annualFeePhp: 10,
      feePhp: 10,
      periodMonths: 6,
      periodLabel: '6 months',
      expiresAt,
      renewalAvailable: access.status !== 'active'
    },
    officerGrants
  };
}
