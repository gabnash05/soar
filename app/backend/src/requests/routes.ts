import { pipeline } from 'node:stream/promises';
import type { Express, Request, Response } from 'express';
import { requestService } from './service';
import { requireBearerToken } from '../http/auth';
import { defaultStorageBucket } from '../firebase';
import { AppError } from '../errors';

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

  app.post(['/requests/meetings/document-targets', '/api/requests/meetings/document-targets'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await requestService.createMeetingDocumentTarget(user, req.body));
  }));

  app.post(['/requests/meetings', '/api/requests/meetings'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.status(201).json(await requestService.requestMeeting(user, req.body));
  }));

  app.get(['/requests/meetings/mine', '/api/requests/meetings/mine'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    res.json(await requestService.listMyMeetings(user));
  }));

  app.get(['/requests/meetings/:meetingRequestId/document', '/api/requests/meetings/:meetingRequestId/document'], asyncRoute(async (req, res) => {
    const user = await requireBearerToken(req);
    const { document } = await requestService.getMeetingDocument(user, getParam(req, 'meetingRequestId'));
    const file = defaultStorageBucket().file(document.storagePath);
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch {
      throw new AppError('meeting_document_missing', 'The uploaded formal request document was not found.', 404);
    }
    const actualSize = Number(metadata.size ?? 0);
    if (metadata.contentType !== document.contentType || actualSize !== document.sizeBytes) {
      throw new AppError('meeting_document_metadata_mismatch', 'The uploaded formal request document no longer matches the request metadata.', 409);
    }
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Length', String(document.sizeBytes));
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    await pipeline(file.createReadStream(), res);
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
