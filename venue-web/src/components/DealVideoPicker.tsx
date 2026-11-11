"use client";

// The optional Discover video on the new-deal page: no video, one the venue
// already uploaded, or a new upload. A new video goes straight to Supabase
// Storage (venue-reels/<uid>/…) with a poster frame cut in the browser, then
// is registered as one of the venue's reels so later deals can reuse it.

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Film, Upload } from "lucide-react";
import { venueApi, type VenueReel } from "@/lib/api";
import { REEL_BUCKET, extOf, inspectVideo, uploadPublic } from "@/lib/storage";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;  // Supabase's per-file limit on our plan
const MAX_SECONDS = 60;
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export interface DealVideo {
  reel: VenueReel;
}

interface Props {
  venueId: string;
  value: DealVideo | null;
  onChange: (v: DealVideo | null) => void;
  /** True while a video uploads, so the deal can't be published without it. */
  onBusy: (busy: boolean) => void;
}

export function DealVideoPicker({ venueId, value, onChange, onBusy }: Props) {
  const qc = useQueryClient();
  const { data: reels = [] } = useQuery<VenueReel[]>({
    queryKey: ["venue-reels", venueId],
    queryFn: () => venueApi.reels(venueId),
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!VIDEO_TYPES.includes(file.type)) { setError("Choose an MP4 or MOV video."); return; }
    if (file.size > MAX_VIDEO_BYTES) { setError("Videos can be up to 50 MB. Trim it or export at a lower quality."); return; }

    setUploading(true);
    onBusy(true);
    try {
      setStatus("Checking the video…");
      const info = await inspectVideo(file);
      if (info.duration > MAX_SECONDS + 0.5) {
        throw new Error(`Keep it to ${MAX_SECONDS} seconds or less. This one is ${Math.round(info.duration)} seconds.`);
      }
      setStatus("Uploading…");
      const videoUrl = await uploadPublic(REEL_BUCKET, file, extOf(file, "mp4"), file.type);
      const posterUrl = info.poster ? await uploadPublic(REEL_BUCKET, info.poster, "jpg", "image/jpeg") : undefined;
      const reel = await venueApi.createReel(venueId, { video_url: videoUrl, poster_url: posterUrl });
      qc.setQueryData<VenueReel[]>(["venue-reels", venueId], (old) => [reel, ...(old ?? [])]);
      onChange({ reel });
      setStatus(info.height < info.width ? "Uploaded. Tip: upright (portrait) videos fill the screen in Discover." : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The video didn't upload. Try again.");
      setStatus(null);
    } finally {
      setUploading(false);
      onBusy(false);
    }
  }

  const tile = (on: boolean): React.CSSProperties => ({
    position: "relative", width: 96, height: 150, flexShrink: 0, borderRadius: 12, overflow: "hidden", padding: 0,
    border: `2px solid ${on ? "var(--accent)" : "var(--line2)"}`, background: "var(--surface2)", cursor: "pointer",
    display: "grid", placeItems: "center", color: "var(--muted)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
          Video <span style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>(optional)</span>
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
          A short clip that plays in the app&apos;s Discover feed with a Book button for this deal. Upright, under a minute.
        </p>
      </div>

      <div role="radiogroup" aria-label="Video for this deal" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        <button type="button" role="radio" aria-checked={!value} onClick={() => onChange(null)} style={tile(!value)}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>No video</span>
        </button>

        <label style={{ ...tile(false), cursor: uploading ? "wait" : "pointer", borderStyle: "dashed", textAlign: "center" }}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: 8 }}>
            <Upload size={18} strokeWidth={1.75} aria-hidden />
            {uploading ? "Uploading…" : "Upload new"}
          </span>
          <input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
        </label>

        {reels.map((r) => {
          const on = value?.reel.id === r.id;
          return (
            <button key={r.id} type="button" role="radio" aria-checked={on} aria-label={r.caption || "One of your videos"} onClick={() => onChange({ reel: r })} style={tile(on)}>
              {r.poster_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.poster_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <video src={r.video_url} muted playsInline preload="metadata" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              {!r.poster_url && <Film size={18} strokeWidth={1.75} aria-hidden style={{ position: "relative" }} />}
              {on && (
                <span style={{ position: "absolute", right: 6, top: 6, width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--accent)", color: "var(--accent-ink)" }}>
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {reels.length > 0 && !value && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--faint)" }}>Tap one of your earlier videos to use it again.</p>
      )}
      {status && <p role="status" style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>{status}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--accent-text)" }}>{error}</p>}
    </div>
  );
}
