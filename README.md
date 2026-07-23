# Your own memecoin launchpad

Your brand, your domain, your hosting account — running on the same shared contracts and coin feed as
everyone else. This is the code your launchpad runs on. Deploy it to your own Vercel and it is yours.

## Put it live

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/0xLecrim/prynt-launchpad-template&env=LAUNCHPAD_CONFIG,PINATA_JWT&envDescription=Paste%20the%20configuration%20from%20the%20designer%2C%20plus%20a%20free%20Pinata%20key%20for%20coin%20images.&envLink=https://github.com/0xLecrim/prynt-launchpad-template%23two-values-youll-be-asked-for&project-name=my-launchpad&repository-name=my-launchpad)

One click. Vercel copies this to your own account, asks for two values, and deploys. No coding, and
nobody else can touch it or take it down.

### Two values you'll be asked for

| Variable | What it is | Where to get it |
|---|---|---|
| `LAUNCHPAD_CONFIG` | Your whole design — brand, colours, type, wording. | The **Create your launchpad** designer generates it and copies it for you. Paste it in. |
| `PINATA_JWT` | Lets people upload images for their coins. | Free at [pinata.cloud](https://pinata.cloud) — create a key, copy the JWT. |

Everything else — the chain, the contracts, the shared coin feed — is already built in. You don't set it.

### After it's live

- Your launchpad is at `your-project.vercel.app` straight away.
- **Your own domain:** add it in your Vercel project (Settings → Domains), then set
  `NEXT_PUBLIC_SITE_URL` to it so your search links and share cards point at you.
- **Change the design later:** open the designer again, regenerate, and update `LAUNCHPAD_CONFIG`.

## What you get, and what you don't

You get the brand and the front door: your name, logo, colours, wording, SEO and share cards, on your
own hosting. **You do not get your own market** — every launchpad reads the same shared coin feed, so
your site shows the same coins as every other, and a coin launched anywhere shows up everywhere. What
is permanently yours is your **handle**, stamped into every coin launched from your site.

The 1% trading fee is enforced by the contracts, not by this code — editing the frontend can't change
where fees go.

---

## Running it locally (optional, for developers)

```bash
npm install
cp .env.example .env.local   # fill in LAUNCHPAD_CONFIG and PINATA_JWT
npm run dev
```

`npm run typecheck` for types. The network defaults live in `next.config.mjs`; a single
`LAUNCHPAD_CONFIG` env var (base64url of the config the designer produces) switches the app into
single-tenant mode and serves exactly that one launchpad on every hostname.
