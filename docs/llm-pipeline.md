# LLM pipeline

Two distinct LLM calls per round, both through OpenRouter, both server-side only.

## Provider

- **OpenRouter** via its OpenAI-compatible `/v1/chat/completions` endpoint.
- We use the official `openai` npm SDK with `baseURL` set to `https://openrouter.ai/api/v1` and `apiKey` from `OPENROUTER_API_KEY`.
- Model choice is configurable via `OPENROUTER_MODEL` env var. Default: a fast mid-tier model (e.g. `anthropic/claude-haiku-4.5` or `openai/gpt-4o-mini` — final pick benchmarked at implementation time).

## Call 1 — Theme generation

### Purpose

Produce a fresh, varied theme for one round.

### When

At the start of each round, *before* `round:start` is broadcast.

### Input

- The list of themes already used in this match (so we don't repeat).
- A temperature of ~0.9 to encourage variety.

### Output contract

JSON: `{ "theme": string }` where `theme` is 2–6 words, noun phrase, evocative but concrete enough that players can produce a word in 15 seconds.

### Prompt shape

```
System: You generate themes for a fast word game. A theme is a category
players will pick one word from in 15 seconds. It must be concrete enough
for a 12-year-old to answer but broad enough to invite variety. Return
JSON: {"theme": "..."}.

User: Already used this match: ["elements of nature", "kitchen items"].
Generate a new theme, different in flavor from those.
```

### Fallback

If the call fails or times out (2s budget, 1 retry): draw from a hardcoded pool of ~50 themes, filtered to exclude ones already used this match. The session's theme variety suffers slightly but the match keeps moving.

## Call 2 — Winner adjudication

### Purpose

Given N words on a theme, pick the one that "dominates" the others in a rock-paper-scissors sense, and explain why.

### When

At round close — either all players submitted, or the 15s deadline passed. Only words actually submitted are candidates.

### Input

- The theme.
- The submissions as `[{ playerId, word }]` (we pass `playerId`, not `displayName`, to reduce any name-based bias and keep the output machine-readable).

### Output contract

Strict JSON, validated against a schema:

```ts
{
  "winnerId": string,          // must match one of the submitted playerIds
  "reasoning": string          // 1–3 sentences, references the words by name
}
```

We use OpenRouter's JSON mode (`response_format: { type: "json_object" }`) and re-validate on the server. If the model returns a `winnerId` not in the candidate set, we treat it as a malformed response and retry once.

### Prompt shape

```
System: You are the adjudicator for a word game called Semantic Duel.
Given a theme and N words (one per player), pick the one that
"dominates" the others in a rock-paper-scissors sense: the word whose
meaning, within the theme, most clearly overcomes, contains, counters,
or supersedes the others. Ties are broken by whichever has the most
direct relationships to the others. Return JSON only.

User: Theme: "elements of nature"
Submissions:
- p_a: fire
- p_b: water
- p_c: earth

Respond with: {"winnerId": "...", "reasoning": "..."}
Reasoning should mention each word and the pairwise dominance, in
1–3 sentences.
```

### Why we pass `playerId` not `displayName`

- Prevents the model from being swayed by names.
- Lets us map the output straight back to the `Player` without a second lookup by string.
- Keeps player names out of the LLM logs.

### Fallback

If the LLM call fails after one retry, or returns invalid JSON twice:

1. Pick the winner deterministically: the submission with the earliest `submittedAt`, or alphabetical first on tie.
2. Set `reasoning` to a generic message ("Adjudicator unavailable — awarded to the first submission.").
3. Set `adjudicationSource: 'fallback'` on the round so the UI can render it differently (e.g. a small warning).

The match must never block on the LLM. 5s hard timeout per adjudication call.

## Budget and latency

| Call | Budget | Retry | Fallback |
|---|---|---|---|
| Theme | 2s | 1 | hardcoded theme pool |
| Adjudicate | 5s | 1 | deterministic pick |

Adjudication can take up to ~10s worst case (initial + retry). The reveal happens when adjudication returns, so we accept a short "judging…" phase in the UI between round close and reveal. That's honest: the game is waiting on a verdict.

## What we are NOT doing

- **No streaming**: the reveal is a single event. Streaming would leak the winner incrementally.
- **No few-shot examples in the prompt**: we want the model to reason from the theme each time, not pattern-match to our examples. Zero-shot with a clear rubric.
- **No agent loop / tool use**: these are one-shot calls with structured output. Adding a planner loop would add latency for no gain.
- **No caching of adjudications**: identical (theme, words) combos across matches are rare and caching would hide bugs.
