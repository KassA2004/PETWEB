/**
 * Talking to our own backend.
 *
 * Better Auth owns `/api/auth/*` and has its own client (./auth-client); this
 * is everything else — `/api/v1/*`, the routes in /Docs/API-endpoints.
 *
 * Two things it exists to get right in one place. `credentials: 'include'`,
 * because the session is a cookie and every request without it is a silent
 * 401. And the error envelope from 00-conventions.md §8, unwrapped into a real
 * Error, so a caller can `catch (error) { toast(error.message) }` instead of
 * inspecting a JSON body at every call site.
 */

const BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** The documented error shape: `{ error: { code, message, details, requestId } }`. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { path: string; message: string }[];
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: { path: string; message: string }[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the caller simply is not signed in, which is not a failure. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function readError(response: Response): Promise<ApiError> {
  let body: { error?: ApiErrorBody } | null = null;

  try {
    body = (await response.json()) as { error?: ApiErrorBody };
  } catch {
    // A proxy error page, or an empty body. The status is all we have.
  }

  const error = body?.error;

  // Validation failures carry the useful part in `details`; the top-level
  // message is just "Validation failed", which helps nobody.
  const detail = error?.details?.[0];
  const message = detail
    ? `${detail.path}: ${detail.message}`
    : (error?.message ?? `Request failed (${response.status})`);

  return new ApiError(response.status, error?.code ?? 'UNKNOWN', message, error?.details);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  const response = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    // The session lives in a cookie on a different origin in development.
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw await readError(response);

  // 204, or a 200 with an empty body — `GET /pets/active` returns nothing at
  // all when the user has not chosen a pet yet.
  if (response.status === 204) return null as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
