import type { ReactNode } from "react";

// Shared shell for the single-message outcome pages (out-of-order, invalid,
// device-limit, post-stay, vacant, register, enter). This is the very
// first screen most guests ever see — the spec calls outcome B (vacant,
// no active stay) "the single most important screen in the product for
// pilot survival," so the shell it and its siblings share gets real design
// weight, not an afterthought.
export function MessagePage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="page" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="brand-mark">✦</div>
      <h1 className="page-title">{title}</h1>
      <div className="card" style={{ marginTop: "1.5rem", display: "grid", gap: "1rem" }}>
        {children}
      </div>
    </main>
  );
}
