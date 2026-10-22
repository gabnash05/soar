import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { AppError, assertAppError } from '../errors';
import { requireBearerToken } from './auth';
import { getUserSession } from '../identity/session';
import { requestVerifiedEmailChange, updateDisplayName } from '../identity/accountSettings';
import { createUnpaidPreviewAccount } from '../identity/previewRegistration';
import { getAdminPaymentPolicyStatus, getPaymentPolicyStatus, requirePaymentsForCheckout, setPaymentPolicy } from '../identity/paymentPolicy';
import {
  approveOfficerGrant,
  assignAdminOfficerGrant,
  assignInitialOrganizationOwner,
  listAdminOfficerGrants,
  listAdminOrganizations,
  revokeAdminOfficerGrant,
  revokeOfficerGrant,
  searchAdminStudents
} from '../organizations/service';
import { attachAuthToPaymentRequest, paymentHandlers, sendPaymentResult } from '../paymentsAdapter';
import {
  addAnnouncementComment,
  createAnnouncement,
  createAnnouncementImageTarget,
  createAnnouncementMediaTargets,
  createDateEntry,
  createLogoImageTarget,
  deleteAnnouncement,
  deleteAnnouncementComment,
  deleteDateEntry,
  getAnnouncement,
  getMediaDownloadUrl,
  getOrganizationProfile,
  getStudentDepartmentCounts,
  listAnnouncementComments,
  listAnnouncements,
  listDateEntries,
  listOrganizations,
  scopedDateEntryQuery,
  setAnnouncementLike,
  updateAnnouncement,
  updateAnnouncementComment,
  updateDateEntry,
  updateOrganizationProfile
} from '../content/service';
import { mountRequestRoutes } from '../requests/routes';

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    const problems = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'request', issue.message]));
    res.status(400).json({ code: 'validation_problem', message: 'The request contains invalid fields.', problems });
    return;
  }

  const appError = assertAppError(error);
  res.status(appError.status).json({
    code: appError.code,
    message: appError.message,
    action: appError.action,
    ...(appError.nextChangeAllowedAt ? { nextChangeAllowedAt: appError.nextChangeAllowedAt } : {})
  });
}

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (error) {
      sendError(res, error);
    }
  };
}

function assertPaymentsEnabled(): void {
  if (process.env.SOAR_DISABLE_PAYMENTS?.trim().toLowerCase() === 'true') {
    throw new AppError('payments_unavailable', 'Hosted payment features are disabled by the server deployment setting.', 503);
  }
}

async function assertCheckoutStartAllowed(): Promise<void> {
  assertPaymentsEnabled();
  await requirePaymentsForCheckout();
}

async function requireAdmin(req: Request) {
  const user = await requireBearerToken(req);
  if (user.soarAdmin !== true) {
    throw new AppError('admin_required', 'Project administrator access is required for this setup action.', 403);
  }

  return user;
}

export function createApiApp() {
  const app = express();
  const trustedAppOrigin = new URL(process.env.SOAR_APP_BASE_URL || 'http://localhost:5173').origin;
  app.use(cors({
    origin: (origin, callback) => callback(null, origin === trustedAppOrigin ? origin : false),
    credentials: true
  }));

  app.post(['/webhooks/paymongo', '/api/webhooks/paymongo'], express.raw({ type: '*/*', limit: '256kb' }), asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
    await sendPaymentResult(res, paymentHandlers().paymongoWebhook(req));
  }));

  app.use(express.json({ limit: '256kb' }));

  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ ok: true, service: 'soar-backend', scope: 'identity-payments-content-requests-foundation' });
  });

  app.get(['/storage/download-url', '/api/storage/download-url'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getMediaDownloadUrl(user, req.query.path));
  }));

  app.get(['/payment-policy', '/api/payment-policy'], asyncRoute(async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await getPaymentPolicyStatus());
  }));

  app.get(['/session', '/api/session'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getUserSession(user));
  }));

  app.post(['/accounts/preview-registration', '/api/accounts/preview-registration'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    const result = await createUnpaidPreviewAccount(user, req.body);
    res.status(result.created ? 201 : 200).json(result);
  }));

  app.post(['/account/display-name', '/api/account/display-name'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await updateDisplayName(user, req.body));
  }));

  app.post(['/account/email-change', '/api/account/email-change'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestVerifiedEmailChange(user, req.body));
  }));

  app.post(['/payments/registration/start', '/api/payments/registration/start'], asyncRoute(async (req, res) => {
    await assertCheckoutStartAllowed();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().startAuthenticatedRegistrationPayment(attachAuthToPaymentRequest(req, user)));
  }));

  app.post(['/payments/registration/auth-start', '/api/payments/registration/auth-start'], asyncRoute(async (req, res) => {
    await assertCheckoutStartAllowed();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().startAuthenticatedRegistrationPayment(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/payments/registration/status', '/api/payments/registration/status', '/payments/registration/auth-status', '/api/payments/registration/auth-status'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().getAuthenticatedCheckoutStatus(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/payments/registration/resume', '/api/payments/registration/resume'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().resumeAuthenticatedRegistration(attachAuthToPaymentRequest(req, user)));
  }));

  app.post(['/payments/registration/auth-complete', '/api/payments/registration/auth-complete'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().completeAuthenticatedRegistration(attachAuthToPaymentRequest(req, user)));
  }));

  app.post(['/payments/registration/complete', '/api/payments/registration/complete'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().completeAuthenticatedRegistration(attachAuthToPaymentRequest(req, user)));
  }));

  app.post(['/payments/registration/recover', '/api/payments/registration/recover'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    await requireBearerToken(req);
    throw new AppError('registration_recovery_unavailable', 'Sign in with the same Firebase account to resume registration or use password recovery.', 410, 'sign_in');
  }));

  app.post(['/payments/registration/recover/accept', '/api/payments/registration/recover/accept'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    await requireBearerToken(req);
    throw new AppError('registration_recovery_unavailable', 'Sign in with the same Firebase account to resume registration or use password recovery.', 410, 'sign_in');
  }));

  app.post(['/payments/renewals/start', '/api/payments/renewals/start'], asyncRoute(async (req, res) => {
    await assertCheckoutStartAllowed();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().requestManualRenewal(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/payments/renewals/status', '/api/payments/renewals/status'], asyncRoute(async (req, res) => {
    assertPaymentsEnabled();
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().getRenewalStatus(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/payments/access/status', '/api/payments/access/status'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().getAccessStatus(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/organizations', '/api/organizations'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await listOrganizations(user, req.query));
  }));

  app.get(['/organizations/:orgId', '/api/organizations/:orgId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getOrganizationProfile(user, getParam(req, 'orgId')));
  }));

  app.get(['/organizations/:orgId/student-department-counts', '/api/organizations/:orgId/student-department-counts'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getStudentDepartmentCounts(user, getParam(req, 'orgId')));
  }));

  app.patch(['/organizations/:orgId', '/api/organizations/:orgId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await updateOrganizationProfile(user, getParam(req, 'orgId'), req.body));
  }));

  app.post(['/organizations/:orgId/logo-image-targets', '/api/organizations/:orgId/logo-image-targets'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await createLogoImageTarget(user, getParam(req, 'orgId'), req.body));
  }));

  app.get(['/announcements', '/api/announcements'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await listAnnouncements(user, req.query));
  }));

  app.get(['/announcements/:announcementId', '/api/announcements/:announcementId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getAnnouncement(user, getParam(req, 'announcementId')));
  }));

  app.post(['/organizations/:orgId/announcements/image-targets', '/api/organizations/:orgId/announcements/image-targets'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await createAnnouncementImageTarget(user, getParam(req, 'orgId'), req.body));
  }));

  app.post(['/organizations/:orgId/announcements/media-targets', '/api/organizations/:orgId/announcements/media-targets'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await createAnnouncementMediaTargets(user, getParam(req, 'orgId'), req.body));
  }));

  app.post(['/organizations/:orgId/announcements', '/api/organizations/:orgId/announcements'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await createAnnouncement(user, getParam(req, 'orgId'), req.body));
  }));

  app.patch(['/organizations/:orgId/announcements/:announcementId', '/api/organizations/:orgId/announcements/:announcementId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await updateAnnouncement(user, getParam(req, 'orgId'), getParam(req, 'announcementId'), req.body));
  }));

  app.delete(['/organizations/:orgId/announcements/:announcementId', '/api/organizations/:orgId/announcements/:announcementId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await deleteAnnouncement(user, getParam(req, 'orgId'), getParam(req, 'announcementId')));
  }));

  app.post(['/announcements/:announcementId/like', '/api/announcements/:announcementId/like'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await setAnnouncementLike(user, getParam(req, 'announcementId'), true));
  }));

  app.delete(['/announcements/:announcementId/like', '/api/announcements/:announcementId/like'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await setAnnouncementLike(user, getParam(req, 'announcementId'), false));
  }));

  app.get(['/announcements/:announcementId/comments', '/api/announcements/:announcementId/comments'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await listAnnouncementComments(user, getParam(req, 'announcementId'), req.query));
  }));

  app.post(['/announcements/:announcementId/comments', '/api/announcements/:announcementId/comments'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await addAnnouncementComment(user, getParam(req, 'announcementId'), req.body));
  }));

  app.patch(['/announcements/:announcementId/comments/:commentId', '/api/announcements/:announcementId/comments/:commentId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await updateAnnouncementComment(user, getParam(req, 'announcementId'), getParam(req, 'commentId'), req.body));
  }));

  app.delete(['/announcements/:announcementId/comments/:commentId', '/api/announcements/:announcementId/comments/:commentId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await deleteAnnouncementComment(user, getParam(req, 'announcementId'), getParam(req, 'commentId')));
  }));

  app.get(['/date-entries', '/api/date-entries'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await listDateEntries(user, req.query));
  }));

  app.get(['/organizations/:orgId/date-entries', '/api/organizations/:orgId/date-entries'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await listDateEntries(user, scopedDateEntryQuery(getParam(req, 'orgId'), req.query)));
  }));

  app.post(['/organizations/:orgId/date-entries', '/api/organizations/:orgId/date-entries'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await createDateEntry(user, getParam(req, 'orgId'), req.body));
  }));

  app.patch(['/organizations/:orgId/date-entries/:entryId', '/api/organizations/:orgId/date-entries/:entryId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await updateDateEntry(user, getParam(req, 'orgId'), getParam(req, 'entryId'), req.body));
  }));

  app.delete(['/organizations/:orgId/date-entries/:entryId', '/api/organizations/:orgId/date-entries/:entryId'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await deleteDateEntry(user, getParam(req, 'orgId'), getParam(req, 'entryId')));
  }));

  app.post(['/organizations/:orgId/officer-grants', '/api/organizations/:orgId/officer-grants'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await approveOfficerGrant(user, getParam(req, 'orgId'), req.body));
  }));

  app.delete(['/organizations/:orgId/officer-grants/:uid', '/api/organizations/:orgId/officer-grants/:uid'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await revokeOfficerGrant(user, getParam(req, 'orgId'), getParam(req, 'uid')));
  }));

  app.get(['/admin/payment-policy', '/api/admin/payment-policy'], asyncRoute(async (req, res) => {
    await requireAdmin(req);
    res.set('Cache-Control', 'no-store').json(await getAdminPaymentPolicyStatus());
  }));

  app.put(['/admin/payment-policy', '/api/admin/payment-policy'], asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req);
    res.json(await setPaymentPolicy(req.body, admin.uid));
  }));

  app.get(['/admin/organizations', '/api/admin/organizations'], asyncRoute(async (req, res) => {
    await requireAdmin(req);
    res.json(await listAdminOrganizations(req.query));
  }));

  app.get(['/admin/students', '/api/admin/students'], asyncRoute(async (req, res) => {
    await requireAdmin(req);
    res.json(await searchAdminStudents(req.query));
  }));

  app.post(['/admin/organizations', '/api/admin/organizations'], asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req);
    res.status(201).json(await assignInitialOrganizationOwner(req.body, admin.uid));
  }));

  app.get(['/admin/organizations/:orgId/officer-grants', '/api/admin/organizations/:orgId/officer-grants'], asyncRoute(async (req, res) => {
    await requireAdmin(req);
    res.json(await listAdminOfficerGrants(getParam(req, 'orgId'), req.query));
  }));

  app.post(['/admin/organizations/:orgId/officer-grants', '/api/admin/organizations/:orgId/officer-grants'], asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req);
    res.json(await assignAdminOfficerGrant(getParam(req, 'orgId'), req.body, admin.uid));
  }));

  app.delete(['/admin/organizations/:orgId/officer-grants/:uid', '/api/admin/organizations/:orgId/officer-grants/:uid'], asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req);
    res.json(await revokeAdminOfficerGrant(getParam(req, 'orgId'), getParam(req, 'uid'), admin.uid));
  }));

  mountRequestRoutes(app, asyncRoute);

  app.use((_req, res) => {
    res.status(404).json({ code: 'not_found', message: 'Endpoint not found.' });
  });

  return app;
}
