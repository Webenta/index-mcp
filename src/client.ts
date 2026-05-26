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

export interface KeyInfo {
  scope: 'global' | 'project';
  projectId: string | null;
}

let _info: KeyInfo | null = null;
export async function keyInfo(): Promise<KeyInfo> {
  if (_info) return _info;
  _info = await api<KeyInfo>('GET', '/api/v1/whoami-key');
  return _info;
}

export async function resolveProjectId(argProjectId: string | undefined): Promise<string> {
  const info = await keyInfo();
  if (info.scope === 'project') {
    if (!info.projectId) throw new Error('api key has no project bound');
    return info.projectId;
  }
  if (!argProjectId) {
    const err = new Error(
      'projectId is required for global API keys — call list_projects to discover available project ids'
    );
    (err as any).status = 400;
    throw err;
  }
  return argProjectId;
}
