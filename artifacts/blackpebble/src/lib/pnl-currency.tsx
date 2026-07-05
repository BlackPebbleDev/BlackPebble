import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type PnlMode = "SOL" | "USD";

const STORAGE_KEY = "bp:pnl-mode";

interface PnlCurrencyContextValue {
  mode: PnlMode;
  toggle: () => void;
  setMode: (mode: PnlMode) => void;
}

const PnlCurrencyContext = createContext<PnlCurrencyContextValue | null>(null);

function readInitialMode(): PnlMode {
  if (typeof window === "undefined") return "USD";
  try {
    // USD is the default display currency. Only an explicit, previously-chosen
    // "SOL" survives; anything else (including no stored value) starts as USD.
    return window.sessionStorage.getItem(STORAGE_KEY) === "SOL" ? "SOL" : "USD";
  } catch {
    return "USD";
  }
}

function persist(mode: PnlMode) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* sessionStorage unavailable - keep in-memory only */
  }
}

/**
 * Holds the chosen P&L display currency for the whole app. SOL by default,
 * persisted per browser session so a trader's choice survives navigation.
 */
export function PnlCurrencyProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PnlMode>(readInitialMode);

  const setMode = useCallback((next: PnlMode) => {
    setModeState(next);
    persist(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: PnlMode = prev === "SOL" ? "USD" : "SOL";
      persist(next);
      return next;
    });
  }, []);

  return (
    <PnlCurrencyContext.Provider value={{ mode, toggle, setMode }}>
      {children}
    </PnlCurrencyContext.Provider>
  );
}

export function usePnlCurrency(): PnlCurrencyContextValue {
  const ctx = useContext(PnlCurrencyContext);
  if (!ctx) {
    throw new Error("usePnlCurrency must be used within a PnlCurrencyProvider");
  }
  return ctx;
}
