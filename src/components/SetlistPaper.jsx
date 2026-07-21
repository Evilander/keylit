import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, GripVertical, Play, Plus, Trash2, X } from "lucide-react";
import { C, MONO } from "../ui/theme.js";

const clear = () => {};

export default function SetlistPaper({
  setlist,
  onOpenSong = clear,
  onPerformSet = clear,
  onRunFrom = clear,
  onMarkPracticed = clear,
  searchResults = [],
  onSearch = clear,
  onAppendSong = clear,
  onRename = clear,
  onDeleteSetlist = clear,
  onSetNotes = clear,
  onSetEntryNote = clear,
  onMove = clear,
  onRemove = clear,
  onRestore = clear,
}) {
  const [name, setName] = useState(setlist?.name || "");
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setName(setlist?.name || ""); setUndo(null); }, [setlist?.id, setlist?.name]);
  if (!setlist) return null;
  const entries = setlist.entries || [];
  const mutate = (work) => { setUndo(null); work(); };
  const move = (entryId, toIndex) => {
    if (toIndex >= 0 && toIndex < entries.length) mutate(() => onMove(entryId, toIndex));
  };
  const annotations = (entry) => [
    entry.key ? `key ${entry.key}` : null,
    entry.capo != null && entry.capo !== "" ? `capo ${entry.capo}` : null,
    entry.tuning && entry.tuning !== "standard" ? entry.tuning : null,
  ].filter(Boolean);

  return (
    <section className="setlist-paper" aria-label={`${setlist.name} setlist`}>
      <div className="setlist-paper__head">
        <div>
          <div className="kl-eyebrow">Setlist</div>
          <input className="setlist-paper__title" aria-label="setlist name" value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => { const next = name.trim() || setlist.name; setName(next); if (next !== setlist.name) mutate(() => onRename(next)); }} />
        </div>
        <div className="setlist-paper__set-controls">
          <button className="bench-btn primary" onClick={() => onPerformSet(setlist)}><Play size={14} /> Perform set</button>
          <button className="bench-btn" onClick={() => window.print?.()}>print</button>
          <button className="setlist-paper__quiet" aria-label={`delete ${setlist.name}`} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></button>
        </div>
      </div>

      <textarea className="setlist-paper__notes" value={setlist.notes || ""} aria-label="setlist notes"
        placeholder="The set: tempos, introductions, who sings what…" spellCheck={false}
        onChange={(event) => mutate(() => onSetNotes(event.target.value))} />

      <ol className="setlist-paper__entries">
        {entries.map((entry, index) => (
          <li key={entry.entryId} className="setlist-paper__row" data-testid={`setlist-entry-${entry.entryId}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const dragged = event.dataTransfer?.getData("application/x-keylit-setlist-entry");
              if (dragged && dragged !== entry.entryId) move(dragged, index);
            }}
            onKeyDown={(event) => {
              if (!event.altKey) return;
              if (event.key === "ArrowUp") { event.preventDefault(); move(entry.entryId, index - 1); }
              if (event.key === "ArrowDown") { event.preventDefault(); move(entry.entryId, index + 1); }
            }}>
            <div className="setlist-paper__number">{index + 1}</div>
            <div className="setlist-paper__entry-main">
              <div className="setlist-paper__entry-line">
                <button className="setlist-paper__song" onClick={() => onOpenSong(entry, { name: setlist.name, rows: entries, idx: index })}
                  aria-label={`open ${entry.title} in Song`}>{entry.title}</button>
                {entry.artist && <span className="setlist-paper__artist">· {entry.artist}</span>}
                {annotations(entry).map((label) => <span key={label} className="setlist-paper__annotation">{label}</span>)}
              </div>
              <label className="setlist-paper__note-label">
                <span className="sr-only">note for setlist item {index + 1}, {entry.title}</span>
                <input className="setlist-paper__note" value={entry.note || ""} placeholder="note to self"
                  onChange={(event) => mutate(() => onSetEntryNote(entry.entryId, event.target.value))} />
              </label>
            </div>
            <div className="setlist-paper__controls" aria-label={`controls for ${entry.title}`}>
              <button className="setlist-paper__quiet" draggable aria-label={`drag setlist item ${index + 1}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-keylit-setlist-entry", entry.entryId);
                }}><GripVertical size={15} /></button>
              <button className="setlist-paper__quiet" aria-label="move up" disabled={index === 0} onClick={() => move(entry.entryId, index - 1)}><ChevronUp size={15} /></button>
              <button className="setlist-paper__quiet" aria-label="move down" disabled={index === entries.length - 1} onClick={() => move(entry.entryId, index + 1)}><ChevronDown size={15} /></button>
              <button className="setlist-paper__quiet" aria-label="run from here" onClick={() => onRunFrom(setlist, entry.entryId)}><Play size={14} /></button>
              <button className="setlist-paper__quiet" aria-label="mark practiced" onClick={() => mutate(() => onMarkPracticed(entry))}><Check size={15} /></button>
              <button className="setlist-paper__quiet" aria-label="remove" onClick={() => {
                const removed = onRemove(entry.entryId);
                if (removed?.entry) setUndo(removed);
              }}><X size={15} /></button>
            </div>
          </li>
        ))}
      </ol>

      {undo && (
        <div className="setlist-paper__undo" role="status">
          Removed {undo.entry.title}.
          <button className="bench-btn" onClick={() => { onRestore(undo.entry, undo.index); setUndo(null); }} aria-label="undo remove">Undo remove</button>
        </div>
      )}

      <div className="setlist-paper__append">
        <label className="setlist-paper__append-line">
          <Plus size={15} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); onSearch(event.target.value); }}
            placeholder="search library to append…" aria-label="search library to append" />
        </label>
        {searchResults.length > 0 && (
          <div className="setlist-paper__results">
            {searchResults.map((song) => (
              <button key={`${song.source}/${song.id}`} onClick={() => mutate(() => { onAppendSong(song); setQuery(""); onSearch(""); })}
                aria-label={`append ${song.title}`}>
                <Plus size={13} /> <span>{song.title}</span>{song.artist && <small>· {song.artist}</small>}
              </button>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="setlist-paper__dialog" role="alertdialog" aria-modal="true" aria-label={`delete ${setlist.name}`}>
          <p>Delete <strong>{setlist.name}</strong>? This removes the setlist, not its songs.</p>
          <div>
            <button className="bench-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="bench-btn primary" onClick={() => { onDeleteSetlist(setlist.id); setConfirmDelete(false); }}>Confirm delete</button>
          </div>
        </div>
      )}

      <section className="kl-printonly" aria-label={`${setlist.name} printable setlist`}>
        <h1>{setlist.name}</h1>
        {setlist.notes && <p>{setlist.notes}</p>}
        <ol>
          {entries.map((entry) => (
            <li key={`print-${entry.entryId}`}>
              <strong>{entry.title}</strong>{entry.artist ? ` · ${entry.artist}` : ""}
              {annotations(entry).length > 0 && <small> — {annotations(entry).join(" · ")}</small>}
              {entry.note && <em>{entry.note}</em>}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
