// Uploads to Supabase Storage. Files go under "<user id>/" because the bucket
// policies only let a signed-in owner write inside their own folder
// (backend/schema.sql: venue-photos, venue-reels).

import { supabase } from "@/lib/supabase";

export const PHOTO_BUCKET = "venue-photos";
export const REEL_BUCKET = "venue-reels";

/** Uploads a file or blob and returns its public URL. */
export async function uploadPublic(bucket: string, file: Blob, ext: string, contentType: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("You must be signed in to upload.");

  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** The extension to store a file under, from its name, falling back to `fallback`. */
export function extOf(file: File, fallback: string): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

/** A video's length in seconds and a JPEG of an early frame, read in the browser. */
export function inspectVideo(file: File): Promise<{ duration: number; width: number; height: number; poster: Blob | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    const done = (result: { duration: number; width: number; height: number; poster: Blob | null } | Error) => {
      URL.revokeObjectURL(url);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    video.onerror = () => done(new Error("That video couldn't be read. Try an MP4 or MOV file."));
    video.onloadedmetadata = () => {
      // A frame a little way in: the very first is often black.
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height, duration } = video;
      const canvas = document.createElement("canvas");
      // Posters are small previews; cap the long edge at 1080px.
      const scale = Math.min(1, 1080 / Math.max(width, height, 1));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx || !width) {
        done({ duration, width, height, poster: null });
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done({ duration, width, height, poster: blob }), "image/jpeg", 0.82);
    };
  });
}
