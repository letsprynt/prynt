import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BoardHome } from "@/components/board/BoardHome";
import { getServerContext } from "@/lib/launchpad-server";

// The coin board on the PLATFORM host. The apex's "/" becomes a sales landing, so the board that
// used to live there moves here — same origin, not a subdomain, because "app" is a reserved slug and
// an "app." host would resolve to no tenant and render the landing instead of the board.
//
// On a tenant host the board is still the homepage, so this URL redirects: the same content served
// at two URLs on one origin is a self-inflicted duplicate.
export async function generateMetadata(): Promise<Metadata> {
  const { config: cfg } = await getServerContext();
  return {
    // `absolute` on purpose: the layout's "%s · <brand>" template would append the brand to a title
    // that already ends in it, and this string has to survive character-for-character — it is what
    // the root URL is currently indexed as.
    title: { absolute: cfg.seo.boardTitle ?? cfg.seo.title },
    alternates: { canonical: "/board" },
    description: cfg.seo.boardDescription ?? cfg.seo.homeDescription ?? cfg.seo.description,
  };
}

export default async function BoardPage() {
  const { isPlatform } = await getServerContext();
  if (!isPlatform) redirect("/");
  return <BoardHome />;
}
