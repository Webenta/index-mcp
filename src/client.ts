// Thin REST client used by every MCP tool.
const API_URL = process.env.WEBENTA_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.WEBENTA_API_KEY ?? '';

if (!API_KEY) {
  console.error('WEBENTA_API_KEY is not set — every call will fail with 401.');
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const msg = parsed?.message ?? parsed?.error ?? `HTTP ${res.status}`;
    const err = new Error(msg);
    (err as any).status = res.status;
    (err as any).body = parsed;
    throw err;
  }
  return parsed as T;
}

let _projectId: string | null = null;
export async function currentProjectId(): Promise<string> {
  if (_projectId) return _projectId;
  const r = await api<{ projectId: string }>('GET', '/api/v1/whoami-key');
  _projectId = r.projectId;
  return _projectId;
}
