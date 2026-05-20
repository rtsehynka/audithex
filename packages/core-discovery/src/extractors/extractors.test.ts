import { getLanguageForFile } from '@audithex/core-languages';
import { describe, expect, it } from 'vitest';
import { modelStringsExtractor } from './model-strings.js';
import { ragConfigExtractor } from './rag-config.js';
import { sdkImportsExtractor } from './sdk-imports.js';
import { secretCandidatesExtractor } from './secret-candidates.js';
import { systemPromptsExtractor } from './system-prompts.js';
import { toolDefinitionsExtractor } from './tool-definitions.js';
import type { ExtractorInput } from './types.js';

function inputFor(relPath: string, content: string): ExtractorInput {
  const language = getLanguageForFile(relPath);
  if (!language) throw new Error(`No language registered for ${relPath}`);
  const dot = relPath.lastIndexOf('.');
  return {
    rootPath: '/tmp/fixture',
    relPath,
    extension: dot >= 0 ? relPath.slice(dot).toLowerCase() : '',
    content,
    language,
  };
}

describe('sdk-imports extractor', () => {
  it('finds Anthropic in TypeScript imports via AST', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('src/agent.ts', "import Anthropic from '@anthropic-ai/sdk';\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBe('ast');
    expect(out[0]?.detail).toMatchObject({
      provider: 'anthropic',
      language: 'typescript',
      syntax: 'import',
    });
  });

  it('finds OpenAI via require() in JavaScript via AST', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('agent.js', "const OpenAI = require('openai');\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBe('ast');
    expect(out[0]?.detail).toMatchObject({
      provider: 'openai',
      language: 'javascript',
      syntax: 'require',
    });
  });

  it('finds OpenAI in Python imports via regex', () => {
    const out = sdkImportsExtractor.extract(inputFor('agent.py', 'from openai import OpenAI\n'));
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBe('regex');
    expect(out[0]?.detail).toMatchObject({ provider: 'openai', language: 'python' });
  });

  it('finds Anthropic in PHP imports via regex', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('Client.php', '<?php\nuse Anthropic\\Client;\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBe('regex');
    expect(out[0]?.detail).toMatchObject({ provider: 'anthropic', language: 'php' });
  });

  it('returns no artifacts when no SDK imports present', () => {
    const out = sdkImportsExtractor.extract(inputFor('src/util.ts', 'export const x = 1;\n'));
    expect(out).toHaveLength(0);
  });

  it('ignores SDK names that only appear in a string literal (AST is structural)', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('src/agent.ts', 'const note = "we use @anthropic-ai/sdk for chat";\n'),
    );
    expect(out).toHaveLength(0);
  });
});

describe('model-strings extractor', () => {
  it('flags claude-opus-4-7 across languages', () => {
    expect(
      modelStringsExtractor.extract(inputFor('a.ts', 'const m = "claude-opus-4-7";\n')),
    ).toHaveLength(1);
    expect(
      modelStringsExtractor.extract(inputFor('a.py', 'model = "claude-opus-4-7"\n')),
    ).toHaveLength(1);
  });

  it('flags gpt-4o', () => {
    expect(modelStringsExtractor.extract(inputFor('a.ts', 'const m = "gpt-4o";\n'))).toHaveLength(
      1,
    );
  });

  it('skips model strings inside line comments in code files', () => {
    expect(
      modelStringsExtractor.extract(inputFor('a.ts', '// pinning claude-opus-4-7\n')),
    ).toHaveLength(0);
    expect(modelStringsExtractor.extract(inputFor('a.py', '# pinning gpt-4o\n'))).toHaveLength(0);
  });
});

describe('secret-candidates extractor', () => {
  it('flags an OpenAI key shape in code', () => {
    const out = secretCandidatesExtractor.extract(
      inputFor('a.ts', 'const k = "sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH";\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ provider: 'openai' });
    expect(String(out[0]?.detail?.redactedPreview)).toContain('***');
  });

  it('flags a key in a .env file (plain text)', () => {
    const out = secretCandidatesExtractor.extract(
      inputFor('.env', 'OPENAI_API_KEY=sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH\n'),
    );
    expect(out).toHaveLength(1);
  });

  it('skips secrets inside a line comment in code', () => {
    const out = secretCandidatesExtractor.extract(
      inputFor('a.ts', '// sk-AbcdefghijklmnopqrstuvwxyzABCDEFGH (rotated)\n'),
    );
    expect(out).toHaveLength(0);
  });
});

describe('system-prompts extractor', () => {
  it('flags a standalone markdown prompt with a role phrase', () => {
    const body = `You are a strict banking assistant. ${'You only respond in formal English. '.repeat(20)}`;
    const out = systemPromptsExtractor.extract(inputFor('prompts/system.md', body));
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ origin: 'standalone-file', language: 'plain-text' });
  });

  it('ignores short files', () => {
    const out = systemPromptsExtractor.extract(inputFor('prompts/short.md', 'You are a helper.'));
    expect(out).toHaveLength(0);
  });

  it('finds an Anthropic-style system kwarg in TypeScript via AST', () => {
    const code = `
      import Anthropic from '@anthropic-ai/sdk';
      const client = new Anthropic();
      await client.messages.create({
        model: 'claude-opus-4-7',
        system: "You are a strict banking compliance assistant who only answers in formal English.",
        messages: [],
      });
    `;
    const out = systemPromptsExtractor.extract(inputFor('src/agent.ts', code));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      confidence: 'ast',
      detail: { origin: 'code-embedded', language: 'typescript' },
    });
  });

  it('finds an OpenAI role/content pair in JavaScript via AST', () => {
    const code = `
      const messages = [
        { role: 'system', content: 'You are a strict banking compliance assistant who answers tersely.' },
        { role: 'user', content: 'hi' },
      ];
    `;
    const out = systemPromptsExtractor.extract(inputFor('src/agent.js', code));
    expect(out).toHaveLength(1);
    expect(out[0]?.confidence).toBe('ast');
    expect(out[0]?.detail).toMatchObject({ origin: 'code-embedded', language: 'javascript' });
  });

  it('ignores TS files where system kwarg holds a variable reference', () => {
    const code = `
      import Anthropic from '@anthropic-ai/sdk';
      const SYSTEM = "irrelevant";
      const client = new Anthropic();
      await client.messages.create({ system: SYSTEM, messages: [] });
    `;
    const out = systemPromptsExtractor.extract(inputFor('src/agent.ts', code));
    expect(out).toHaveLength(0);
  });

  it('finds a system= kwarg in Python via registry regex', () => {
    const code =
      'import anthropic\nclient = anthropic.Anthropic()\n' +
      'resp = client.messages.create(\n' +
      '  model="claude-opus-4-7",\n' +
      '  system="You are a strict banking compliance assistant who answers tersely.",\n' +
      '  messages=[],\n' +
      ')\n';
    const out = systemPromptsExtractor.extract(inputFor('agent.py', code));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      confidence: 'regex',
      detail: { origin: 'code-embedded', language: 'python' },
    });
  });

  it('finds a PHP-array system entry via registry regex', () => {
    const code =
      "<?php\n$resp = $client->messages()->create([\n  'model' => 'claude-opus-4-7',\n" +
      "  'system' => 'You are a strict banking compliance assistant who answers tersely.',\n" +
      "  'messages' => [],\n]);\n";
    const out = systemPromptsExtractor.extract(inputFor('agent.php', code));
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ origin: 'code-embedded', language: 'php' });
  });

  it('finds a Go System: field via registry regex', () => {
    const code =
      'package main\n\nimport "context"\n\n' +
      'func main() {\n' +
      '  params := MessageNewParams{\n' +
      '    Model: "claude-opus-4-7",\n' +
      '    System: "You are a strict banking compliance assistant who answers tersely.",\n' +
      '  }\n' +
      '  _ = params\n' +
      '}\n';
    const out = systemPromptsExtractor.extract(inputFor('agent.go', code));
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ origin: 'code-embedded', language: 'go' });
  });
});

describe('tool-definitions extractor', () => {
  it('finds an OpenAI-shaped tool literal in TypeScript via AST', () => {
    const code = `
      const tools = [
        {
          type: 'function',
          function: {
            name: 'lookup_account',
            description: 'Fetch a customer account by id',
          },
        },
      ];
    `;
    const out = toolDefinitionsExtractor.extract(inputFor('src/agent.ts', code));
    const openai = out.find((a) => a.detail.framework === 'openai');
    expect(openai).toBeDefined();
    expect(openai?.confidence).toBe('ast');
    expect(openai?.detail).toMatchObject({
      toolName: 'lookup_account',
      hasDescription: true,
      hasSchema: false,
      language: 'typescript',
    });
  });

  it('finds an Anthropic-shaped tool literal in TypeScript via AST', () => {
    const code = `
      const tools = [
        {
          name: 'transfer_funds',
          input_schema: {
            type: 'object',
            properties: { from: { type: 'string' } },
          },
        },
      ];
    `;
    const out = toolDefinitionsExtractor.extract(inputFor('src/agent.ts', code));
    const anthropic = out.find((a) => a.detail.framework === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.confidence).toBe('ast');
    expect(anthropic?.detail).toMatchObject({
      toolName: 'transfer_funds',
      hasDescription: false,
      hasSchema: true,
      language: 'typescript',
    });
  });

  it('finds an OpenAI-shaped tool definition in JSON via regex', () => {
    const content = JSON.stringify(
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookup_account',
              description: 'Fetch a customer account by id',
              parameters: { type: 'object', properties: { id: { type: 'string' } } },
            },
          },
        ],
      },
      null,
      2,
    );
    const out = toolDefinitionsExtractor.extract(inputFor('tools.json', content));
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]?.confidence).toBe('regex');
    expect(out[0]?.detail).toMatchObject({
      framework: 'openai',
      toolName: 'lookup_account',
      hasDescription: true,
      hasSchema: true,
    });
  });

  it('finds an Anthropic-shaped tool in JSON via regex', () => {
    const content = JSON.stringify(
      [
        {
          name: 'transfer_funds',
          description: 'Move money between accounts',
          input_schema: { type: 'object', properties: { from: { type: 'string' } } },
        },
      ],
      null,
      2,
    );
    const out = toolDefinitionsExtractor.extract(inputFor('tools.json', content));
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]?.detail?.framework).toBe('anthropic');
  });
});

describe('rag-config extractor', () => {
  it('detects a vector store import in TypeScript', () => {
    const out = ragConfigExtractor.extract(
      inputFor('src/index.ts', "import { Pinecone } from 'pinecone';\n"),
    );
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]?.detail?.system).toBe('pinecone');
  });

  it('detects an embedding model literal', () => {
    const out = ragConfigExtractor.extract(
      inputFor('src/index.ts', 'const model = "text-embedding-3-small";\n'),
    );
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(String(out[0]?.detail?.embeddingModel)).toContain('text-embedding-');
  });

  it('skips vector stores mentioned only in code comments', () => {
    const out = ragConfigExtractor.extract(
      inputFor('src/index.ts', '// migrated off pinecone last quarter\n'),
    );
    expect(out).toHaveLength(0);
  });
});
