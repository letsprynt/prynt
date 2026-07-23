"use client";

import { useEffect, useState } from "react";
import { isMuted, setMuted } from "@/lib/sound";
import { useMounted } from "@/lib/useMounted";
import { IconMute, IconSound } from "@/components/icons";

export function SoundToggle() {
  const mounted = useMounted();
  const [muted, setM] = useState(false);

  useEffect(() => {
    setM(isMuted());
    const f = () => setM(isMuted());
    window.addEventListener("vf:muted", f);
    return () => window.removeEventListener("vf:muted", f);
  }, []);

  if (!mounted) return null;
  return (
    <button className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Sounds off" : "Sounds on"}>
      {muted ? <IconMute size={17} /> : <IconSound size={17} />}
    </button>
  );
}
