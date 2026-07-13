import type { ReactNode } from "react";

export function CapabilityCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="card-dark" style={{ padding: "2.25rem" }}>
      <div className="icon-badge" style={{ marginBottom: "1.5rem" }}>
        {icon}
      </div>
      <h3
        className="display"
        style={{ fontSize: "1.4rem", color: "var(--white)", marginBottom: "0.75rem" }}
      >
        {title}
      </h3>
      <p style={{ color: "var(--ivory-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}
