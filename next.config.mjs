// Network defaults, baked so a fresh clone runs against Robinhood Chain with ZERO network config —
// the operator only ever supplies LAUNCHPAD_CONFIG (their design) and PINATA_JWT (image uploads).
//
// NONE of these are secret: they are public on-chain facts (contract addresses, a public RPC, the
// shared indexer everyone reads). They live here rather than in .env.local — which is gitignored and
// so never reaches a cloned template — and rather than as scattered `?? "0x…"` fallbacks in lib/,
// which would also change local-anvil dev. A real env var set in Vercel still wins: each entry is
// `process.env.X || <default>`, so overriding any one is just setting it in the dashboard.
const NETWORK_DEFAULTS = {
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "4663",
  NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME || "Robinhood Chain",
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://robinhoodchain.blockscout.com",
  NEXT_PUBLIC_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x5c0cdFA92C6645b6ee83e686598DbC29260F885d",
  NEXT_PUBLIC_FEE_MANAGER_ADDRESS: process.env.NEXT_PUBLIC_FEE_MANAGER_ADDRESS || "0x181e56B1d5BBf2A17089e4aAa576EAeCEeE1Ee40",
  NEXT_PUBLIC_VIRTUAL_ETH_WEI: process.env.NEXT_PUBLIC_VIRTUAL_ETH_WEI || "1500000000000000000",
  NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL || "https://api.prynt.fun",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: NETWORK_DEFAULTS,
  // Security headers. Anti-clickjacking (a wallet dApp must never be framed), MIME-sniffing off, tight referrer.
  // NOTE: deliberately NOT setting a restrictive script-src/default-src CSP here — WalletConnect/wagmi need wss +
  // multiple origins and a wrong CSP would silently break wallet connect; clickjacking is the material header risk.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
  // wagmi/viem pull in optional WalletConnect / MetaMask-SDK deps (incl. an optional React-Native storage
  // module) that aren't used in this app; mark them external/false to silence the resolution noise.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
