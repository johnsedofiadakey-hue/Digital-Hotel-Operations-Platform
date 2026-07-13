"use client";

import { useState } from "react";
import { createGuestClient } from "@repo/shared/supabase";

interface Props {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface ReviewLinks {
  google_review_url: string | null;
  tripadvisor_review_url: string | null;
}

// §7.4: private-first feedback (P1) plus the P3 redirect automation — an unhappy rating (<=3)
// only ever routes privately (escalate_unhappy_feedback(), already live), a happy rating (>=4)
// additionally offers a public review link, but only if the branch has actually configured one;
// an unconfigured branch falls back to exactly the private-only behavior this had before.
export function FeedbackForm({ supabaseUrl, supabaseAnonKey }: Props) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewLinks, setReviewLinks] = useState<ReviewLinks | null>(null);

  async function submit() {
    setSubmitting(true);
    const res = await fetch("/portal/token");
    const { token, stayId } = (await res.json()) as { token: string; stayId: string };
    const client = createGuestClient({ url: supabaseUrl, anonKey: supabaseAnonKey }, token);
    await client.from("feedback").insert({ stay_id: stayId, rating, body: body || null });

    if (rating >= 4) {
      const { data: stay } = await client.from("stays").select("branch_id").eq("id", stayId).maybeSingle<{ branch_id: string }>();
      if (stay) {
        const { data: branch } = await client
          .from("branches")
          .select("google_review_url, tripadvisor_review_url")
          .eq("id", stay.branch_id)
          .maybeSingle<ReviewLinks>();
        if (branch) setReviewLinks(branch);
      }
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  const reviewUrl = reviewLinks?.google_review_url || reviewLinks?.tripadvisor_review_url || null;

  if (submitted) {
    return (
      <div>
        <p>Thanks for letting us know.</p>
        {reviewUrl && (
          <p>
            Glad you enjoyed your stay —{" "}
            <a href={reviewUrl} target="_blank" rel="noreferrer">
              would you leave us a public review?
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.1rem" }}>How was your stay?</h2>
      <div style={{ display: "flex", gap: "0.25rem", margin: "0.5rem 0" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            style={{ fontWeight: n === rating ? "bold" : "normal" }}
          >
            {n}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anything you'd like us to know? (optional)"
        style={{ width: "100%", minHeight: "4rem" }}
      />
      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" disabled={submitting} onClick={submit}>
          {submitting ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </div>
  );
}
