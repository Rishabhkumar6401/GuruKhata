// Small HTTP helpers shared by the routers.

/** Throwable error that the central error handler turns into { error } + status. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/**
 * Parse a numeric route id. Anything that isn't a positive integer is treated
 * as "not found" (never a 500 from a failed BIGINT cast).
 */
export function parseId(raw, what = 'not found') {
  const s = String(raw ?? '');
  if (!/^[1-9]\d{0,17}$/.test(s)) throw notFound(what);
  return s; // passed as a query param; Postgres casts it to BIGINT
}
