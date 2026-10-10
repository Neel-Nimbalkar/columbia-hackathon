/** Typed HTTP error carried through the backend and rendered as `{ error: { code, message, details? } }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function errorJson(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json(
    { error: details === undefined ? { code, message } : { code, message, details } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function toErrorResponse(error: unknown, route: string): Response {
  if (error instanceof HttpError) return errorJson(error.status, error.code, error.message, error.details);
  console.error(`[${route}] unexpected error`, error);
  return errorJson(500, 'INTERNAL_ERROR', 'Something went wrong while processing the request. Please retry.');
}
