// TutorPanel.jsx — the tutor's booth: a right-hand drawer available from any
// room. BYO key (Anthropic / OpenAI / Google / xAI) or a local Ollama; the
// key lives in THIS browser's localStorage and requests go straight to the
// provider — no Keylit server in the path. The panel portals to <body>
// because .kl-section's entry transform hijacks position:fixed descendants
// (hard-won house knowledge, 2026-07).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Settings2, Send, Square, GraduationCap } from "lucide-react";
import { PROVIDERS, buildSystemPrompt, buildContext, sendChat, loadTutorSettings, saveTutorSettings } from "../lib/tutor.js";
import { C, MONO, DISPLAY } from "../ui/theme.js";

const STARTERS = [
  "Why does this progression sound good?",
  "I like this — where do I go next?",
  "Make this easier to play",
  "What's the current chord's job in the key?",
];

export default function TutorPanel({ open, onClose, stand }) {
  const [settings, setSettings] = useState(loadTutorSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [msgs, setMsgs] = useState([]); // {role, content}
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const reduced = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);

  const provider = PROVIDERS[settings.provider];
  const ready = provider && (provider.keyless || !!settings.keys[settings.provider]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const persist = (next) => { setSettings(next); saveTutorSettings(next); };

  const ask = async (text) => {
    const q = (text || draft).trim();
    if (!q || streaming) return;
    setDraft("");
    setError(null);
    const history = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ctx = buildContext(stand || {});
    // only the LIVE turn carries the stand — history stays lean
    const wire = history.map((m, i) =>
      i === history.length - 1 && ctx ? { ...m, content: `${ctx}\n\n${m.content}` } : m
    );
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await sendChat({
        provider: settings.provider,
        apiKey: settings.keys[settings.provider],
        model: settings.models[settings.provider] || provider.defaultModel,
        baseUrl: settings.ollamaUrl,
        system: buildSystemPrompt(),
        messages: wire,
        signal: ac.signal,
        onToken: (t) => setMsgs((m) => {
          const next = m.slice();
          next[next.length - 1] = { role: "assistant", content: next[next.length - 1].content + t };
          return next;
        }),
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setError(String(e.message || e));
        setMsgs((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  if (!open) return null;

  return createPortal(
    <div role="dialog" aria-label="the tutor" style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(430px, 94vw)", zIndex: 60,
      background: C.panel, borderLeft: `1px solid ${C.lineStrong}`,
      boxShadow: "-12px 0 40px rgba(20,16,10,0.18)",
      display: "flex", flexDirection: "column",
      animation: reduced ? "none" : "kl-tutor-in 260ms cubic-bezier(.22,1,.36,1) both",
    }}>
      <style>{`@keyframes kl-tutor-in { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>

      {/* ---- header ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.line}` }}>
        <GraduationCap size={17} style={{ color: C.rootText }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 19, color: C.ink }}>The tutor</span>
        <span className="kl-meta" style={{ color: C.faint, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {provider?.name}{ready ? ` · ${settings.models[settings.provider] || provider?.defaultModel}` : ""}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
          <button onClick={() => setShowSettings((v) => !v)} aria-label="tutor settings" title="provider & key"
            style={{ ...iconBtn, color: showSettings ? C.rootText : C.muted }}><Settings2 size={16} /></button>
          <button onClick={onClose} aria-label="close the tutor" style={iconBtn}><X size={16} /></button>
        </span>
      </div>

      {/* ---- settings ---- */}
      {(showSettings || !ready) && (
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, background: C.panel2 }}>
          {!ready && (
            <p style={{ fontSize: 13, color: C.ink, margin: "0 0 10px", lineHeight: 1.55 }}>
              Bring a key and the tutor wakes up — or run <b>Ollama</b> locally and skip keys entirely.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label className="kl-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              provider
              <select value={settings.provider} onChange={(e) => persist({ ...settings, provider: e.target.value })}
                style={selStyle} aria-label="AI provider">
                {Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
              </select>
            </label>
            {!provider?.keyless ? (
              <label className="kl-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                key
                <input type="password" value={settings.keys[settings.provider] || ""} placeholder={provider?.keyHint}
                  onChange={(e) => persist({ ...settings, keys: { ...settings.keys, [settings.provider]: e.target.value } })}
                  aria-label="API key" style={{ ...selStyle, flex: 1, cursor: "text", fontFamily: MONO }} />
              </label>
            ) : (
              <label className="kl-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                url
                <input value={settings.ollamaUrl} onChange={(e) => persist({ ...settings, ollamaUrl: e.target.value })}
                  aria-label="Ollama URL" style={{ ...selStyle, flex: 1, cursor: "text", fontFamily: MONO }} />
              </label>
            )}
            <label className="kl-meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              model
              <input value={settings.models[settings.provider] || ""} placeholder={provider?.defaultModel}
                onChange={(e) => persist({ ...settings, models: { ...settings.models, [settings.provider]: e.target.value } })}
                aria-label="model name" style={{ ...selStyle, flex: 1, cursor: "text", fontFamily: MONO }} />
            </label>
          </div>
          <p style={{ fontSize: 11, color: C.faint, margin: "10px 0 0", lineHeight: 1.5 }}>
            Your key lives only in this browser's storage and travels only to {provider?.name}, directly —
            no Keylit server in the path. Get a key: <a href={provider?.keyUrl} target="_blank" rel="noreferrer" style={{ color: C.toneText }}>{provider?.keyUrl?.replace("https://", "")}</a>
            {provider?.keyless ? " · start it with OLLAMA_ORIGINS=* so the browser may call it" : ""}
          </p>
        </div>
      )}

      {/* ---- the conversation ---- */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {msgs.length === 0 && ready && (
          <div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: "4px 0 14px" }}>
              Ask like you'd ask across the kitchen table. The tutor can see what's on your stand —
              the song, the key, the capo, the chord you're sitting on.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
              {STARTERS.map((s) => (
                <button key={s} className="chip" style={{ fontSize: 12.5, padding: "6px 12px" }} onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div className="kl-eyebrow" style={{ color: m.role === "user" ? C.faint : C.rootText, marginBottom: 4 }}>
              {m.role === "user" ? "you" : "tutor"}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.62, color: C.ink, whiteSpace: "pre-wrap" }}>
              {m.content}
              {streaming && i === msgs.length - 1 && <span className="kl-pulse" style={{ color: C.rootText }}> ▍</span>}
            </div>
          </div>
        ))}
        {error && <div style={{ fontSize: 12.5, color: C.bassText, lineHeight: 1.5, padding: "8px 10px", border: `1px solid ${C.bassText}44`, borderRadius: 8 }}>{error}</div>}
      </div>

      {/* ---- the ask ---- */}
      {ready && (
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
            placeholder={'e.g. "capo 2, I like Am → C → Em — why does that work, and where next?"'}
            aria-label="ask the tutor"
            style={{ flex: 1, resize: "none", background: C.panel2, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 11px", fontSize: 13, lineHeight: 1.5, fontFamily: "var(--kl-sans)", outline: "none" }} />
          {streaming ? (
            <button className="bench-btn" onClick={stop} aria-label="stop the reply" style={{ padding: "9px 12px" }}><Square size={14} /></button>
          ) : (
            <button className="bench-btn primary" onClick={() => ask()} disabled={!draft.trim()} aria-label="send" style={{ padding: "9px 12px" }}><Send size={14} /></button>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

const iconBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 8, background: "transparent",
  border: 0, color: "var(--kl-muted)", cursor: "pointer",
};
const selStyle = {
  background: "var(--kl-raised)", color: "var(--kl-ink)", border: "1px solid var(--kl-hair)",
  borderRadius: 8, padding: "6px 9px", fontSize: 12.5, cursor: "pointer",
};
