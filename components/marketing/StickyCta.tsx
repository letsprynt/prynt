import Link from "next/link";

/// Mobile-only sticky conversion bar for the platform landing page.
///
/// Purely declarative: no JS, no scroll listener, no dismiss state. A CSS media query hides it above 720px,
/// so desktop pays nothing for it and there is no hydration cost on the page that has to load fastest.
/// Pair it with `padding-bottom` on the landing container (see .mk-page in globals.css consumers) so the
/// footer's last line is never covered.
export function StickyCta() {
  return (
    // No role="complementary": this sits inside <main>, where ARIA discourages that landmark, and a
    // bar holding one link needs no landmark of its own.
    <div className="mk-sticky">
      <Link href="/create-launchpad" className="mk-sticky-btn">
        Create your launchpad
      </Link>
    </div>
  );
}
