import { setGlobalOptions } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { createApiApp } from './http/api';

setGlobalOptions({ region: process.env.SOAR_FUNCTION_REGION ?? 'asia-southeast1', maxInstances: 10 });

export const api = onRequest({ cors: false }, createApiApp());

export { createPaidAccountFromConfirmedRegistration } from './identity/registration';
export {
  assignAdminOfficerGrant,
  assignInitialOrganizationOwner,
  approveOfficerGrant,
  listAdminOrganizations,
  revokeOfficerGrant,
  searchAdminStudents
} from './organizations/service';
export * from './contracts/schema';
export * from './contracts/paths';
