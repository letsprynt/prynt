"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyTrade, fetchKing, fetchTokensPage, fetchTrending, useEthUsd, useTokenStream, type TokenSummary } from "@/lib/api";
import { useOptimisticTokens, dropOptimisticToken } from "@/lib/optimistic";
import { useUi } from "@/lib/ui";
import { TokenCard, compactEth, compactUsd, timeAgo } from "./TokenCard";
import { BoardSearch } from "./BoardSearch";
import { KingOfHill } from "./KingOfHill";
import { TokenImage } from "@/components/TokenImage";
import { IconAlert, IconBars, IconChevronLeft, IconChevronRight, IconDollar, IconFlame, IconGrid, IconRows, IconSparkle, IconTrendUp, IconZap } from "@/components/icons";

const SORTS = [
  { key: "new", label: "New", icon: <IconSparkle size={15} /> },
  { key: "marketCap", label: "Market cap", icon: <IconDollar size={15} /> },
  { key: "volume", label: "Volume", icon: <IconBars size={15} /> },
  { key: "trades", label: "Trades", icon: <IconZap size={15} /> },
  { key: "progress", label: "Bonding", icon: <IconTrendUp size={15} /> },
] as const;

const isGraduated = (t: TokenSummary) => t.migrated || t.complete;

export function TokenBoard() {
  const { search, sort, setSort, showGraduated, setShowGraduated, showSensitive, setShowSensitive, openCreate } = useUi();
  const [debounced, setDebounced] = useState(search);
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null);
  const [trending, setTrending] = useState<TokenSummary[]>([]);
  const [error, setError] = useState("");
  const [newCurves, setNewCurves] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "table">("grid");
  const [king, setKing] = useState<TokenSummary | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const eth = useEthUsd();
  const stripRef = useRef<HTMLDivElement>(null);
  const kingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const PAGE = 30;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  // King of the Hill: authoritative single-king fetch, polled as a backstop and refetched on every live trade
  // (debounced) so leadership swaps the instant someone overtakes — independent of the board's search/sort.
  const loadKing = useCallback(async () => {
    try {
      setKing(await fetchKing());
    } catch {
      /* keep last king on a transient error */
    }
  }, []);
  useEffect(() => {
    loadKing();
    const id = setInterval(loadKing, 6000);
    return () => {
      clearInterval(id);
      clearTimeout(kingTimer.current);
    };
  }, [loadKing]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [page, tr] = await Promise.all([fetchTokensPage(sort, debounced, 0, PAGE), fetchTrending()]);
      setTokens(page.tokens);
      setHasMore(false); // cap the board at one page (max 30) — no infinite scroll
      offsetRef.current = page.nextOffset;
      setTrending(tr);
    } catch (e) {
      setError((e as Error).message);
      setTokens([]);
      setHasMore(false);
    }
  }, [sort, debounced]);

  useEffect(() => {
    setTokens(null);
    load();
  }, [load]);

  // infinite scroll: fetch the next page when the sentinel scrolls into view
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchTokensPage(sort, debounced, offsetRef.current, PAGE);
      setTokens((prev) => {
        const seen = new Set((prev ?? []).map((t) => t.curve));
        return [...(prev ?? []), ...page.tokens.filter((t) => !seen.has(t.curve))]; // de-dup vs live inserts/overlap
      });
      setHasMore(page.hasMore);
      offsetRef.current = page.nextOffset;
    } catch {
      /* keep what we have; the sentinel will retry on next intersection */
    } finally {
      setLoadingMore(false);
    }
  }, [sort, debounced, hasMore, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), { rootMargin: "500px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  useTokenStream({
    onToken: (t) => {
      dropOptimisticToken(t.curve); // the real indexed token has arrived → retire the optimistic placeholder
      if (debounced) return;
      setTokens((prev) => {
        if (!prev) return prev;
        const i = prev.findIndex((x) => x.curve.toLowerCase() === t.curve.toLowerCase());
        if (i === -1) return [t, ...prev];
        const next = [...prev];
        next[i] = { ...t, imageUrl: t.imageUrl ?? prev[i].imageUrl }; // keep an already-shown image if indexer's is still null
        return next;
      });
      setNewCurves((prev) => new Set(prev).add(t.curve));
      setTimeout(() => setNewCurves((prev) => {
        const n = new Set(prev);
        n.delete(t.curve);
        return n;
      }), 1700);
    },
    onTrade: (tr) => {
      const hit = (x: TokenSummary) => (x.curve.toLowerCase() === tr.curve.toLowerCase() ? applyTrade(x, tr) : x);
      setTokens((prev) => (prev ? prev.map(hit) : prev));
      setTrending((prev) => prev.map(hit));
      // any trade can move a token across 70% or change the leader → refetch the crown (debounced)
      clearTimeout(kingTimer.current);
      kingTimer.current = setTimeout(loadKing, 350);
    },
    // late image backfill: an image that wasn't on IPFS at creation just resolved → patch the card live
    onTokenMeta: (m) => {
      const patch = (x: TokenSummary) =>
        x.curve.toLowerCase() === m.curve.toLowerCase() && !x.imageUrl
          ? { ...x, imageUrl: m.imageUrl, description: m.description ?? x.description, website: m.website ?? x.website, twitter: m.twitter ?? x.twitter, telegram: m.telegram ?? x.telegram }
          : x;
      setTokens((prev) => (prev ? prev.map(patch) : prev));
      setTrending((prev) => prev.map(patch));
    },
  });

  // Merge optimistic just-launched coins at the top (deduped against indexed rows) so the creator sees their coin
  // instantly; each is dropped once its real indexed token streams in.
  const optimistic = useOptimisticTokens();
  const merged = useMemo(() => {
    if (!tokens) return tokens;
    if (optimistic.length === 0 || debounced) return tokens;
    const have = new Set(tokens.map((t) => t.curve.toLowerCase()));
    const extra = optimistic.filter((o) => !have.has(o.curve.toLowerCase()));
    return extra.length ? [...extra, ...tokens] : tokens;
  }, [tokens, optimistic, debounced]);

  // "Graduated" toggle ON → ONLY graduated coins; OFF → everything (an exclusive filter, not show/hide)
  const shown = merged ? (showGraduated ? merged.filter(isGraduated) : merged) : merged;
  const scrollStrip = (dir: number) => stripRef.current?.scrollBy({ left: dir * 420, behavior: "smooth" });

  return (
    <div className="board">
      {/* ── King of the Hill: the token closest to graduating (≥70% bonded), swaps live ── */}
      <KingOfHill king={king} ethUsd={eth.usd} />

      {/* ── Trending strip: large landscape cards ── */}
      {trending.length > 0 && (
        <section className="trend-strip">
          <div className="trend-strip-head">
            <h2><span className="hot"><IconFlame size={17} /> Trending</span> <span className="muted">· top volume, last 24h</span></h2>
            <div className="strip-arrows">
              <button className="secondary" onClick={() => scrollStrip(-1)} aria-label="scroll left"><IconChevronLeft size={16} /></button>
              <button className="secondary" onClick={() => scrollStrip(1)} aria-label="scroll right"><IconChevronRight size={16} /></button>
            </div>
          </div>
          <div className="trend-strip-row" ref={stripRef}>
            {trending.map((t, i) => (
              <Link key={t.curve} href={`/token/${t.curve}`} className="trend-big">
                <div className="trend-big-img">
                  <TokenImage src={t.imageUrl} alt={t.symbol} seed={t.symbol} label={t.symbol} nsfw={t.nsfw} className="trend-big-media" />
                  <span className="trend-rank">#{i + 1}</span>
                  <div className="trend-big-mcap">
                    {eth.usd != null ? (
                      <>
                        <span className="trend-big-usd"><span className="mc-tag">MC</span>{compactUsd(Number(t.marketCapEth) * eth.usd)}</span>
                        <span className="trend-big-eth">{compactEth(t.marketCapEth)} ETH</span>
                      </>
                    ) : (
                      <span className="trend-big-usd"><span className="mc-tag">MC</span>{compactEth(t.marketCapEth)} ETH</span>
                    )}
                  </div>
                </div>
                <div className="trend-big-body">
                  <div className="trend-big-name">{t.name} <span className="muted">${t.symbol}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Controls: sort pills · filter chips · grid/table toggle ── */}
      <div className="board-controls">
        <BoardSearch />
        <div className="board-controls-right">
          <div className="pills">
            {SORTS.map((s) => (
              <button key={s.key} className={`pill${sort === s.key ? " active" : ""}`} onClick={() => setSort(s.key)}>
                <span className="pill-ico">{s.icon}</span> {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showGraduated}
            className="grad-toggle"
            onClick={() => setShowGraduated(!showGraduated)}
            title={showGraduated ? "Showing only graduated coins — click to show all" : "Show only graduated coins"}
          >
            <span className="grad-toggle-label">Graduated</span>
            <span className={`ui-switch${showGraduated ? " on" : ""}`}><span className="ui-switch-knob" /></span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={showSensitive}
            className="grad-toggle"
            onClick={() => setShowSensitive(!showSensitive)}
            title={showSensitive ? "Hide sensitive (NSFW) images" : "Show sensitive (NSFW) images"}
          >
            <span className="grad-toggle-label">Sensitive</span>
            <span className={`ui-switch${showSensitive ? " on" : ""}`}><span className="ui-switch-knob" /></span>
          </button>
          <div className="view-toggle">
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="grid"><IconGrid size={16} /></button>
            <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} aria-label="table"><IconRows size={16} /></button>
          </div>
        </div>
      </div>

      {/* ── States ── */}
      {error ? (
        <div className="board-state">
          <div className="state-ico"><IconAlert size={28} /></div>
          <p>Couldn’t reach the indexer API.</p>
          <p className="muted" style={{ fontSize: 13 }}>{error}</p>
          <button className="secondary" onClick={load}>Retry</button>
        </div>
      ) : shown === null ? (
        <div className="board-grid">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="tcard skeleton" />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="board-state">
          <div className="state-ico"><IconSparkle size={28} /></div>
          <p>{debounced
            ? "No tokens match your search."
            : showGraduated ? "No graduated coins yet — the first one is still climbing the curve."
            : "No tokens launched yet."}</p>
          {!debounced && !showGraduated && <button onClick={openCreate}>Be the first — launch a token</button>}
        </div>
      ) : view === "grid" ? (
        <div className="board-grid">
          {shown.map((t) => <TokenCard key={t.curve} t={t} isNew={newCurves.has(t.curve)} ethUsd={eth.usd} isKing={king?.curve === t.curve} />)}
        </div>
      ) : (
        <div className="board-table">
          <div className="bt-head">
            <span>Token</span><span>Market cap</span><span>Bonding</span><span>Holders</span><span>Age</span>
          </div>
          {shown.map((t) => (
            <Link key={t.curve} href={`/token/${t.curve}`} className={`bt-row${newCurves.has(t.curve) ? " tcard-new" : ""}`}>
              <span className="bt-token">
                <TokenImage src={t.imageUrl} alt={t.symbol} seed={t.symbol} label={t.symbol} nsfw={t.nsfw} className="bt-media" />
                <span><strong>{t.name}</strong> <span className="muted">${t.symbol}</span></span>
              </span>
              <span>{eth.usd != null ? <><strong>{compactUsd(Number(t.marketCapEth) * eth.usd)}</strong> <span className="muted">· {compactEth(t.marketCapEth)} ETH</span></> : <>{compactEth(t.marketCapEth)} ETH</>}</span>
              <span>{t.bondingProgressPct.toFixed(1)}%</span>
              <span>{t.holderCount}</span>
              <span className="muted">{timeAgo(t.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}

      {tokens && tokens.length > 0 && hasMore && (
        <div ref={sentinelRef} className="board-sentinel">{loadingMore && <span className="spinner" />}</div>
      )}
    </div>
  );
}
