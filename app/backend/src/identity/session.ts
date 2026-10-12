import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminSessionInfo } from '../admin/statistics';
import { getAccessState, listApprovedOfficerGrants, syncVerifiedAuthEmail } from './access';

export async function getUserSession(user: DecodedIdToken) {
  const [account, access] = await Promise.all([
    syncVerifiedAuthEmail(user.uid),
    getAccessState(user.uid)
  ]);

  const expiresAt = access.accessExpiresAt?.toDate().toISOString();
  const admin = adminSessionInfo(user, account);
  const officerGrants = account.role === 'admin' ? [] : await listApprovedOfficerGrants(user.uid);
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
      renewalAvailable: account.role === 'admin' ? false : access.status !== 'active'
    },
    officerGrants,
    ...(admin ? { admin } : {})
  };
}
