import type { DecodedIdToken } from 'firebase-admin/auth';
import { getAccessState, listApprovedOfficerGrants, syncVerifiedAuthEmail } from './access';

export async function getUserSession(user: DecodedIdToken) {
  if (user.soarAdmin === true) {
    const email = typeof user.email === 'string' ? user.email : '';
    return {
      uid: user.uid,
      email,
      displayName: typeof user.name === 'string' ? user.name : email || 'Administrator',
      accountKind: 'admin' as const,
      emailVerified: user.email_verified === true,
      access: {
        status: 'missing' as const,
        annualFeePhp: 10 as const,
        feePhp: 10 as const,
        periodMonths: 6,
        periodLabel: '6 months',
        renewalAvailable: true
      },
      officerGrants: []
    };
  }

  const [account, access, officerGrants] = await Promise.all([
    syncVerifiedAuthEmail(user.uid),
    getAccessState(user.uid),
    listApprovedOfficerGrants(user.uid)
  ]);

  const expiresAt = access.accessExpiresAt?.toDate().toISOString();
  const startsAt = access.accessStartsAt?.toDate().toISOString();
  const previewAccess = access.provenance === 'unpaid-preview';
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
      provenance: access.provenance,
      annualFeePhp: 10,
      feePhp: previewAccess ? 0 : 10,
      periodMonths: previewAccess ? undefined : 6,
      periodLabel: previewAccess ? 'Unpaid preview' : '6 months',
      startsAt,
      expiresAt,
      renewalAvailable: !previewAccess && access.status !== 'active'
    },
    officerGrants
  };
}
