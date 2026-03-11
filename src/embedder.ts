import type { EmbedFn } from "./types.js";

let cachedEmbedder: EmbedFn | null = null;

/**
 * Symbol used to tag an EmbedFn that operates in trigram-fallback mode.
 * When present, the store should use trigram Jaccard similarity instead of
 * vector cosine distance for dedup.
 */
export const TRIGRAM_MODE = Symbol.for("suggestion-box:trigram-mode");

/** Compute the set of character trigrams for a given string. */
export function trigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    result.add(normalized.slice(i, i + 3));
  }
  return result;
}

/** Jaccard similarity between two trigram sets: |intersection| / |union|. */
export function trigramSimilarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Default trigram Jaccard threshold for dedup (empirically ~0.35 is a good match). */
export const DEFAULT_TRIGRAM_THRESHOLD = 0.35;

/** Check whether an embed function is in trigram-fallback mode. */
export function isTrigramMode(embed: EmbedFn): boolean {
  return (embed as any)[TRIGRAM_MODE] === true;
}

export async function createEmbedder(opts?: {
  model?: string;
  quantized?: boolean;
}): Promise<EmbedFn> {
  if (cachedEmbedder) return cachedEmbedder;

  // Allow users to explicitly disable HuggingFace embeddings
  const envFlag = process.env.SUGGESTION_BOX_EMBEDDINGS;
  const embeddingsDisabled = envFlag !== undefined && envFlag.toLowerCase() === "false";

  if (!embeddingsDisabled) {
    try {
      const { pipeline } = await import("@huggingface/transformers");

      const model = opts?.model ?? process.env.SUGGESTION_BOX_MODEL ?? "Xenova/all-MiniLM-L6-v2";
      const quantized = opts?.quantized ?? true;

      const extractor = await pipeline("feature-extraction", model, { quantized } as any);

      cachedEmbedder = async (text: string): Promise<Float32Array> => {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        return new Float32Array(output.data as Float64Array);
      };

      return cachedEmbedder;
    } catch {
      // HuggingFace model failed to load — fall back to trigram mode
    }
  }

  // Trigram fallback: return a tagged no-op embed function.
  // The store detects this tag and uses trigram similarity instead of vector distance.
  const trigramEmbed: EmbedFn = async (_text: string): Promise<Float32Array> => {
    return new Float32Array(0);
  };
  (trigramEmbed as any)[TRIGRAM_MODE] = true;

  cachedEmbedder = trigramEmbed;
  return cachedEmbedder;
}
