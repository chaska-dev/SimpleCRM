/**
 * Ready-to-paste config blocks for each MCP client (Streamable HTTP).
 * Pure functions: they receive the server URL and the token (or `TOKEN`).
 */

export type ClientId = "claude_code" | "claude_desktop" | "cursor" | "vscode" | "other";

export const CLIENT_IDS: readonly ClientId[] = [
  "claude_code",
  "claude_desktop",
  "cursor",
  "vscode",
  "other",
];

export const TOKEN_PLACEHOLDER = "TOKEN";
export const SERVER_NAME = "simple-crm";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** localhost, 127.0.0.1, ::1 or *.localhost: the URL only works on this machine. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith(".localhost");
}

export function isLocalUrl(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed ? isLocalHostname(parsed.hostname) : false;
}

/** mcp-remote requires --allow-http when the URL is http:// and the host is not local. */
export function needsAllowHttp(url: string): boolean {
  const parsed = parseUrl(url);
  return parsed !== null && parsed.protocol === "http:" && !isLocalHostname(parsed.hostname);
}

export function buildClientConfig(client: ClientId, url: string, token: string): string {
  switch (client) {
    case "claude_code":
      return `claude mcp add --transport http ${SERVER_NAME} ${url} --header "Authorization: Bearer ${token}"`;
    case "claude_desktop": {
      const args = ["-y", "mcp-remote", url, "--header", `Authorization:Bearer ${token}`];
      if (needsAllowHttp(url)) args.push("--allow-http");
      return JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: "npx", args } } }, null, 2);
    }
    case "cursor":
      return JSON.stringify(
        { mcpServers: { [SERVER_NAME]: { url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      );
    case "vscode":
      return JSON.stringify(
        {
          servers: {
            [SERVER_NAME]: {
              type: "http",
              url,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      );
    case "other":
      return `URL: ${url}\nAuthorization: Bearer ${token}`;
  }
}

export function buildStdioConfig(
  stdio: { python: string; manage_py: string },
  token: string,
): string {
  return JSON.stringify(
    {
      mcpServers: {
        [SERVER_NAME]: {
          command: stdio.python,
          args: [stdio.manage_py, "mcp_serve"],
          env: { CRM_MCP_TOKEN: token },
        },
      },
    },
    null,
    2,
  );
}

/* ------------------------------------------------------------------ */
/* Test connection: initialize JSON-RPC over Streamable HTTP            */
/* ------------------------------------------------------------------ */

export type TestResult =
  | { ok: true; name: string; version: string }
  | { ok: false; key: string; vars?: Record<string, string | number> };

const INITIALIZE_BODY = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "simple-crm-ui", version: "1.0.0" },
  },
};

/** Extracts the JSON-RPC object from a JSON response or an SSE stream (`data: {...}`). */
function parseRpc(text: string): { result?: { serverInfo?: { name?: string; version?: string } } } | null {
  const trimmed = text.trim();
  const candidates = [trimmed];
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) candidates.push(line.slice(5).trim());
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* next candidate */
    }
  }
  return null;
}

export async function testMcpConnection(url: string, token: string): Promise<TestResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(INITIALIZE_BODY),
      signal: ctrl.signal,
    });
  } catch {
    return { ok: false, key: "test_network", vars: { url } };
  } finally {
    window.clearTimeout(timer);
  }
  const text = await res.text().catch(() => "");
  if (res.status === 401) return { ok: false, key: "test_401" };
  if (res.status === 403) {
    return { ok: false, key: /origin/i.test(text) ? "test_403_origin" : "test_403" };
  }
  if (res.status === 421) return { ok: false, key: "test_421" };
  if (res.status === 501) return { ok: false, key: "test_501" };
  if (!res.ok) return { ok: false, key: "test_http", vars: { status: res.status } };
  const info = parseRpc(text)?.result?.serverInfo;
  if (!info?.name) return { ok: false, key: "test_not_mcp" };
  return { ok: true, name: info.name, version: info.version ?? "" };
}
