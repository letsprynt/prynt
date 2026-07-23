import { NextResponse, type NextRequest } from "next/server";

// Tenant preview switch. In production a tenant is chosen by hostname, but ?tenant=<slug> lets us
// preview any tenant on any host (including localhost and Vercel preview URLs) without DNS.
const TENANT_HEADER = "x-tenant";
const TENANT_COOKIE = "tenant";

// The slug is echoed into a header and a cookie, so keep it to the shape a slug can actually have —
// this is the boundary where an attacker-controlled query string stops being free-form text.
const SLUG = /^[a-z0-9-]{1,64}$/;

export function middleware(req: NextRequest) {
  // SINGLE-TENANT DEPLOYMENTS SKIP ALL OF THIS. There is one launchpad on every hostname, and
  // lib/launchpad-server.ts returns it before it ever reads this header or the cookie — so the only
  // thing the code below could still do on an operator's site is let a crafted `?tenant=` link plant
  // a stray cookie on their origin, and run on their hot path for nothing. Read as a bare env var
  // rather than through lib/launchpad-single: this is the edge runtime and that module throws.
  if (process.env.LAUNCHPAD_CONFIG || process.env.NEXT_PUBLIC_LAUNCHPAD_CONFIG) return NextResponse.next();

  const raw = req.nextUrl.searchParams.get("tenant");
  const tenant = raw?.trim().toLowerCase();
  const valid = tenant && SLUG.test(tenant) ? tenant : null;

  // `x-tenant` is an INTERNAL channel: getServerConfig() trusts it above the hostname, so a value
  // that arrived from the network would let anyone repaint a canonical domain in another tenant's
  // brand (`curl -H 'x-tenant: demo-a' https://prynt.fun/` served the dark demo theme and its SEO).
  // Strip whatever the client sent before deciding, so the only writer of this header is the line
  // below. Requests that neither carry the header nor ask for a tenant skip the copy entirely.
  const spoofed = req.headers.has(TENANT_HEADER);
  if (!valid && !spoofed) return NextResponse.next();

  // Rewriting the *request* headers is what makes the value visible to server components via
  // headers(); a response header would never reach them.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(TENANT_HEADER);
  if (valid) requestHeaders.set(TENANT_HEADER, valid);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (!valid) return res;
  // Client-side navigations drop the query string, so persist the choice for the rest of the session.
  res.cookies.set(TENANT_COOKIE, valid, { path: "/", sameSite: "lax", httpOnly: false });
  return res;
}

export const config = {
  // Skip static assets and API routes: they never render branded HTML, and matching them would put
  // the middleware on the hot path of every image request.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.).*)"],
};
