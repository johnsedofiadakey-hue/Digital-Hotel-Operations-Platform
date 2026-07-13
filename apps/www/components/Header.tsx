import Link from "next/link";

export function Header() {
  return (
    <header
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        padding: "1.75rem 0",
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            textDecoration: "none",
            color: "var(--white)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "999px",
              border: "1px solid var(--gold)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gold)",
              fontSize: "0.9rem",
            }}
          >
            ✦
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              letterSpacing: "0.14em",
              fontSize: "1rem",
            }}
          >
            DHOP
          </span>
        </Link>
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2.25rem",
            fontSize: "0.8rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span className="nav-links" style={{ display: "flex", alignItems: "center", gap: "2.25rem" }}>
            <a href="#capabilities" style={{ textDecoration: "none", color: "var(--ivory-muted)" }}>
              Product
            </a>
            <a href="#how-it-works" style={{ textDecoration: "none", color: "var(--ivory-muted)" }}>
              How it works
            </a>
            <a href="#tiers" style={{ textDecoration: "none", color: "var(--ivory-muted)" }}>
              Pricing
            </a>
          </span>
          <a href="#contact" className="btn btn-outline-light" style={{ padding: "0.7rem 1.1rem" }}>
            Talk to us
          </a>
        </nav>
      </div>
    </header>
  );
}
