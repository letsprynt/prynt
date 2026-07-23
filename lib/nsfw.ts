// Client-side NSFW pre-check at upload. tfjs + nsfwjs are loaded from a CDN at RUNTIME (injected <script>), never
// bundled — so they add NOTHING to the app bundle and never touch the webpack build; they download on demand only
// when someone actually picks an image while creating a coin.
//
// Best-effort, bypassable client check that blocks explicit images + flags borderline ones for the blur gate.
// It is NOT a CSAM detector (use Cloudflare's CSAM Scanning Tool for that). The indexer-side flag is authoritative.

export type NsfwVerdict = { explicit: boolean; nsfw: boolean; scores: Record<string, number> };

const TFJS_CDN = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4";
const NSFW_CDN = "https://cdn.jsdelivr.net/npm/nsfwjs@4";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-nsfw="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.nsfw = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

type NsfwModel = { classify: (img: HTMLImageElement, n?: number) => Promise<Array<{ className: string; probability: number }>> };

let modelPromise: Promise<NsfwModel> | null = null;
async function getModel(): Promise<NsfwModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await loadScript(TFJS_CDN); // exposes window.tf
      await loadScript(NSFW_CDN); // exposes window.nsfwjs (depends on tf)
      const nsfw = (window as unknown as { nsfwjs?: { load: () => Promise<NsfwModel> } }).nsfwjs;
      if (!nsfw) throw new Error("nsfwjs unavailable");
      return nsfw.load();
    })();
  }
  return modelPromise;
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

/// Classify a picked image. `explicit` → block the launch; `nsfw` → allow but flag for the blur gate.
export async function classifyFile(file: File): Promise<NsfwVerdict> {
  const model = await getModel();
  const img = await fileToImage(file);
  try {
    const preds = await model.classify(img);
    const s: Record<string, number> = {};
    for (const p of preds) s[p.className] = p.probability;
    const explicit = (s.Porn ?? 0) + (s.Hentai ?? 0);
    const sexy = s.Sexy ?? 0;
    return { explicit: explicit > 0.85, nsfw: explicit > 0.5 || sexy > 0.7, scores: s };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
