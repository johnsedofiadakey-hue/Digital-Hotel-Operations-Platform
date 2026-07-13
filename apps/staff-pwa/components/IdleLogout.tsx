"use client";

import { useEffect, useRef } from "react";

// Idle auto-logout (§5.1) — default 5 min. "Configurable per station" is not
// implemented (no per-station settings exist yet); this is the flat default
// for every tablet.
const IDLE_LOGOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

export function IdleLogout() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function logoutAndRedirect() {
      // Regular navigation, not fetch — a normal browser-form POST is the
      // simplest way to hit a Route Handler and follow its redirect in one
      // step, no client-side routing logic to keep in sync with /pin.
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/logout";
      document.body.appendChild(form);
      form.submit();
    }

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(logoutAndRedirect, IDLE_LOGOUT_MS);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, []);

  return null;
}
