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
  it('finds Anthropic in TypeScript imports', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('src/agent.ts', "import Anthropic from '@anthropic-ai/sdk';\n"),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ provider: 'anthropic', language: 'typescript' });
  });

  it('finds OpenAI in Python imports', () => {
    const out = sdkImportsExtractor.extract(inputFor('agent.py', 'from openai import OpenAI\n'));
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ provider: 'openai', language: 'python' });
  });

  it('finds Anthropic in PHP imports', () => {
    const out = sdkImportsExtractor.extract(
      inputFor('Client.php', '<?php\nuse Anthropic\\Client;\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toMatchObject({ provider: 'anthropic', language: 'php' });
  });

  it('returns no artifacts when no SDK imports present', () => {
    const out = sdkImportsExtractor.extract(inputFor('src/util.ts', 'export const x = 1;\n'));
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

  it('ignores code files (code-embedded prompts come later)', () => {
    const body = `You are a helper. ${'Reply in JSON. '.repeat(30)}`;
    const out = systemPromptsExtractor.extract(inputFor('a.ts', `// ${body}`));
    expect(out).toHaveLength(0);
  });
});

describe('tool-definitions extractor', () => {
  it('finds an OpenAI-shaped tool definition in JSON', () => {
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
    expect(out[0]?.detail).toMatchObject({
      framework: 'openai',
      toolName: 'lookup_account',
      hasDescription: true,
      hasSchema: true,
    });
  });

  it('finds an Anthropic-shaped tool', () => {
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
