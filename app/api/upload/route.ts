import { NextRequest, NextResponse } from "next/server";
import { getServerConfig } from "@/lib/launchpad-server";

// Server-side only — PINATA_JWT never reaches the browser.
const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT = 4000;

// Best-effort per-process IP rate limit so an anonymous caller can't spam-pin and burn the Pinata quota (cost/DoS).
// A production deployment should add a shared limiter + a SIWE/captcha gate (see frontend security audit, HIGH).
const RL_WINDOW_MS = 60_000;
const RL_MAX = 12; // uploads per IP per minute
const rl = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rl.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  rl.set(ip, hits);
  if (rl.size > 5000) rl.clear(); // crude memory bound
  return hits.length > RL_MAX;
}
function clientIp(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Validate a REAL raster image by magic bytes (rejects SVG, HTML, and anything else from being pinned + later
// served as an image). Returns the canonical mime, or null to reject.
function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

// Pin a blob to IPFS via Pinata's v3 upload API (public network). Returns the CID.
async function pin(file: Blob, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append("network", "public");
  fd.append("name", filename);
  fd.append("file", file, filename);
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { data?: { cid?: string } };
  const cid = j.data?.cid;
  if (!cid) throw new Error("Pinata returned no CID");
  return cid;
}

export async function POST(req: NextRequest) {
  if (!PINATA_JWT) {
    return NextResponse.json({ error: "PINATA_JWT is not configured on the server" }, { status: 500 });
  }
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many uploads — slow down and retry shortly" }, { status: 429 });
  }
  try {
    const form = await req.formData();
    const get = (k: string) => String(form.get(k) ?? "").trim().slice(0, MAX_TEXT);
    const name = get("name");
    const symbol = get("symbol");
    const description = get("description");
    const website = get("website");
    const twitter = get("twitter");
    const telegram = get("telegram");
    const nsfw = get("nsfw") === "1"; // client-side NSFW pre-check flag (authoritative flag is computed indexer-side)
    const image = form.get("image");

    // 1) pin the image (if provided)
    let imageUri = "";
    let imageUrl = "";
    if (image instanceof Blob && image.size > 0) {
      if (image.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 413 });
      }
      const buf = new Uint8Array(await image.arrayBuffer());
      const sniffed = sniffImage(buf);
      if (!sniffed) {
        return NextResponse.json({ error: "Unsupported image type (PNG, JPEG, GIF or WebP only)" }, { status: 415 });
      }
      const filename = (image as File).name || "image";
      const cid = await pin(new Blob([buf], { type: sniffed }), filename); // pin the validated bytes + canonical mime
      imageUri = `ipfs://${cid}`;
      imageUrl = GATEWAY + cid;
    }

    // 2) pin the metadata JSON
    const metadata = {
      name,
      symbol,
      description,
      image: imageUri,
      website,
      twitter,
      telegram,
      nsfw,
      createdWith: (await getServerConfig()).slug,
    };
    const metaCid = await pin(
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      `${symbol || "token"}-metadata.json`,
    );

    return NextResponse.json({
      metadataURI: `ipfs://${metaCid}`,
      metadataUrl: GATEWAY + metaCid,
      image: imageUri,
      imageUrl,
      metadata,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "upload failed" }, { status: 500 });
  }
}
