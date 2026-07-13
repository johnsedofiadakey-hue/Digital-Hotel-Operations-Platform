"use client";

import { useState } from "react";

// §7.2: "guest's language choice first if multi-language is enabled [P2 for
// full translations; P1 ships English with the language switcher
// scaffolded]." This is exactly that — the UI element exists and sits
// first on the welcome screen, but there's no i18n library wired in and no
// translated copy anywhere in this app yet (that's the explicitly-P2 part).
// Selecting anything but English just says so, honestly, rather than
// pretending to switch language and silently doing nothing.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "tw", label: "Twi" },
  { code: "fr", label: "Français" },
];

export function LanguageSwitcher() {
  const [selected, setSelected] = useState("en");

  return (
    <div style={{ marginBottom: "1rem" }}>
      <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Language">
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
      {selected !== "en" && <p style={{ fontSize: "0.85em", opacity: 0.7 }}>More languages coming soon.</p>}
    </div>
  );
}
