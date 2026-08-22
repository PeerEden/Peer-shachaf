/** Thrown by services; converted to a JSON response by the app error handler. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = (message = 'נדרשת התחברות') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const notFound = (message = 'לא נמצא') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
