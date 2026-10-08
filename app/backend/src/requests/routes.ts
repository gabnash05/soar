import type { Express, Request, Response } from 'express';
import { requestService } from './service';
import { requireBearerToken } from '../http/auth';

type AsyncRoute = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) => void;

function getParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function mountRequestRoutes(app: Express, asyncRoute: AsyncRoute) {
  app.post(['/requests/applications/confirm', '/api/requests/applications/confirm'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await requestService.confirmExternalApplication(user, req.body));
  }));

  app.get(['/requests/applications/mine', '/api/requests/applications/mine'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.listMyApplications(user));
  }));

  app.get(['/requests/organizations/:orgId/applications', '/api/requests/organizations/:orgId/applications'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.listOrganizationApplications(user, getParam(req, 'orgId')));
  }));

  app.patch(['/requests/organizations/:orgId/applications/:applicationId/stage', '/api/requests/organizations/:orgId/applications/:applicationId/stage'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.updateApplicationStage(user, getParam(req, 'applicationId'), getParam(req, 'orgId'), req.body));
  }));

  app.post(['/requests/meetings', '/api/requests/meetings'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await requestService.requestMeeting(user, req.body));
  }));

  app.get(['/requests/meetings/mine', '/api/requests/meetings/mine'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.listMyMeetings(user));
  }));

  app.get(['/requests/organizations/:orgId/meetings', '/api/requests/organizations/:orgId/meetings'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.listOrganizationMeetings(user, getParam(req, 'orgId')));
  }));

  app.patch(['/requests/organizations/:orgId/meetings/:meetingRequestId/status', '/api/requests/organizations/:orgId/meetings/:meetingRequestId/status'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.updateMeetingStatus(user, getParam(req, 'meetingRequestId'), getParam(req, 'orgId'), req.body));
  }));
}
