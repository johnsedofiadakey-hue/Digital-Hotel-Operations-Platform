"use client";

import { useState } from "react";
import { createGuestClient } from "@repo/shared/supabase";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// §13 guest ID uploads [P2]. Full trust only (matches the RLS policy) —
// this is the most sensitive document type in the whole system.
export function IdUploadForm({ supabaseUrl, supabaseAnonKey }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setStatus(null);

    const res = await fetch("/portal/token");
    const { token, stayId, tier } = (await res.json()) as { token: string; stayId: string; tier: string };
    if (tier !== "full") {
      setStatus("ID upload requires full trust — scan the QR code in your room.");
      setUploading(false);
      return;
    }

    const client = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${stayId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage.from("guest-ids").upload(path, file);
    if (uploadError) {
      setStatus(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const { error: insertError } = await client.from("guest_id_uploads").insert({ stay_id: stayId, storage_path: path });
    setUploading(false);
    setStatus(insertError ? `Saved file but couldn't record it: ${insertError.message}` : "Uploaded — thank you.");
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>Upload ID</h2>
      <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" disabled={!file || uploading} onClick={upload}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
