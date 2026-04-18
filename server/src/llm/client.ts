import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getLlmClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost',
      'X-Title': 'Semantic Duel',
    },
  });
  return client;
}

export function getModel(): string {
  return process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
}

export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
