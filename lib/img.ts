// Rewrite any IPFS image URL (ipfs://CID, https://<gateway>/ipfs/CID, or a bare CID) to our own caching proxy
// (/api/img/CID), so the bytes are served from OUR domain — fast, cached for ALL users — instead of each browser
// hitting a slow public gateway like ipfs.io. Non-IPFS URLs pass through unchanged.

export function extractCid(u?: string | null): string | null {
  if (!u) return null;
  if (u.startsWith("ipfs://")) return u.slice("ipfs://".length).replace(/^ipfs\//, "") || null;
  const m = u.match(/\/ipfs\/(.+)$/);
  if (m) return m[1] || null;
  if (/^(baf[a-z0-9]+|Qm[1-9A-HJ-NP-Za-km-z]+)(\/.*)?$/.test(u)) return u; // already a bare CID(/path)
  return null;
}

export function imgSrc(u?: string | null): string | null {
  if (!u) return null;
  const cid = extractCid(u);
  return cid ? `/api/img/${cid}` : u;
}
