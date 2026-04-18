import { getLlmClient, getModel, withTimeout } from "./client.js";

const FALLBACK_THEMES = [
  "elements of nature",
  "kitchen items",
  "abstract emotions",
  "pokemon",
  "ancient mythology",
  "musical instruments",
  "tools in a garage",
  "things that fly",
  "board games",
  "weather phenomena",
  "ocean creatures",
  "words for light",
  "desserts",
  "street food",
  "things on a pirate ship",
  "fictional detectives",
  "small animals",
  "things you find in a forest",
  "types of dance",
  "celestial bodies",
  "historical empires",
  "words for sleep",
  "parts of a castle",
  "things that glow",
  "fabrics and textiles",
  "olympic sports",
  "spices",
  "words for journey",
  "types of knots",
  "currencies",
  "colors of red",
  "famous rivers",
  "things in a haunted house",
  "philosophical concepts",
  "science fiction tropes",
  "Japanese culture",
  "Norse gods",
  "types of storms",
  "words for courage",
  "dinosaurs",
  "chess pieces and moves",
  "gems and minerals",
  "kitchen verbs",
  "things in a bakery",
  "constellations",
  "medieval professions",
  "elements on the periodic table",
  "types of hats",
  "birds of prey",
  "broken things",
];

interface ThemeResult {
  theme: string;
  source: "llm" | "fallback";
}

export async function generateTheme(
  alreadyUsed: string[],
): Promise<ThemeResult> {
  try {
    return await withTimeout(
      callLlmForTheme(alreadyUsed),
      4_000,
      "theme generation",
    );
  } catch {
    try {
      return await withTimeout(
        callLlmForTheme(alreadyUsed),
        4_000,
        "theme generation retry",
      );
    } catch {
      return { theme: pickFallback(alreadyUsed), source: "fallback" };
    }
  }
}

async function callLlmForTheme(alreadyUsed: string[]): Promise<ThemeResult> {
  const client = getLlmClient();
  const response = await client.chat.completions.create({
    model: getModel(),
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You generate themes for a fast word game. A theme is a category players will pick one word from in 15 seconds. It must be concrete enough for a 6-year-old to answer but broad enough to invite variety. Return JSON: {"theme": "..."}. The theme should be 2-6 words, a noun phrase.',
      },
      {
        role: "user",
        content: `Already used this match: ${JSON.stringify(alreadyUsed)}. Generate a new theme, different in flavor from those.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty theme response");
  const parsed = JSON.parse(content) as { theme?: unknown };
  if (typeof parsed.theme !== "string" || parsed.theme.trim().length === 0) {
    throw new Error("Invalid theme payload");
  }
  const theme = parsed.theme.trim();
  if (alreadyUsed.some((t) => t.toLowerCase() === theme.toLowerCase())) {
    throw new Error("Duplicate theme");
  }
  return { theme, source: "llm" };
}

function pickFallback(alreadyUsed: string[]): string {
  const usedLower = new Set(alreadyUsed.map((t) => t.toLowerCase()));
  const candidates = FALLBACK_THEMES.filter(
    (t) => !usedLower.has(t.toLowerCase()),
  );
  const pool = candidates.length > 0 ? candidates : FALLBACK_THEMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
