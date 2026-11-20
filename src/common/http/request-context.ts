import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithContext = {
  readonly method: string;
  readonly originalUrl: string;
  header(name: string): string | undefined;
  requestId?: string;
};

type ResponseWithHeaders = {
  setHeader(name: string, value: string): void;
};

type NextFunction = () => void;

export function requestContextMiddleware(
  request: RequestWithContext,
  response: ResponseWithHeaders,
  next: NextFunction,
): void {
  const requestIdHeader = request.header(REQUEST_ID_HEADER);
  const requestId = requestIdHeader?.trim() || randomUUID();

  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
