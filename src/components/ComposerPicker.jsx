import { useMemo, useRef, useState } from "react";
import { parseChord } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { mergeDeepIdeas, paletteForKey, suggestForIntent } from "../lib/composerSuggestions.js";
import { suggestionToCompositionOp } from "../lib/composition.js";

const INTENTS = [
  ["next", "What comes next?"],
  ["lead-in", "Lead into this chord"],
  ["between", "Put something between these"],
  ["turnaround", "Turn this back to the top"],
  ["contrast", "Contrast this section"],
];

const TABS = ["In key", "Color", "Any chord", "Ideas"];

function displaySymbol(symbol, draft, spelling) {
  const chord = parseChord(symbol);
  return chord ? spellChord(chord, { ...draft.key, spelling }) : symbol;
}

export default function ComposerPicker({
  draft,
  selection,
  spelling = "sharps",
  documentId,
  revision = 0,
  onEdit,
  onSelect,
  onAudition,
  requestDeep,
}) {
  const [tab, setTab] = useState("In key");
  const [symbol, setSymbol] = useState("");
  const [intent, setIntent] = useState("next");
  const [deep, setDeep] = useState({ loading: false, error: "", ideas: [] });
  const sectionId = selection?.sectionId || draft.sections[0]?.id;
  const selectedSection = draft.sections.find((section) => section.id === sectionId) || draft.sections[0];
  const targetId = selection?.chordId || null;
  const gapIndex = Number.isInteger(selection?.gapIndex) ? selection.gapIndex : undefined;
  const requestFingerprint = JSON.stringify({ documentId: documentId || draft.id, revision, selection: selection || null });
  const latestRequestRef = useRef(requestFingerprint);
  latestRequestRef.current = requestFingerprint;
  const parsed = parseChord(symbol.trim());

  const ideas = useMemo(() => suggestForIntent({
    intent,
    draft,
    sectionId,
    chordId: targetId,
    gapIndex,
    style: "any",
    boldness: tab === "Color" ? 0.9 : 0.55,
  }), [draft, sectionId, targetId, gapIndex, intent, tab]);

  const palette = useMemo(() => paletteForKey(draft.key, { sevenths: false }), [draft.key]);
  const colorChoices = useMemo(() => {
    const seen = new Set();
    return ideas.flatMap((idea) => idea.symbols || []).filter((value) => {
      const chord = parseChord(value);
      const key = chord ? `${chord.rootSemitone}:${chord.quality}:${chord.bassSemitone ?? ""}` : value;
      if (!chord || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }, [ideas]);

  const addSymbol = (value) => {
    const clean = String(value || "").trim();
    if (!parseChord(clean) || !sectionId) return;
    const section = selectedSection;
    const index = Number.isInteger(gapIndex)
      ? gapIndex
      : targetId
        ? Math.max(0, section.chords.findIndex((chord) => chord.id === targetId) + 1)
        : section.chords.length;
    onEdit?.({ type: "chord/insert", sectionId, index, symbol: clean });
    onSelect?.({ sectionId, chordId: null, gapIndex: index + 1 });
  };

  const applyIdea = (idea) => {
    const operation = suggestionToCompositionOp({
      suggestion: idea,
      sectionId,
      targetSlotId: targetId,
      gapIndex,
      transpose: 0,
    });
    if (operation) {
      onEdit?.(operation);
      if (Number.isInteger(gapIndex)) {
        onSelect?.({ sectionId, chordId: null, gapIndex: gapIndex + (idea.symbols?.length || 0) });
      }
    }
  };

  const loadDeep = async () => {
    if (!requestDeep || deep.loading) return;
    const captured = requestFingerprint;
    setDeep({ loading: true, error: "", ideas: [] });
    const result = await requestDeep({
      progression: selectedSection?.chords.map((slot) => slot.symbol) || [],
      key: draft.key,
      intent,
      context: { sectionId, chordId: targetId, gapIndex },
    });
    if (captured !== latestRequestRef.current) return;
    if (!result?.ok) {
      setDeep({ loading: false, error: result?.error || "Deep ideas unavailable — offline ideas still work.", ideas: [] });
      return;
    }
    const verified = mergeDeepIdeas([], result.data?.ideas, {
      draft,
      sectionId,
      chordId: targetId,
      gapIndex,
      intent,
    });
    setDeep({ loading: false, error: "", ideas: verified.slice(0, 3) });
  };

  return (
    <div className="composer-picker">
      <div className="kl-seg composer-picker-tabs" role="tablist" aria-label="Chord picker">
        {TABS.map((name) => (
          <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>

      {tab === "In key" && (
        <div className="composer-palette" aria-label="In-key chords">
          {palette.map((choice) => (
            <button key={choice.symbol} className="composer-choice" onClick={() => addSymbol(choice.symbol)} onMouseEnter={() => onAudition?.([choice.chord])}>
              <strong>{displaySymbol(choice.symbol, draft, spelling)}</strong>
              <span>{choice.degree}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "Color" && (
        <div className="composer-palette" aria-label="Color chords">
          {colorChoices.length ? colorChoices.map((choice) => (
            <button key={choice} className="composer-choice" onClick={() => addSymbol(choice)} onMouseEnter={() => onAudition?.([parseChord(choice)])}>
              <strong>{displaySymbol(choice, draft, spelling)}</strong>
              <span>color</span>
            </button>
          )) : <p className="composer-empty">Select a chord or gap to find colors that fit this movement.</p>}
        </div>
      )}

      {tab === "Any chord" && (
        <div className="composer-any">
          <label htmlFor="composer-symbol">Chord symbol</label>
          <div>
            <input id="composer-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="C#m9/G#" autoComplete="off" />
            <button className="bench-btn primary" disabled={!parsed} onClick={() => { addSymbol(symbol); setSymbol(""); }}>
              Add {symbol.trim() || "chord"}
            </button>
          </div>
          {symbol.trim() && !parsed && <span className="composer-error">chord not recognized</span>}
          <p>Major, minor, 7ths, extensions, altered chords, suspended chords, diminished chords, and slash basses are accepted.</p>
        </div>
      )}

      {tab === "Ideas" && (
        <div className="composer-ideas">
          <div className="composer-intents">
            {INTENTS.map(([value, label]) => (
              <button key={value} className={intent === value ? "active" : ""} onClick={() => setIntent(value)}>{label}</button>
            ))}
            {requestDeep && <button onClick={loadDeep} disabled={deep.loading}>{deep.loading ? "Finding…" : "Deep ideas"}</button>}
          </div>
          {deep.error && <p className="composer-error">{deep.error}</p>}
          <div className="composer-idea-grid">
            {[...ideas, ...deep.ideas].map((idea) => (
              <article key={idea.id || `${idea.kind}:${idea.symbols.join("-")}`} className="composer-idea">
                <button className="composer-idea-main" onClick={() => onAudition?.(idea.chords || idea.symbols.map(parseChord))}>
                  <strong>{idea.symbols.map((item) => displaySymbol(item, draft, spelling)).join(" → ")}</strong>
                  <span>{idea.why || idea.rationale}</span>
                </button>
                <button className="bench-btn" onClick={() => applyIdea(idea)}>Use this</button>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
