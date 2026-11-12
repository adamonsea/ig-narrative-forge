import { useCallback, useEffect, useState } from "react";
import { ukToday, type MockState } from "./eventsDeskRules";
import { seedState } from "./eventsDeskSeed";

/** Mock-only state, kept in this browser so the phone preview (a framed copy of the page) stays in step with the Desk. */
const KEY = "curatr_mock_events_desk_v1";

function load(): MockState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as MockState;
      if (s.today === ukToday()) return s;
    }
  } catch { /* fall through to fresh dummy data */ }
  return seedState();
}

export function useMockState() {
  const [state, setState] = useState<MockState>(load);

  const update = useCallback((fn: (prev: MockState) => MockState) => {
    setState((prev) => {
      const next = fn(prev);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* preview only */ }
      return next;
    });
  }, []);

  const reset = useCallback(() => update(() => seedState()), [update]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setState(e.newValue ? JSON.parse(e.newValue) : seedState()); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { state, update, reset };
}
