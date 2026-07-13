import { Header } from "../components/Header";
import { CapabilityCard } from "../components/CapabilityCard";
import { TierCard } from "../components/TierCard";

const CAPABILITIES = [
  {
    icon: "🔔",
    title: "Instant Requests",
    body: "Housekeeping, maintenance, laundry — guests raise a request in seconds and it lands directly with the right department, not a WhatsApp group someone forgot to check.",
  },
  {
    icon: "🍽",
    title: "Live Room Service",
    body: "A full menu in the guest's pocket. Orders hit the kitchen queue the instant they're placed, priced and routed automatically — no more shouted orders across the kitchen.",
  },
  {
    icon: "📱",
    title: "MoMo-Native Payments",
    body: "Mobile Money as the primary payment method, not an afterthought — because that's how Ghana actually pays. Cards work too, through the same Paystack integration.",
  },
  {
    icon: "⚡",
    title: "Real-Time, Always",
    body: "Reception, kitchen, and housekeeping read and write the same live board. A room marked dirty updates everywhere at once — no phone calls to confirm what already happened.",
  },
  {
    icon: "🔑",
    title: "No App, No Password",
    body: "Guests scan the QR code in their room and they're in. No download, no account, no friction — exactly the amount of technology a hotel stay should ask of a guest.",
  },
  {
    icon: "📶",
    title: "Built for Real Connections",
    body: "Staff tools keep working and queue actions when Wi-Fi drops, then sync when it's back. Designed around Ghana's actual mobile data reality, not a fibre-optic demo.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Scan & Access",
    body: "Guests scan the QR code in their room — no download, no password. Staff tap in with a 4-digit PIN on a shared tablet.",
  },
  {
    n: "02",
    title: "Request & Order",
    body: "One tap to order room service, request housekeeping, or flag a maintenance issue. Every action is logged and routed automatically.",
  },
  {
    n: "03",
    title: "Everyone Stays In Sync",
    body: "The right department is notified instantly. Guests see live status. Reception sees the whole property on one board — no calls, no chasing.",
  },
];

const TIERS = [
  {
    eyebrow: "For restaurants & cafés",
    name: "Order",
    description: "QR digital menu, live kitchen queue, and MoMo payments — for food service with no rooms module.",
    features: ["QR digital menu & ordering", "Live kitchen order queue", "MoMo & card payments", "Basic sales reporting"],
  },
  {
    eyebrow: "For small hotels & guesthouses",
    name: "Essentials",
    description: "5–40 rooms, single location. Replaces WhatsApp chaos with one shared system, no PMS required.",
    features: [
      "Everything in Order",
      "Guest portal: housekeeping, maintenance, chat",
      "Reception, housekeeping & maintenance portals",
      "Room status board & categories",
      "Branch manager dashboard",
    ],
    featured: true,
  },
  {
    eyebrow: "For full-service hotels",
    name: "Growth",
    description: "40–150 rooms with a spa, pool, gym, or conference rooms — still a single location.",
    features: [
      "Everything in Essentials",
      "Activities & facilities booking",
      "Split billing & deposit holds",
      "Live guest bill & SLA escalation",
      "Multi-language guest portal",
    ],
  },
  {
    eyebrow: "For hotel groups & chains",
    name: "Enterprise",
    description: "Multiple properties, or a single resort large enough to need integrations and deep reporting.",
    features: [
      "Everything in Growth",
      "Multi-branch owner dashboard",
      "PMS / channel manager integration",
      "Offline mode for staff app",
      "Priority support",
    ],
  },
];

export default function Home() {
  return (
    <main className="section-light">
      {/* Hero */}
      <section
        style={{
          position: "relative",
          minHeight: "92vh",
          display: "flex",
          alignItems: "center",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #3a2c1c 0%, var(--ink) 55%), var(--ink)",
          color: "var(--white)",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(115deg, rgba(201,168,105,0.05) 0px, rgba(201,168,105,0.05) 1px, transparent 1px, transparent 90px)",
          }}
        />
        <Header />
        <div className="container" style={{ position: "relative", textAlign: "center", padding: "8rem 1.5rem 5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1.5rem" }}>
            Digital Hotel Operations
          </p>
          <h1
            className="display"
            style={{ fontSize: "clamp(2.4rem, 6vw, 4.2rem)", color: "var(--white)", marginBottom: "1.75rem" }}
          >
            Run Your Hotel
            <br />
            <em>Like One Team</em>
          </h1>
          <p
            style={{
              maxWidth: 560,
              margin: "0 auto 2.75rem",
              color: "var(--ivory-muted)",
              fontSize: "1.1rem",
              lineHeight: 1.7,
            }}
          >
            One shared system for reception, housekeeping, kitchen, and guests — replacing WhatsApp
            groups and phone calls with live requests, MoMo payments, and a room board everyone
            can see.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#capabilities" className="btn btn-gold">
              See It In Action →
            </a>
            <a href="#contact" className="btn btn-outline-light">
              Talk To Us
            </a>
          </div>
        </div>
      </section>

      {/* Built for Ghana strip — real differentiators, not fabricated traction numbers */}
      <section className="section-dark" style={{ padding: "3rem 0" }}>
        <div
          className="container"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "2rem",
            textAlign: "center",
          }}
        >
          {[
            ["MoMo-Native", "Not a bolt-on"],
            ["No App Required", "QR to portal, instantly"],
            ["Offline-Tolerant", "Built for real Wi-Fi"],
            ["WhatsApp-First", "Where guests already are"],
          ].map(([title, sub]) => (
            <div key={title}>
              <p className="display" style={{ fontSize: "1.3rem", color: "var(--gold)" }}>
                {title}
              </p>
              <p style={{ fontSize: "0.8rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ivory-faint)", marginTop: "0.4rem" }}>
                {sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" style={{ padding: "7rem 0" }}>
        <div className="container">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "1rem" }}>
              Core Capabilities
            </p>
            <h2 className="display" style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", marginBottom: "1.5rem" }}>
              Everything a Hotel <em>Actually Runs On</em>
            </h2>
            <div className="divider-star" style={{ marginBottom: "1.5rem" }}>
              ✦
            </div>
            <p style={{ color: "var(--cream-text-muted)", fontSize: "1.05rem" }}>
              DHOP replaces every phone call, every awkward knock, every missed request — with one
              system built for how Ghanaian hotels actually operate.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
            {CAPABILITIES.map((c) => (
              <CapabilityCard key={c.title} icon={c.icon} title={c.title}>
                {c.body}
              </CapabilityCard>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section
        className="section-dark"
        style={{
          padding: "7rem 0",
          textAlign: "center",
          background: "radial-gradient(ellipse 70% 50% at 50% 50%, #2a1f18 0%, var(--ink) 70%)",
        }}
      >
        <div className="container" style={{ maxWidth: 760 }}>
          <p className="eyebrow" style={{ marginBottom: "2rem" }}>
            The DHOP Philosophy
          </p>
          <blockquote
            className="display"
            style={{ fontSize: "clamp(1.5rem, 3.2vw, 2.25rem)", fontStyle: "italic", color: "var(--white)", lineHeight: 1.4 }}
          >
            &ldquo;The front desk shouldn&apos;t be the only place that knows what&apos;s happening
            in the hotel.&rdquo;
          </blockquote>
          <div className="divider-star" style={{ margin: "2rem 0" }}>
            ✦
          </div>
          <p className="eyebrow" style={{ color: "var(--ivory-faint)" }}>
            One Board. Every Department. No Phone Calls.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ padding: "7rem 0" }}>
        <div className="container">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "1rem" }}>
              Simple By Design
            </p>
            <h2 className="display" style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)" }}>
              Three Steps to <em>Synced Operations</em>
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
            {STEPS.map((s) => (
              <div key={s.n} className="card-dark" style={{ padding: "2.5rem 2rem", background: "var(--ink)" }}>
                <p
                  className="display"
                  style={{ fontSize: "2.5rem", color: "var(--gold)", opacity: 0.6, marginBottom: "1rem" }}
                >
                  {s.n}
                </p>
                <h3 className="display" style={{ fontSize: "1.35rem", color: "var(--white)", marginBottom: "0.75rem" }}>
                  {s.title}
                </h3>
                <p style={{ color: "var(--ivory-muted)", fontSize: "0.92rem", lineHeight: 1.6 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section id="tiers" className="section-dark" style={{ padding: "7rem 0" }}>
        <div className="container">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "1rem" }}>
              Built For Your Property
            </p>
            <h2 className="display" style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", color: "var(--white)" }}>
              Sized to How You <em>Actually Operate</em>
            </h2>
            <p style={{ color: "var(--ivory-muted)", marginTop: "1.5rem" }}>
              Split by operational complexity, not just room count. We&apos;ll help you find the
              right fit — pricing is set per property during onboarding.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem" }}>
            {TIERS.map((t) => (
              <TierCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: "6rem 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 620 }}>
          <h2 className="display" style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.5rem)", marginBottom: "1.25rem" }}>
            Ready to Stop Running Your Hotel on <em>WhatsApp?</em>
          </h2>
          <p style={{ color: "var(--cream-text-muted)", marginBottom: "2.25rem" }}>
            We&apos;re onboarding a small number of pilot properties in Ghana. Tell us about your
            hotel and we&apos;ll walk you through it.
          </p>
          <a href="#contact" className="btn" style={{ background: "var(--ink)", color: "var(--white)" }}>
            Talk To Us
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="section-dark" style={{ padding: "4.5rem 0 2.5rem" }}>
        <div className="container">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "3rem",
              marginBottom: "3rem",
            }}
          >
            <div style={{ maxWidth: 320 }}>
              <p className="display" style={{ fontSize: "1.3rem", color: "var(--white)", marginBottom: "0.75rem" }}>
                DHOP
              </p>
              <p style={{ color: "var(--ivory-faint)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                Digital Hotel Operations Platform — one shared system for reception, kitchen,
                housekeeping, and guests. Built for Ghana and West Africa.
              </p>
            </div>
            <div style={{ display: "flex", gap: "4rem", flexWrap: "wrap" }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: "1rem" }}>
                  Product
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <a href="#capabilities" style={{ color: "var(--ivory-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
                    Capabilities
                  </a>
                  <a href="#tiers" style={{ color: "var(--ivory-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
                    Pricing
                  </a>
                </div>
              </div>
              <div>
                <p className="eyebrow" style={{ marginBottom: "1rem" }}>
                  Contact
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <a href="mailto:hello@dhop.app" style={{ color: "var(--ivory-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
                    hello@dhop.app
                  </a>
                  <span style={{ color: "var(--ivory-muted)", fontSize: "0.9rem" }}>Accra, Ghana</span>
                </div>
              </div>
            </div>
          </div>
          <hr style={{ border: "none", borderTop: "1px solid var(--ink-border)", marginBottom: "1.75rem" }} />
          <p style={{ color: "var(--ivory-faint)", fontSize: "0.8rem" }}>
            © {new Date().getFullYear()} DHOP. Built for hotels that are done running on WhatsApp.
          </p>
        </div>
      </footer>
    </main>
  );
}
