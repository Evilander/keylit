import { useMemo, useState } from "react";
import { Copy, GripVertical, Play, Plus, Trash2, Undo2 } from "lucide-react";
import { nashville, parseChord } from "../lib/theory.js";
import { spellChord } from "../lib/spelling.js";
import { deriveProgression } from "../lib/composition.js";
import ComposerPicker from "./ComposerPicker.jsx";

const SECTION_NAMES = ["Verse", "Chorus", "Pre-Chorus", "Bridge", "Intro", "Outro"];

function shownChord(slot, draft, spelling) {
  const chord = parseChord(slot.symbol);
  if (!chord) return { label: slot.symbol, conventional: slot.symbol, degree: "?" };
  return {
    chord,
    label: spellChord(chord, { ...draft.key, spelling }),
    conventional: spellChord(chord, draft.key),
    degree: nashville(chord, draft.key.tonic),
  };
}

export default function ProgressionComposer({
  draft,
  selection,
  spelling = "sharps",
  documentId,
  revision = 0,
  canUndo = false,
  onSelect,
  onEdit,
  onUndo,
  onAudition,
  requestDeep,
}) {
  const [addingSection, setAddingSection] = useState(false);
  const [customSection, setCustomSection] = useState("");
  const sectionId = selection?.sectionId || draft.sections[0]?.id;
  const section = draft.sections.find((item) => item.id === sectionId) || draft.sections[0];
  const { progression } = useMemo(() => deriveProgression(draft), [draft]);
  const sectionProgression = useMemo(() => deriveProgression({ sections: [section] }).progression, [section]);

  const selectGap = (gapIndex) => onSelect?.({ sectionId: section.id, chordId: null, gapIndex });
  const selectChord = (chordId) => onSelect?.({ sectionId: section.id, chordId, gapIndex: null });
  const moveChord = (slot, index, direction) => {
    const toIndex = index + direction;
    if (toIndex < 0 || toIndex >= section.chords.length) return;
    onEdit?.({ type: "chord/move", sectionId: section.id, chordId: slot.id, toIndex });
  };

  const addSection = (name) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    onEdit?.({ type: "section/add", name: clean });
    setAddingSection(false);
    setCustomSection("");
  };

  return (
    <section className="write-composer" aria-label="Song progression composer">
      <div className="composer-head">
        <div>
          <div className="kl-eyebrow">Song map</div>
          <h2>Build the movement</h2>
        </div>
        <div className="composer-audition">
          <button className="bench-btn" disabled={!sectionProgression.length} onClick={() => onAudition?.(sectionProgression)}><Play size={13} /> Section</button>
          <button className="bench-btn" disabled={!progression.length} onClick={() => onAudition?.(progression)}><Play size={13} /> Whole song</button>
          {canUndo && <button className="bench-btn" onClick={onUndo} aria-label="Undo last edit"><Undo2 size={13} /> Undo</button>}
        </div>
      </div>

      <div className="composer-section-tabs" role="tablist" aria-label="Song sections">
        {draft.sections.map((item) => (
          <button key={item.id} role="tab" aria-selected={item.id === section.id} onClick={() => onSelect?.({ sectionId: item.id, chordId: item.chords[0]?.id || null, gapIndex: item.chords.length ? null : 0 })}>
            {item.name}
          </button>
        ))}
        <button onClick={() => setAddingSection((value) => !value)}><Plus size={12} /> Add section</button>
      </div>

      {addingSection && (
        <div className="composer-section-add">
          {SECTION_NAMES.map((name) => <button key={name} onClick={() => addSection(name)}>{name}</button>)}
          <label>
            <span>Custom section name</span>
            <input value={customSection} onChange={(event) => setCustomSection(event.target.value)} />
          </label>
          <button disabled={!customSection.trim()} onClick={() => addSection(customSection)}>Add {customSection.trim() || "custom section"}</button>
        </div>
      )}

      <div className="composer-section-tools">
        <input aria-label="Section name" value={section.name} onChange={(event) => onEdit?.({ type: "section/rename", sectionId: section.id, name: event.target.value })} />
        <button className="bench-btn" onClick={() => onEdit?.({ type: "section/duplicate", sectionId: section.id })}><Copy size={13} /> Duplicate section</button>
        <button className="bench-btn" disabled={draft.sections.length === 1} onClick={() => onEdit?.({ type: "section/delete", sectionId: section.id })}><Trash2 size={13} /> Delete section</button>
      </div>

      <div className="composer-strip" role="list" aria-label={`${section.name} chord sequence`}>
        <button className={`composer-gap ${selection?.gapIndex === 0 ? "selected" : ""}`} onClick={() => selectGap(0)} aria-label="Add chord at start"><Plus size={13} /></button>
        {section.chords.map((slot, index) => {
          const shown = shownChord(slot, draft, spelling);
          const active = selection?.chordId === slot.id;
          const title = shown.label !== shown.conventional ? `piano says ${shown.conventional}` : undefined;
          return (
            <div key={slot.id} className="composer-slot" role="listitem">
              <button
                className={`composer-chord ${active ? "selected" : ""}`}
                aria-label={`${shown.label} · chord ${index + 1}`}
                title={title}
                onClick={() => selectChord(slot.id)}
                onDoubleClick={() => onAudition?.([shown.chord])}
                onKeyDown={(event) => {
                  if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); moveChord(slot, index, 1); }
                  if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); moveChord(slot, index, -1); }
                  if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); onEdit?.({ type: "chord/delete", sectionId: section.id, chordId: slot.id }); }
                  if (event.key === "Enter") onAudition?.([shown.chord]);
                }}
              >
                <GripVertical size={12} aria-hidden="true" />
                <strong>{shown.label}</strong>
                <span>{shown.degree}</span>
              </button>
              <div className="composer-slot-actions">
                <button aria-label={`Move ${shown.label} left`} disabled={index === 0} onClick={() => moveChord(slot, index, -1)}>←</button>
                <button aria-label={`Duplicate ${shown.label}`} onClick={() => onEdit?.({ type: "chord/duplicate", sectionId: section.id, chordId: slot.id })}>＋</button>
                <button aria-label={`Delete ${shown.label}`} onClick={() => onEdit?.({ type: "chord/delete", sectionId: section.id, chordId: slot.id })}>×</button>
                <button aria-label={`Move ${shown.label} right`} disabled={index === section.chords.length - 1} onClick={() => moveChord(slot, index, 1)}>→</button>
              </div>
              <button className={`composer-gap ${selection?.gapIndex === index + 1 ? "selected" : ""}`} onClick={() => selectGap(index + 1)} aria-label={`Add chord after ${shown.label}`}><Plus size={13} /></button>
            </div>
          );
        })}
      </div>

      <ComposerPicker
        draft={draft}
        selection={selection || { sectionId: section.id, gapIndex: section.chords.length }}
        spelling={spelling}
        documentId={documentId || draft.id}
        revision={revision}
        onEdit={onEdit}
        onAudition={onAudition}
        requestDeep={requestDeep}
      />
    </section>
  );
}
