import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSingleTenant } from "@/lib/launchpad-single";
import { PreviewRoute } from "./PreviewRoute";

// A scratch surface for an UNSAVED draft: there is nothing here for a crawler, and the page renders
// nothing at all without a handoff id in the fragment.
export const metadata: Metadata = {
  title: "Launchpad preview",
  robots: { index: false, follow: false },
};

export default function LaunchpadPreviewPage() {
  // Part of the designer, and the designer is platform-only: with /create-launchpad returning 404
  // on an operator's deployment nothing there can ever hand this route a draft.
  if (isSingleTenant()) notFound();

  return (
    <div className="lp-page">
      {/* Everything visible is portaled to <body> by PreviewStage — this stub only exists so the
          route has a document to live in. It is what shows if scripting is off. */}
      <p className="note">Opening preview…</p>
      <PreviewRoute />
    </div>
  );
}
