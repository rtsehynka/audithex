import { RealAgentCallInCiError, TargetNetworkError } from './errors.js';

/**
 * Network description of the user's AI agent. Audithex sends attack
 * prompts to this endpoint and grades the response.
 *
 * `requestShape` selects how the prompt string is serialised into the
 * HTTP body — three common LLM-agent surface shapes are wired:
 *  - openai-chat        : { model?, messages: [{ role: 'user', content }] }
 *  - anthropic-messages : { model?, messages: [{ role: 'user', content }], max_tokens? }
 *  - custom-json        : { prompt: <string> } — for self-built agent gateways
 *
 * `authHeaderName` defaults to "Authorization"; `authToken` is sent
 * verbatim (callers prefix "Bearer " or similar themselves).
 */
export interface AgentTarget {
  endpoint: string;
  requestShape: 'openai-chat' | 'anthropic-messages' | 'custom-json';
  authHeaderName?: string;
  authToken?: string;
  /** Defaults to 30000 ms. */
  timeoutMs?: number;
  /** Optional model identifier forwarded to openai-chat / anthropic-messages. */
  model?: string;
  /** Max output tokens hint for anthropic-messages (defaults to 1024). */
  maxTokens?: number;
}

export interface TargetResponse {
  status: number;
  /** Raw text content extracted from the agent's response. */
  content: string;
  /** Token usage reported by the provider, when available. */
  tokensUsed?: { input: number; output: number };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Schemes we allow when dispatching attacks. Everything else
 * (file:, data:, gopher:, ftp:, etc.) is refused — the user's
 * configured agent should always be reachable over plain HTTP(S).
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Hostnames that resolve to private / reserved ranges. We reject these
 * by default to stop Audithex itself becoming an SSRF primitive
 * against the operator's internal network. The opt-in escape hatch is
 * `AUDITHEX_ALLOW_INTERNAL_TARGETS=1`, which is required for local-dev
 * scenarios where the agent runs on `localhost`.
 */
const PRIVATE_HOSTNAMES = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

/**
 * Calls the user's agent with `prompt` and returns the extracted text
 * + optional token usage. Performs **all** safety guards before
 * touching the network.
 *
 * - Scheme allowlist: http: / https: only.
 * - Private-IP rejection unless AUDITHEX_ALLOW_INTERNAL_TARGETS=1.
 * - CI guard: blocks real-agent calls in CI unless an explicit mock
 *   URL is set via AUDITHEX_TEST_AGENT_URL.
 * - 30s AbortController timeout (configurable per-target).
 * - max-0 redirects (manual redirect mode; any 3xx is rejected).
 */
export async function callTarget(
  target: AgentTarget,
  prompt: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<TargetResponse> {
  const url = parseEndpoint(target.endpoint);
  rejectDisallowedScheme(url);
  rejectInternalHostUnlessAllowed(url);
  rejectRealAgentCallInCi(target.endpoint);

  const body = buildRequestBody(target, prompt);
  const headers = buildHeaders(target);

  const timeout = target.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetchImpl(target.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new TargetNetworkError(
        'timeout',
        target.endpoint,
        `Agent did not respond within ${timeout}ms.`,
      );
    }
    throw new TargetNetworkError(
      'unreachable',
      target.endpoint,
      `Agent unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new TargetNetworkError(
      'redirect-disallowed',
      target.endpoint,
      `Agent returned HTTP ${response.status}; redirects are not followed during a dynamic scan.`,
    );
  }
  if (!response.ok) {
    throw new TargetNetworkError(
      'http-error',
      target.endpoint,
      `Agent returned HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json().catch(() => ({}))) as unknown;
  return extractResponse(target.requestShape, response.status, payload);
}

function parseEndpoint(raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new TargetNetworkError(
      'scheme-not-allowed',
      raw,
      `Agent endpoint "${raw}" is not a valid URL.`,
    );
  }
}

function rejectDisallowedScheme(url: URL): void {
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new TargetNetworkError(
      'scheme-not-allowed',
      url.href,
      `Agent endpoint scheme "${url.protocol}" is not allowed (http:/https: only).`,
    );
  }
}

function rejectInternalHostUnlessAllowed(url: URL): void {
  if (process.env.AUDITHEX_ALLOW_INTERNAL_TARGETS === '1') {
    return;
  }
  // url.hostname returns IPv6 hosts wrapped in brackets ("[::1]");
  // strip them so the literal-IP matcher works.
  const raw = url.hostname.toLowerCase();
  const host = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  if (PRIVATE_HOSTNAMES.has(host) || isPrivateIpLiteral(host)) {
    throw new TargetNetworkError(
      'internal-address-blocked',
      url.href,
      `Agent endpoint "${url.href}" resolves to a private / loopback address. Set AUDITHEX_ALLOW_INTERNAL_TARGETS=1 to opt in for local-dev scans.`,
    );
  }
}

/**
 * Returns true if `host` is a literal IP that falls inside one of the
 * reserved private / link-local / loopback ranges. We do not perform
 * DNS resolution here — a DNS-rebinding attack against a public
 * hostname is out of scope for the MVP; documenting this in
 * docs/scan-blocks.md once that ships.
 */
function isPrivateIpLiteral(host: string): boolean {
  // IPv6 loopback / link-local
  if (
    host === '::1' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc00:') ||
    host.startsWith('fd')
  ) {
    return true;
  }
  // IPv4 dotted-quad
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function rejectRealAgentCallInCi(endpoint: string): void {
  if (process.env.CI !== 'true') return;
  const testAgentUrl = process.env.AUDITHEX_TEST_AGENT_URL;
  if (testAgentUrl && testAgentUrl === endpoint) return;
  throw new RealAgentCallInCiError();
}

function buildHeaders(target: AgentTarget): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (target.authToken) {
    headers[(target.authHeaderName ?? 'Authorization').toLowerCase()] = target.authToken;
  }
  return headers;
}

function buildRequestBody(target: AgentTarget, prompt: string): Record<string, unknown> {
  switch (target.requestShape) {
    case 'openai-chat': {
      const body: Record<string, unknown> = {
        messages: [{ role: 'user', content: prompt }],
      };
      if (target.model) body.model = target.model;
      return body;
    }
    case 'anthropic-messages': {
      const body: Record<string, unknown> = {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: target.maxTokens ?? DEFAULT_MAX_TOKENS,
      };
      if (target.model) body.model = target.model;
      return body;
    }
    case 'custom-json':
      return { prompt };
  }
}

function extractResponse(
  shape: AgentTarget['requestShape'],
  status: number,
  payload: unknown,
): TargetResponse {
  if (typeof payload !== 'object' || payload === null) {
    return { status, content: '' };
  }
  const p = payload as Record<string, unknown>;
  switch (shape) {
    case 'openai-chat': {
      const choices = Array.isArray(p.choices) ? p.choices : [];
      const first = choices[0] as Record<string, unknown> | undefined;
      const message = first?.message as Record<string, unknown> | undefined;
      const content = typeof message?.content === 'string' ? message.content : '';
      const usage = p.usage as Record<string, unknown> | undefined;
      const input = numberOrUndefined(usage?.prompt_tokens);
      const output = numberOrUndefined(usage?.completion_tokens);
      const out: TargetResponse = { status, content };
      if (typeof input === 'number' && typeof output === 'number') {
        out.tokensUsed = { input, output };
      }
      return out;
    }
    case 'anthropic-messages': {
      const blocks = Array.isArray(p.content) ? p.content : [];
      const text = blocks
        .map((b) =>
          b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : '',
        )
        .join('');
      const usage = p.usage as Record<string, unknown> | undefined;
      const input = numberOrUndefined(usage?.input_tokens);
      const output = numberOrUndefined(usage?.output_tokens);
      const out: TargetResponse = { status, content: text };
      if (typeof input === 'number' && typeof output === 'number') {
        out.tokensUsed = { input, output };
      }
      return out;
    }
    case 'custom-json': {
      const content =
        typeof p.response === 'string'
          ? p.response
          : typeof p.content === 'string'
            ? p.content
            : typeof p.text === 'string'
              ? p.text
              : '';
      return { status, content };
    }
  }
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
