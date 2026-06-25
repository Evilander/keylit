import React, { useMemo, useState, useCallback } from "react";
import { FlaskConical, Sparkles, Play, Plus, ArrowRightLeft, Loader2, Wand2, Music2 } from "lucide-react";
import { chordSymbol, SHARP_NAMES } from "../lib/theory.js";
import { spellChord, spellPc } from "../lib/spelling.js";
import { suggestionsFor, suggestionFunction, simplify, KNOWN_STYLES } from "../lib/suggest.js";
import { scalesForChord } from "../lib/scales.js";
import { reharmonize } from "../lib/llm.js";
import { C, FUNCTION_COLOR, MONO } from "../ui/theme.js";

const STYLE_CHIPS = ["any", "pop", "indie", "jazz", "soul", "gospel", "rock", "cinematic"];

const KIND_META = {
  replace: { label: "Recolor", icon: ArrowRightLeft, hint: "swap this chord for a richer cousin" },
  insertBefore: { label: "Lead in", icon: Plus, hint: "add a chord that pulls into this one" },
  insertAfter: { label: "Carry on", icon: Plus, hint: "add a chord that flows out of this one" },
};

/**
 * Chord Lab — pick a chord, get ranked "interesting moves" you can audition and apply.
 * Pure-theory suggestions are instant + offline; "Deep mode" adds Claude's context-aware ideas.
 *
 * Props:
 *  prog        : parsed chords (current, transposed view)
 *  activeKey   : { tonic, mode }
 *  selectedIdx : currently-focused chord index
 *  onSelectIdx : (i) => void
 *  onAudition  : (chordArray) => void   — play these chords
 *  onApply     : (suggestion) => void   — apply replace/insert to the progression
 */
export default function ChordLab({ prog, activeKey, selectedIdx, onSelectIdx, onAudition, onApply }) {
  const [style, setStyle] = useState("any");
  const [boldness, setBoldness] = useState(0.5);
  const [deep, setDeep] = useState({ loading: false, error: null, byIndex: {} });

  const [labMode, setLabMode] = useState("spice"); // spice | simplify

  const target = prog[selectedIdx] || prog[0] || null;

  const local = useMemo(() => {
    if (!target) return { replace: [], insertBefore: [], insertAfter: [] };
    return suggestionsFor(target, {
      tonic: activeKey.tonic, mode: activeKey.mode,
      style, boldnessBias: boldness, maxPerKind: 5,
    });
  }, [target, activeKey.tonic, activeKey.mode, style, boldness]);

  const simpler = useMemo(() => (target ? simplify(target) : []), [target]);
  const scales = useMemo(() => (target ? scalesForChord(target) : []), [target]);

  const aiForThis = deep.byIndex[selectedIdx] || [];

  const runDeep = useCallback(async () => {
    if (!prog.length) return;
    setDeep((d) => ({ ...d, loading: true, error: null }));
    const keyName = `${SHARP_NAMES[activeKey.tonic]} ${activeKey.mode}`;
    const res = await reharmonize({ progression: prog, key: keyName, style });
    if (!res.ok) { setDeep((d) => ({ ...d, loading: false, error: res.error })); return; }
    // Bucket AI suggestions by the chord index they target, mapped to our shape.
    const byIndex = {};
    for (const s of res.data.suggestions) {
      const kind = s.action;
      const item = {
        kind, chords: s.chords, why: s.rationale,
        style: "ai", boldness: s.boldness, tags: [s.function === "color" ? "color" : "ai"],
        func: s.function, source: "ai",
      };
      (byIndex[s.targetIndex] ||= []).push(item);
    }
    setDeep({ loading: false, error: null, byIndex });
  }, [prog, activeKey.tonic, activeKey.mode, style]);

  if (!prog.length) return null;

  return (
    <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "16px 18px" }}>
      {/* header */}
      <div className="flex items-center" style={{ gap: 10, flexWrap: "wrap" }}>
        <FlaskConical size={17} color={C.tone} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>Chord Lab</span>
        {/* spice ⟷ simplify */}
        <div style={{ display: "inline-flex", gap: 2, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: 3 }}>
          {[["spice", "Spice it up"], ["simplify", "Make it easier"]].map(([m, label]) => (
            <button key={m} onClick={() => setLabMode(m)}
              style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 7, cursor: "pointer", border: "none",
                background: labMode === m ? (m === "simplify" ? C.tone : C.root) : "transparent",
                color: labMode === m ? "#1c1305" : C.muted }}>
              {label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: C.faint }}>
          {labMode === "simplify" ? "easier ways to play a hard chord" : "interesting moves — audition before you commit"}
        </span>
        {labMode === "spice" && (
          <button onClick={runDeep} disabled={deep.loading}
            title="Ask Claude for context-aware reharmonizations of the whole progression"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, background: deep.loading ? C.panel2 : "transparent", color: C.ai, border: `1px solid ${C.ai}66`, borderRadius: 9, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: deep.loading ? "default" : "pointer" }}>
            {deep.loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Deep mode
          </button>
        )}
      </div>

      {/* chord picker */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 12, paddingBottom: 4 }}>
        {prog.map((ch, i) => {
          const active = i === selectedIdx;
          return (
            <button key={i} onClick={() => onSelectIdx(i)} data-lab-active={active}
              style={{ flex: "0 0 auto", fontFamily: MONO, fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                background: active ? C.tone : C.panel2, color: active ? "#06201d" : C.ink,
                border: `1px solid ${active ? C.tone : C.line}` }}>
              {spellChord(ch, activeKey)}
            </button>
          );
        })}
      </div>

      {/* controls (spice mode only) */}
      {labMode === "spice" && (
        <div className="flex items-center" style={{ gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          <div className="flex items-center" style={{ gap: 6, flexWrap: "wrap" }}>
            {STYLE_CHIPS.map((s) => (
              <button key={s} onClick={() => setStyle(s)}
                style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 999, cursor: "pointer", textTransform: "capitalize",
                  background: style === s ? C.root : "transparent", color: style === s ? "#1c1305" : C.muted,
                  border: `1px solid ${style === s ? C.root : C.line}`, fontWeight: style === s ? 700 : 500 }}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center" style={{ gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 11, color: C.faint }}>safe</span>
            <input type="range" min={0} max={1} step={0.05} value={boldness}
              onChange={(e) => setBoldness(Number(e.target.value))}
              style={{ width: 110, accentColor: C.ai }} aria-label="boldness" />
            <span style={{ fontSize: 11, color: C.faint }}>bold</span>
          </div>
        </div>
      )}

      {/* melody scales — what to solo / write over this chord */}
      {scales.length > 0 && (
        <div className="flex items-center" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Music2 size={13} color={C.faint} />
          <span style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em" }}>melody over {spellChord(target, activeKey)}</span>
          {scales.slice(0, 3).map((sc, i) => (
            <span key={i} title={sc.note}
              style={{ fontSize: 11.5, fontFamily: MONO, color: i === 0 ? C.tone : C.muted, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 7, padding: "3px 9px" }}>
              {sc.name}
            </span>
          ))}
        </div>
      )}

      {deep.error && <div style={{ marginTop: 10, fontSize: 12, color: C.bass }}>{deep.error}</div>}

      {labMode === "simplify" ? (
        /* simplify list */
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 8 }}>
            easier ways to play <b style={{ color: C.ink }}>{spellChord(target, activeKey)}</b> — loses some color, keeps the song
          </div>
          {simpler.length === 0 && <div style={{ fontSize: 11.5, color: C.faint, fontStyle: "italic" }}>this chord is already about as simple as it gets</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 8 }}>
            {simpler.map((s, i) => (
              <SuggestionCard key={`simpler-${i}`} s={s} keyCtx={activeKey} onAudition={onAudition} onApply={onApply} />
            ))}
          </div>
        </div>
      ) : (
        /* three buckets */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginTop: 14 }}>
          {["replace", "insertBefore", "insertAfter"].map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const ai = aiForThis.filter((s) => s.kind === kind);
            const list = [...ai, ...local[kind]];
            return (
              <div key={kind}>
                <div className="flex items-center" style={{ gap: 7, marginBottom: 8 }}>
                  <Icon size={14} color={C.faint} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 8 }}>{meta.hint}</div>
                {list.length === 0 && <div style={{ fontSize: 11.5, color: C.faint, fontStyle: "italic" }}>nothing notable here</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {list.map((s, i) => (
                    <SuggestionCard key={`${kind}-${i}`} s={s} keyCtx={activeKey} onAudition={onAudition} onApply={onApply} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ s, keyCtx, onAudition, onApply }) {
  const func = s.func || suggestionFunction(s);
  const accent = FUNCTION_COLOR[func] || C.tone;
  const isAi = s.source === "ai";
  const symbols = s.chords.map((c) => spellChord(c, keyCtx)).join("  ");
  return (
    <div
      onMouseEnter={() => onAudition(s.chords)}
      style={{ background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: "9px 11px", cursor: "default" }}>
      <div className="flex items-center" style={{ gap: 8, justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 14, color: C.ink }}>{symbols}</span>
        <div className="flex items-center" style={{ gap: 4 }}>
          {isAi && <Wand2 size={12} color={C.ai} title="Claude suggestion" />}
          <button onClick={() => onAudition(s.chords)} title="Hear it"
            style={iconBtn}><Play size={13} /></button>
          <button onClick={() => onApply(s)} title="Apply"
            style={{ ...iconBtn, color: accent, borderColor: `${accent}66` }}><Plus size={14} /></button>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, lineHeight: 1.4 }}>{s.why}</div>
    </div>
  );
}

const iconBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 24, height: 24, borderRadius: 6, background: "transparent",
  color: "#ece6dd", border: "1px solid #3a322a", cursor: "pointer",
};
