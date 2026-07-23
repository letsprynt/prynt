"use client";

import { useCallback, useEffect, useRef } from "react";

// A ~120-line rigid-body toy: gravity, walls, equal-mass circle collisions, and pointer throwing.
// No physics library — matter.js is 90KB for a box of balls, and the whole simulation here is one
// integration step plus a pairwise loop over at most 14 bodies (91 pairs), which is nothing.
//
// DOM nodes, not canvas. Coin art is arbitrary remote/IPFS-proxied media of unknown aspect ratio;
// <img> with object-fit and a border-radius handles that for free, canvas would need manual
// letterboxing and a clip path per body. At this body count the transform writes are cheaper than
// the redraw would be anyway.
//
// Three things this must not do, all enforced below:
//   - burn CPU off-screen (IntersectionObserver gates the rAF loop),
//   - animate for someone who asked it not to (prefers-reduced-motion leaves the bodies where they
//     were laid out and never starts the loop),
//   - differ between server and client render (initial positions are derived from the index, never
//     from Math.random, so the first paint matches the markup React shipped).

export type PitCoin = { id: string; symbol: string; src: string | null };

type Body = {
  x: number; // centre, px
  y: number;
  vx: number;
  vy: number;
  r: number;
  el: HTMLElement;
};

const GRAVITY = 0.55;
const RESTITUTION = 0.62; // energy kept on a wall bounce
const FRICTION = 0.992; // air drag per frame
const FLOOR_FRICTION = 0.94; // horizontal damping while resting on the floor
const MAX_SPEED = 34; // clamp so a violent throw cannot tunnel a body through a wall

/// Deterministic pseudo-random in [0,1) from an integer. Math.random would desynchronise the server
/// markup from the first client render; this gives the same scatter on both sides.
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function CoinPitStage({ coins, className = "" }: { coins: PitCoin[]; className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bodiesRef = useRef<Body[]>([]);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  /// Which body a pointer is holding, plus the last two positions — the throw velocity is the
  /// pointer's own displacement, not a spring, so a flick feels like the thing it is.
  const dragRef = useRef<{ id: number; body: Body; px: number; py: number } | null>(null);

  const step = useCallback(() => {
    const stage = stageRef.current;
    const bodies = bodiesRef.current;
    if (!stage || bodies.length === 0) return;

    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const held = dragRef.current?.body;

    for (const b of bodies) {
      if (b === held) continue;
      b.vy += GRAVITY;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      // Clamp before integrating: a body moving further than its own radius in one frame can pass
      // straight through the floor between two samples.
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx = (b.vx / sp) * MAX_SPEED;
        b.vy = (b.vy / sp) * MAX_SPEED;
      }
      b.x += b.vx;
      b.y += b.vy;

      if (b.x - b.r < 0) {
        b.x = b.r;
        b.vx = -b.vx * RESTITUTION;
      } else if (b.x + b.r > w) {
        b.x = w - b.r;
        b.vx = -b.vx * RESTITUTION;
      }
      if (b.y + b.r > h) {
        b.y = h - b.r;
        b.vy = -b.vy * RESTITUTION;
        b.vx *= FLOOR_FRICTION;
      } else if (b.y - b.r < 0) {
        b.y = b.r;
        b.vy = -b.vy * RESTITUTION;
      }
    }

    // Equal-mass elastic response along the contact normal, with a positional correction so a stack
    // of resting bodies does not sink into itself.
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const c = bodies[j];
        let dx = c.x - a.x;
        let dy = c.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.r + c.r;
        if (d >= min) continue;
        // Two bodies spawned at the same point have no normal to push along; pick one.
        if (d === 0) {
          dx = 1;
          dy = 0;
          d = 1;
        }
        const nx = dx / d;
        const ny = dy / d;
        const overlap = (min - d) / 2;
        const aHeld = a === held;
        const cHeld = c === held;
        // A held body is infinitely heavy: it shoves others and never moves itself.
        if (!aHeld) {
          a.x -= nx * overlap * (cHeld ? 2 : 1);
          a.y -= ny * overlap * (cHeld ? 2 : 1);
        }
        if (!cHeld) {
          c.x += nx * overlap * (aHeld ? 2 : 1);
          c.y += ny * overlap * (aHeld ? 2 : 1);
        }
        const rvx = c.vx - a.vx;
        const rvy = c.vy - a.vy;
        const sep = rvx * nx + rvy * ny;
        if (sep > 0) continue; // already separating
        const imp = -(1 + RESTITUTION) * sep * 0.5;
        if (!aHeld) {
          a.vx -= imp * nx;
          a.vy -= imp * ny;
        }
        if (!cHeld) {
          c.vx += imp * nx;
          c.vy += imp * ny;
        }
      }
    }

    for (const b of bodies) {
      b.el.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
    }
  }, []);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    step();
    rafRef.current = requestAnimationFrame(loop);
  }, [step]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Bodies are created on the FIRST activation, not at mount. Doing it at mount was the bug behind
    // an invisible drop: during hydration the document is still short (images unsized, sections not
    // yet laid out), the band sits inside the viewport, the observer immediately reports it visible,
    // and the whole cascade plays into a screen the reader is nowhere near. By the time they scroll
    // down, the pile has been resting for seconds. Deferring both the measurement and the spawn to
    // the first genuine intersection also means the stage dimensions are the settled ones.
    const spawn = () => {
      const all = Array.from(stage.querySelectorAll<HTMLElement>("[data-pit-ball]"));
      const w = stage.clientWidth;
      const h = stage.clientHeight;

      // The server ships one fixed body count for every viewport, and at 390px that pile is taller
      // than the pit: bodies jam above the top edge where overflow hides them forever, and the ones
      // squeezed at the sides get pushed through the walls by the overlap correction. So the count
      // is capped here, against the stage the browser actually laid out.
      //
      // 0.52 is the usable fraction of a rectangle that loose circles occupy — hexagonal packing
      // tops out near 0.9, but these are dropped rather than placed, they never settle that tightly,
      // and a pit filled to its theoretical maximum has no room left to throw anything.
      const avgArea = all.reduce((a, el) => a + Math.PI * (el.offsetWidth / 2) ** 2, 0) / Math.max(1, all.length);
      const fits = Math.max(4, Math.floor(((w * h) / Math.max(1, avgArea)) * 0.52));
      const els = all.slice(0, fits);
      for (const el of all.slice(fits)) el.style.display = "none";

      bodiesRef.current = els.map((el, i) => {
        const r = el.offsetWidth / 2;
        return {
          // Spread across the width and stacked far above the pit, so they arrive as a shower over
          // about a second and a half rather than as one row landing on the same frame. The spacing
          // is what makes the drop READ as an animation — at a third of this the whole cascade was
          // over in a quarter of a second and looked like the pile had simply always been there.
          x: r + rand(i + 1) * Math.max(1, w - r * 2),
          y: -r - i * 88 - rand(i + 7) * 200,
          vx: (rand(i + 13) - 0.5) * 3,
          vy: 0,
          r,
          el,
        };
      });
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        const shouldRun = entry.isIntersecting;
        if (shouldRun === runningRef.current) return;
        runningRef.current = shouldRun;
        if (shouldRun) {
          if (bodiesRef.current.length === 0) spawn();
          rafRef.current = requestAnimationFrame(loop);
        } else if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      },
      // Negative rootMargin, not threshold 0. The drop only plays ONCE — the bodies start above the
      // stage and never reset — so it has to begin when the band is genuinely on screen. Firing on
      // the first pixel meant anyone scrolling at a normal speed arrived to a pile that had already
      // landed and never saw the cascade at all.
      { rootMargin: "-12% 0px -12% 0px", threshold: 0 },
    );
    io.observe(stage);

    // Keep the bodies inside a resized stage. Bounds are read fresh every frame, so this only has
    // to rescue anything already stranded outside the new box.
    const ro = new ResizeObserver(() => {
      if (bodiesRef.current.length === 0) return; // nothing spawned yet; spawn() will measure fresh
      const nw = stage.clientWidth;
      const nh = stage.clientHeight;
      for (const b of bodiesRef.current) {
        b.x = Math.min(Math.max(b.x, b.r), Math.max(b.r, nw - b.r));
        b.y = Math.min(b.y, Math.max(b.r, nh - b.r));
      }
    });
    ro.observe(stage);

    return () => {
      io.disconnect();
      ro.disconnect();
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [loop]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage || bodiesRef.current.length === 0) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // Topmost first: later bodies paint over earlier ones, so grabbing should follow the same order.
    for (let i = bodiesRef.current.length - 1; i >= 0; i--) {
      const b = bodiesRef.current[i];
      if (Math.hypot(px - b.x, py - b.y) <= b.r) {
        dragRef.current = { id: e.pointerId, body: b, px, py };
        b.vx = 0;
        b.vy = 0;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("is-holding");
        return;
      }
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.id !== e.pointerId) return;
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    // The throw velocity IS the pointer delta, recorded here and handed over on release.
    drag.body.vx = px - drag.px;
    drag.body.vy = py - drag.py;
    drag.body.x = px;
    drag.body.y = py;
    drag.px = px;
    drag.py = py;
    drag.body.el.style.transform = `translate3d(${px - drag.body.r}px, ${py - drag.body.r}px, 0)`;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragRef.current = null;
    stageRef.current?.classList.remove("is-holding");
  }, []);

  return (
    <div
      ref={stageRef}
      className={`mk-pit-stage ${className}`.trim()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // Decoration. The coins are named in the hero frame and on /board with real links; a screen
      // reader gains nothing from fourteen unlabelled circles and loses a lot of time to them.
      aria-hidden="true"
    >
      {coins.map((c, i) => (
        <div
          key={c.id}
          data-pit-ball=""
          className="mk-pit-ball"
          // Laid out across the top before the effect runs, so the pre-hydration paint is a row of
          // coins rather than a heap in the corner. Physics overwrites both on its first frame.
          style={{
            width: 52 + Math.round(rand(i + 3) * 54),
            height: 52 + Math.round(rand(i + 3) * 54),
            transform: `translate3d(${Math.round(rand(i + 1) * 40 + (i % 14) * 82)}px, ${Math.round(rand(i + 7) * 40)}px, 0)`,
          }}
        >
          {c.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.src} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <span>{c.symbol}</span>
          )}
        </div>
      ))}
    </div>
  );
}
