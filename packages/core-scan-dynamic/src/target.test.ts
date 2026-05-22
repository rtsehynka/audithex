import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealAgentCallInCiError, TargetNetworkError } from './errors.js';
import { type AgentTarget, callTarget } from './target.js';

function resetEnv(): void {
  vi.unstubAllEnvs();
}

function mockFetchOk(body: object, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

describe('callTarget — guards (no network)', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  it('rejects unparseable URLs', async () => {
    await expect(
      callTarget({ endpoint: 'not a url', requestShape: 'custom-json' }, 'hi', mockFetchOk({})),
    ).rejects.toMatchObject({ reason: 'scheme-not-allowed' });
  });

  it('rejects file:// scheme', async () => {
    await expect(
      callTarget(
        { endpoint: 'file:///etc/passwd', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'scheme-not-allowed' });
  });

  it('rejects data:// scheme', async () => {
    await expect(
      callTarget(
        { endpoint: 'data:text/plain;base64,SGk=', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'scheme-not-allowed' });
  });

  it('rejects gopher:// scheme', async () => {
    await expect(
      callTarget(
        { endpoint: 'gopher://x.com/1', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'scheme-not-allowed' });
  });

  it('rejects localhost without the opt-in env var', async () => {
    await expect(
      callTarget(
        { endpoint: 'http://localhost:3000/agent', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'internal-address-blocked' });
  });

  it('rejects 127.0.0.1 without the opt-in env var', async () => {
    await expect(
      callTarget(
        { endpoint: 'http://127.0.0.1:3000/agent', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'internal-address-blocked' });
  });

  it('rejects AWS metadata endpoint (169.254.169.254)', async () => {
    await expect(
      callTarget(
        { endpoint: 'http://169.254.169.254/latest/meta-data/', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'internal-address-blocked' });
  });

  it('rejects RFC1918 ranges (10/8, 172.16/12, 192.168/16)', async () => {
    for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1']) {
      await expect(
        callTarget(
          { endpoint: `http://${host}/agent`, requestShape: 'custom-json' },
          'hi',
          mockFetchOk({}),
        ),
      ).rejects.toMatchObject({ reason: 'internal-address-blocked' });
    }
  });

  it('rejects IPv6 loopback ::1 without the opt-in env var', async () => {
    await expect(
      callTarget(
        { endpoint: 'http://[::1]:3000/agent', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toMatchObject({ reason: 'internal-address-blocked' });
  });

  it('allows internal addresses when AUDITHEX_ALLOW_INTERNAL_TARGETS=1', async () => {
    vi.stubEnv('AUDITHEX_ALLOW_INTERNAL_TARGETS', '1');
    const fetchImpl = mockFetchOk({ response: 'ok' });
    const result = await callTarget(
      { endpoint: 'http://localhost:3000/agent', requestShape: 'custom-json' },
      'hi',
      fetchImpl,
    );
    expect(result.content).toBe('ok');
  });

  it('refuses to call a real agent endpoint from CI', async () => {
    vi.stubEnv('CI', 'true');
    await expect(
      callTarget(
        { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json' },
        'hi',
        mockFetchOk({}),
      ),
    ).rejects.toBeInstanceOf(RealAgentCallInCiError);
  });

  it('allows the explicit mock URL through the CI guard', async () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('AUDITHEX_TEST_AGENT_URL', 'https://mock.test/agent');
    const fetchImpl = mockFetchOk({ response: 'mocked' });
    const result = await callTarget(
      { endpoint: 'https://mock.test/agent', requestShape: 'custom-json' },
      'hi',
      fetchImpl,
    );
    expect(result.content).toBe('mocked');
  });
});

describe('callTarget — request shaping (mocked fetch)', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  it('serialises an openai-chat body with role=user', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'sure' } }],
            usage: { prompt_tokens: 12, completion_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    const target: AgentTarget = {
      endpoint: 'https://api.example.com/v1/chat/completions',
      requestShape: 'openai-chat',
      model: 'gpt-test',
      authToken: 'Bearer test',
    };
    const result = await callTarget(target, 'hello', fetchImpl);
    expect(result.content).toBe('sure');
    expect(result.tokensUsed).toEqual({ input: 12, output: 5 });
    const callArgs = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const init = callArgs?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ role: 'user', content: 'hello' }],
      model: 'gpt-test',
    });
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer test');
  });

  it('serialises an anthropic-messages body with max_tokens default', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ text: 'declined' }],
            usage: { input_tokens: 8, output_tokens: 3 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as unknown as typeof fetch;
    const target: AgentTarget = {
      endpoint: 'https://api.example.com/v1/messages',
      requestShape: 'anthropic-messages',
      model: 'claude-test',
    };
    const result = await callTarget(target, 'hi', fetchImpl);
    expect(result.content).toBe('declined');
    expect(result.tokensUsed).toEqual({ input: 8, output: 3 });
    const callArgs = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((callArgs?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(1024);
    expect(body.model).toBe('claude-test');
  });

  it('serialises a custom-json body with the raw prompt', async () => {
    const fetchImpl = mockFetchOk({ response: 'ok' });
    await callTarget(
      { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json' },
      'attack me',
      fetchImpl,
    );
    const callArgs = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const body = JSON.parse((callArgs?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({ prompt: 'attack me' });
  });
});

describe('callTarget — failure modes (mocked fetch)', () => {
  beforeEach(resetEnv);
  afterEach(resetEnv);

  it('translates a 5xx into a TargetNetworkError(http-error)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('boom', { status: 502 }),
    ) as unknown as typeof fetch;
    await expect(
      callTarget(
        { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json' },
        'hi',
        fetchImpl,
      ),
    ).rejects.toMatchObject({ reason: 'http-error' });
  });

  it('rejects 3xx redirects', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'https://other/' } }),
    ) as unknown as typeof fetch;
    await expect(
      callTarget(
        { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json' },
        'hi',
        fetchImpl,
      ),
    ).rejects.toMatchObject({ reason: 'redirect-disallowed' });
  });

  it('translates a network throw into TargetNetworkError(unreachable)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const err = await callTarget(
      { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json' },
      'hi',
      fetchImpl,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(TargetNetworkError);
    expect(err.reason).toBe('unreachable');
  });

  it('translates an abort into TargetNetworkError(timeout)', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    const err = await callTarget(
      { endpoint: 'https://api.example.com/agent', requestShape: 'custom-json', timeoutMs: 1 },
      'hi',
      fetchImpl,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(TargetNetworkError);
    expect(err.reason).toBe('timeout');
  });
});
