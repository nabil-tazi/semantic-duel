import type { AdjudicationSource, Submission } from '@semantic-duel/shared';
import { getLlmClient, getModel, withTimeout } from './client.js';

export interface AdjudicationResult {
  winnerId: string | null;
  reasoning: string;
  source: AdjudicationSource;
}

export async function adjudicate(
  theme: string,
  submissions: Submission[],
): Promise<AdjudicationResult> {
  if (submissions.length === 0) {
    return {
      winnerId: null,
      reasoning: 'No player submitted a word in time.',
      source: 'fallback',
    };
  }

  if (submissions.length === 1) {
    const only = submissions[0];
    return {
      winnerId: only.playerId,
      reasoning: `Only "${only.word}" was submitted in time, so it wins by default.`,
      source: 'fallback',
    };
  }

  try {
    return await withTimeout(callLlm(theme, submissions), 15_000, 'adjudication');
  } catch {
    return deterministicFallback(submissions);
  }
}

async function callLlm(theme: string, submissions: Submission[]): Promise<AdjudicationResult> {
  const client = getLlmClient();
  const candidateIds = new Set(submissions.map((s) => s.playerId));

  const submissionLines = submissions
    .map((s) => `- ${s.playerId}: ${s.word}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are the adjudicator for a word game called Semantic Duel. Given a theme and N words (one per player), pick the one that "dominates" the others in a rock-paper-scissors sense: the word whose meaning, within the theme, most clearly overcomes, contains, counters, or supersedes the others. Ties are broken by whichever word has the most direct dominance relationships to the others. Return JSON only: {"winnerId": "...", "reasoning": "..."}. Reasoning must mention each word and the pairwise dominance, in 1-3 sentences.',
      },
      {
        role: 'user',
        content: `Theme: "${theme}"\nSubmissions:\n${submissionLines}\n\nRespond with {"winnerId": "...", "reasoning": "..."}.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty adjudication response');
  const parsed = JSON.parse(content) as { winnerId?: unknown; reasoning?: unknown };
  if (typeof parsed.winnerId !== 'string' || !candidateIds.has(parsed.winnerId)) {
    throw new Error('Winner not in candidate set');
  }
  if (typeof parsed.reasoning !== 'string' || parsed.reasoning.trim().length === 0) {
    throw new Error('Missing reasoning');
  }
  return {
    winnerId: parsed.winnerId,
    reasoning: parsed.reasoning.trim(),
    source: 'llm',
  };
}

function deterministicFallback(submissions: Submission[]): AdjudicationResult {
  const sorted = [...submissions].sort((a, b) => {
    const t = Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
    if (t !== 0) return t;
    return a.word.localeCompare(b.word);
  });
  const winner = sorted[0];
  return {
    winnerId: winner.playerId,
    reasoning: 'Adjudicator unavailable — awarded to the earliest submission.',
    source: 'fallback',
  };
}
