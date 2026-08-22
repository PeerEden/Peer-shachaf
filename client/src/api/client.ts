export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    method: opts.method ?? 'GET',
    headers: isForm || opts.body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let data: { error?: string; message?: string } | null = null;
    try {
      data = (await res.json()) as { error?: string; message?: string };
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, data?.error ?? 'ERROR', data?.message ?? 'משהו השתבש, נסו שוב');
  }
  return res.json() as Promise<T>;
}
