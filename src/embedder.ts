import type { EmbedFn } from "./types.js";

let cachedEmbedder: EmbedFn | null = null;

export async function createEmbedder(opts?: {
  model?: string;
  quantized?: boolean;
}): Promise<EmbedFn> {
  if (cachedEmbedder) return cachedEmbedder;

  const { pipeline } = await import("@huggingface/transformers");

  const model = opts?.model ?? process.env.SUGGESTION_BOX_MODEL ?? "Xenova/all-MiniLM-L6-v2";
  const quantized = opts?.quantized ?? true;

  const extractor = await pipeline("feature-extraction", model, { quantized } as any);

  cachedEmbedder = async (text: string): Promise<Float32Array> => {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return new Float32Array(output.data as Float64Array);
  };

  return cachedEmbedder;
}
