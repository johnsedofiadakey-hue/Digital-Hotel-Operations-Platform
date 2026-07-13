import type { ReactNode } from "react";

// Same intentionally-unstyled shell as guest-web's — full DHOP branding
// (Satoshi/Inter) lands once there's more than a couple of screens to design
// against.
export function MessagePage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>{title}</h1>
      {children}
    </main>
  );
}
