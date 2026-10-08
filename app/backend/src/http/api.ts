import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { AppError, assertAppError } from '../errors';
import { requireBearerToken } from './auth';
import { getUserSession } from '../identity/session';
import { requestVerifiedEmailChange, updateDisplayName } from '../identity/accountSettings';
import { approveOfficerGrant, assignInitialOrganizationOwner, revokeOfficerGrant } from '../organizations/service';
import { attachAuthToPaymentRequest, paymentHandlers, sendPaymentResult } from '../paymentsAdapter';

function sendError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    const problems = Object.fromEntries(error.issues.map((issue) => [issue.path.join('.') || 'request', issue.message]));
    res.status(400).json({ code: 'validation_problem', message: 'The request contains invalid fields.', problems });
    return;
  }

  const appError = assertAppError(error);
  res.status(appError.status).json({ code: appError.code, message: appError.message, action: appError.action });
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

async function requireAdmin(req: Request) {
  const user = await requireBearerToken(req);
  if (user.soarAdmin !== true) {
    throw new AppError('admin_required', 'Project administrator access is required for this setup action.', 403);
  }

  return user;
}

export function createApiApp() {
  const app = express();
  app.use(cors({ origin: true }));

  app.post(['/webhooks/paymongo', '/api/webhooks/paymongo'], express.raw({ type: '*/*', limit: '256kb' }), asyncRoute(async (req, res) => {
    (req as Request & { rawBody?: Buffer }).rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');
    await sendPaymentResult(res, paymentHandlers().paymongoWebhook(req));
  }));

  app.use(express.json({ limit: '256kb' }));

  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ ok: true, service: 'soar-backend', scope: 'identity-organization-payments-foundation' });
  });

  app.get(['/session', '/api/session'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await getUserSession(user));
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
    await sendPaymentResult(res, paymentHandlers().startRegistrationPayment(req));
  }));

  app.get(['/payments/registration/status', '/api/payments/registration/status'], asyncRoute(async (req, res) => {
    await sendPaymentResult(res, paymentHandlers().getCheckoutStatus(req));
  }));

  app.post(['/payments/registration/complete', '/api/payments/registration/complete'], asyncRoute(async (req, res) => {
    await sendPaymentResult(res, paymentHandlers().registerAccount(req));
  }));

  app.post(['/payments/registration/recover', '/api/payments/registration/recover'], asyncRoute(async (req, res) => {
    await sendPaymentResult(res, paymentHandlers().recoverPaidRegistration(req));
  }));

  app.post(['/payments/renewals/start', '/api/payments/renewals/start'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().requestManualRenewal(attachAuthToPaymentRequest(req, user)));
  }));

  app.get(['/payments/access/status', '/api/payments/access/status'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    await sendPaymentResult(res, paymentHandlers().getAccessStatus(attachAuthToPaymentRequest(req, user)));
  }));

  app.post(['/organizations/:orgId/officer-grants', '/api/organizations/:orgId/officer-grants'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await approveOfficerGrant(user, getParam(req, 'orgId'), req.body));
  }));

  app.delete(['/organizations/:orgId/officer-grants/:uid', '/api/organizations/:orgId/officer-grants/:uid'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await revokeOfficerGrant(user, getParam(req, 'orgId'), getParam(req, 'uid')));
  }));

  app.post(['/admin/organizations', '/api/admin/organizations'], asyncRoute(async (req, res) => {
    const admin = await requireAdmin(req);
    res.status(201).json(await assignInitialOrganizationOwner(req.body, admin.uid));
  }));

  app.use((_req, res) => {
    res.status(404).json({ code: 'not_found', message: 'Endpoint not found.' });
  });

  return app;
}
