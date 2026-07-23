const GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "https://gateway.pinata.cloud/ipfs/";

export function ipfsToHttp(uri?: string | null): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return GATEWAY + uri.slice("ipfs://".length);
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

/// Only return a URL safe to render as a clickable link: must parse and be http(s). Blocks javascript:/data: etc.
/// Creator-supplied socials are untrusted — never render them as a raw href without passing through this.
export function safeUrl(u?: string | null): string | null {
  if (!u || typeof u !== "string") return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export type TokenMeta = {
  description?: string;
  imageUrl?: string | null;
  website?: string;
  twitter?: string;
  telegram?: string;
};

/// Fetch + parse a token's metadata JSON from an ipfs:// (or http) URI. Returns null on any failure.
export async function fetchMetadata(metadataURI?: string | null): Promise<TokenMeta | null> {
  const url = ipfsToHttp(metadataURI);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return {
      description: typeof j.description === "string" ? j.description : undefined,
      imageUrl: ipfsToHttp(typeof j.image === "string" ? j.image : null),
      website: typeof j.website === "string" ? j.website : undefined,
      twitter: typeof j.twitter === "string" ? j.twitter : undefined,
      telegram: typeof j.telegram === "string" ? j.telegram : undefined,
    };
  } catch {
    return null;
  }
}
