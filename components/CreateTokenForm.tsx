"use client";

import { useRef, useState } from "react";
import { parseEther, parseEventLogs } from "viem";
import { useAccount, useConfig, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { activeChain } from "@/lib/wagmi";
import { FACTORY_ADDRESS, factoryAbi } from "@/lib/contracts";
import { addOptimisticToken, buildOptimisticToken } from "@/lib/optimistic";
import { fmtEth, fmtTokens } from "@/lib/format";
import { previewFirstBuy } from "@/lib/curve";
import { classifyFile } from "@/lib/nsfw";
import { track } from "@/lib/analytics";
import { playLaunch } from "@/lib/sound";
import { shortTxError, useToast } from "@/lib/toast";
import { validateSocial, type SocialKind } from "@/lib/links";

const NAME_MAX = 32;
const SYMBOL_MAX = 10;
const DESC_MAX = 2000;

export function CreateTokenForm({ onCreated }: { onCreated?: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== activeChain.id;
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [linkErr, setLinkErr] = useState<Partial<Record<SocialKind, string>>>({});
  const [firstBuy, setFirstBuy] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"" | "Uploading to IPFS…" | "Confirm in wallet…" | "Launching…">("");

  const { data: creationFee } = useReadContract({ address: FACTORY_ADDRESS, abi: factoryAbi, functionName: "creationFee" });
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const toast = useToast();

  async function setFile(f: File | null) {
    if (f && !f.type.startsWith("image/")) {
      toast.error("That file isn't an image");
      return;
    }
    setImage(f);
    setPreview(f ? URL.createObjectURL(f) : "");
    setNsfw(false);
    if (!f) return;
    // Client-side NSFW pre-check: block explicit, flag borderline for the blur gate. Lazy-loads on first use.
    setChecking(true);
    try {
      const v = await classifyFile(f);
      if (v.explicit) {
        toast.error("That image looks explicit and can’t be used — pick another.");
        setImage(null);
        setPreview("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        setNsfw(v.nsfw);
      }
    } catch {
      /* model/network failed — allow it; server-side moderation is the backstop */
    } finally {
      setChecking(false);
    }
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  function clearForm() {
    setName("");
    setSymbol("");
    setDescription("");
    setWebsite("");
    setTwitter("");
    setTelegram("");
    setLinkErr({});
    setFirstBuy("");
    setImage(null);
    setPreview("");
    setNsfw(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // live per-field validation on blur (clears as you type via the onChange below)
  function checkLink(kind: SocialKind, value: string) {
    const r = validateSocial(kind, value);
    setLinkErr((e) => ({ ...e, [kind]: r.ok ? undefined : r.error ?? "Invalid link" }));
  }

  async function submit() {
    if (!name || !symbol) return;

    // Validate + normalize the creator-supplied socials before anything is pinned. X must be x.com/twitter.com,
    // Telegram must be t.me, website any http(s) — and all get forced to https.
    const vWeb = validateSocial("website", website);
    const vTw = validateSocial("twitter", twitter);
    const vTg = validateSocial("telegram", telegram);
    if (!vWeb.ok || !vTw.ok || !vTg.ok) {
      setLinkErr({ website: vWeb.error ?? undefined, twitter: vTw.error ?? undefined, telegram: vTg.error ?? undefined });
      toast.error("Fix the social links before launching");
      return;
    }
    const websiteN = vWeb.url ?? "";
    const twitterN = vTw.url ?? "";
    const telegramN = vTg.url ?? "";

    track("create_submit", { symbol });
    const id = toast.loading("Uploading image & metadata to IPFS…");
    setStep("Uploading to IPFS…");

    let metadataURI = "";
    let uploadedImageUrl: string | null = null;
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("symbol", symbol);
      fd.append("description", description);
      fd.append("website", websiteN);
      fd.append("twitter", twitterN);
      fd.append("telegram", telegramN);
      if (image) fd.append("image", image);
      fd.append("nsfw", nsfw ? "1" : "0");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "upload failed");
      metadataURI = j.metadataURI;
      uploadedImageUrl = j.imageUrl || null; // the gateway URL we just pinned — for instant optimistic display
    } catch (e) {
      toast.update(id, "error", `IPFS upload failed: ${(e as Error).message}`);
      setStep("");
      return;
    }

    const fee = creationFee ?? 0n;
    let value = fee;
    try {
      if (firstBuy.trim()) value = fee + parseEther(firstBuy.trim());
    } catch {
      toast.update(id, "error", "Invalid first-buy amount");
      setStep("");
      return;
    }

    toast.update(id, "loading", "Confirm the launch in your wallet…");
    setStep("Confirm in wallet…");
    try {
      const txHash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        chainId: activeChain.id, // assert the wallet is on the right chain — never send a value tx on the wrong one
        functionName: "createToken",
        // maxFee = the fee we quoted the user (`fee`): if the owner raises creationFee ahead of this tx, it reverts
        // safely instead of silently diverting the bundled first-buy ETH to the treasury.
        args: [name, symbol, metadataURI, fee],
        value,
      });
      toast.update(id, "loading", "Launching token…");
      setStep("Launching…");
      const rec = await waitForTransactionReceipt(config, { hash: txHash });
      if (rec.status === "reverted") {
        toast.update(id, "error", "Launch reverted on-chain");
      } else {
        // Optimistic: surface the creator's coin on the board INSTANTLY (with the image they just uploaded),
        // instead of waiting ~12-24s for the indexer to see the on-chain event. The board reconciles it with the
        // real indexed token (and drops this) as soon as the SSE `token` event arrives.
        try {
          const evs = parseEventLogs({ abi: factoryAbi, eventName: "TokenCreated", logs: rec.logs });
          const ev = evs[0]?.args as { curve?: string; token?: string; creator?: string } | undefined;
          if (ev?.curve && ev?.token) {
            addOptimisticToken(
              buildOptimisticToken({
                curve: ev.curve, token: ev.token, creator: address ?? ev.creator ?? "0x",
                name, symbol, metadataURI, imageUrl: uploadedImageUrl,
                description, website: websiteN, twitter: twitterN, telegram: telegramN, nsfw,
              }),
            );
          }
        } catch {
          /* non-fatal — the indexer will surface the token shortly regardless */
        }
        toast.update(id, "success", `🚀 ${name} ($${symbol}) launched!`);
        track("create_success", { symbol });
        playLaunch();
        clearForm();
        onCreated?.();
      }
    } catch (e) {
      toast.update(id, "error", `Launch: ${shortTxError(e)}`);
    } finally {
      setStep("");
    }
  }

  const busy = step !== "";
  const disabled = !isConnected || !name || !symbol || busy || checking;

  // Live preview of how much supply the optional first-buy grabs at launch (floor price).
  const firstBuyWei = (() => {
    try {
      return firstBuy.trim() ? parseEther(firstBuy.trim()) : 0n;
    } catch {
      return 0n;
    }
  })();
  const buyPreview = firstBuyWei > 0n ? previewFirstBuy(firstBuyWei) : null;

  return (
    <div className="panel">
      <h2>Launch a token</h2>
      <p className="create-earn-note">Earn 0.5% of every trade on your coin — bonding curve and DEX, for life. Paid in ETH, claim any time.</p>

      <div className="create-grid">
        <div>
          <label>Token image</label>
          <div
            className={`avatar-pick${dragging ? " dragging" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={onDrop}
          >
            {preview ? <img src={preview} alt="preview" /> : <span>{dragging ? "Drop image" : "+ image"}</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} style={{ display: "none" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="field-label">Name <span className="field-count">{name.length}/{NAME_MAX}</span></label>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))} maxLength={NAME_MAX} placeholder="Doge Killer" />
          <label className="field-label">Symbol <span className="field-count">{symbol.length}/{SYMBOL_MAX}</span></label>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().slice(0, SYMBOL_MAX))} maxLength={SYMBOL_MAX} placeholder="DOGEK" />
        </div>
      </div>

      <label className="field-label">Description <span className="field-count">{description.length}/{DESC_MAX}</span></label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, DESC_MAX))} maxLength={DESC_MAX} rows={3} placeholder="What is this token about?" />

      <div className="create-grid">
        <div style={{ flex: 1 }}>
          <label>Website</label>
          <input
            value={website}
            onChange={(e) => { setWebsite(e.target.value); if (linkErr.website) setLinkErr((x) => ({ ...x, website: undefined })); }}
            onBlur={(e) => checkLink("website", e.target.value)}
            className={linkErr.website ? "input-err" : ""}
            placeholder="yoursite.xyz"
          />
          {linkErr.website && <span className="field-err">{linkErr.website}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <label>X / Twitter</label>
          <input
            value={twitter}
            onChange={(e) => { setTwitter(e.target.value); if (linkErr.twitter) setLinkErr((x) => ({ ...x, twitter: undefined })); }}
            onBlur={(e) => checkLink("twitter", e.target.value)}
            className={linkErr.twitter ? "input-err" : ""}
            placeholder="x.com/yourproject"
          />
          {linkErr.twitter && <span className="field-err">{linkErr.twitter}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <label>Telegram</label>
          <input
            value={telegram}
            onChange={(e) => { setTelegram(e.target.value); if (linkErr.telegram) setLinkErr((x) => ({ ...x, telegram: undefined })); }}
            onBlur={(e) => checkLink("telegram", e.target.value)}
            className={linkErr.telegram ? "input-err" : ""}
            placeholder="t.me/yourgroup"
          />
          {linkErr.telegram && <span className="field-err">{linkErr.telegram}</span>}
        </div>
      </div>

      <label>Optional first buy (ETH) — bought for you in the same tx (anti-snipe)</label>
      <input value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} placeholder="0.0" inputMode="decimal" />
      {buyPreview && buyPreview.tokens > 0n && (
        <span className="first-buy-preview">
          ≈ {fmtTokens(buyPreview.tokens)} {symbol || "tokens"} at launch · <b>{buyPreview.pctOfSupply.toFixed(2)}%</b> of supply
        </span>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        {wrongNetwork ? (
          <button className="switch-btn" onClick={() => switchChain({ chainId: activeChain.id })}>Switch to {activeChain.name}</button>
        ) : (
          <button onClick={submit} disabled={disabled}>{busy ? step : checking ? "Checking image…" : "Create token"}</button>
        )}
        <span className="muted">Creation fee: {fmtEth(creationFee)} ETH</span>
      </div>

      {!isConnected && <div className="note">Connect a wallet to launch.</div>}
    </div>
  );
}
