// useAudioEngine.js — one engine per app, stable identity across renders.
// The hook owns lifecycle only; the engine itself lives in engine.js so it
// can be reasoned about (and eventually driven) without React.
import { useEffect, useRef, useState } from "react";
import { createEngine } from "./engine.js";

export function useAudioEngine() {
  const [state, setState] = useState({ engine: "off", loading: false });
  const ref = useRef(null);
  if (!ref.current) ref.current = createEngine({ onState: setState });
  // Unmount disposes; a later init() revives the same engine object
  // (StrictMode's mount→cleanup→mount cycle lands on a working graph).
  useEffect(() => { const e = ref.current; return () => e.dispose(); }, []);
  return { engine: ref.current, engineState: state };
}
