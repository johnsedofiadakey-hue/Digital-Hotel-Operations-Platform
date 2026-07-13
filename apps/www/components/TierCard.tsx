export function TierCard({
  eyebrow,
  name,
  description,
  features,
  featured = false,
}: {
  eyebrow: string;
  name: string;
  description: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className="card-dark"
      style={{
        padding: "2.5rem 2rem",
        borderColor: featured ? "var(--gold)" : "var(--ink-border)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      {featured && <span className="eyebrow">Most flexible</span>}
      <div>
        <span className="eyebrow" style={{ color: "var(--ivory-faint)", display: "block", marginBottom: "0.5rem" }}>
          {eyebrow}
        </span>
        <h3 className="display" style={{ fontSize: "1.9rem", color: "var(--white)" }}>
          {name}
        </h3>
      </div>
      <p style={{ color: "var(--ivory-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>{description}</p>
      <hr style={{ border: "none", borderTop: "1px solid var(--ink-border)" }} />
      <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {features.map((f) => (
          <li
            key={f}
            style={{
              display: "flex",
              gap: "0.6rem",
              fontSize: "0.88rem",
              color: "var(--ivory-muted)",
            }}
          >
            <span style={{ color: "var(--gold)" }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
      <a href="#contact" className="btn btn-outline-gold" style={{ justifyContent: "center", marginTop: "auto" }}>
        Talk to sales
      </a>
    </div>
  );
}
