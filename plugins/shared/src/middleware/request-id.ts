import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface ResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

export function requestIdMiddleware(
  req: RequestWithId,
  res: ResponseWithHeaders,
  next: () => void,
): void {
  const existingId = req.headers[REQUEST_ID_HEADER];
  const requestId = typeof existingId === 'string' && existingId.length > 0
    ? existingId
    : randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function generateRequestId(): string {
  return randomUUID();
}
