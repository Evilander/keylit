// Choose a browse entry without removing the source files from the corpus.
const titleKey = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function selectChartVersions(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (/\(ver /i.test(row.title) || !row.contentHash) continue;
    const key = [
      (row.artist || "").toLowerCase(), titleKey(row.title), row.format || "chords",
      row.tuningId || row.tuning || "standard", Number(row.capo) || 0,
      row.contentHash,
    ].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const dropped = new Set();
  for (const versions of groups.values()) {
    const best = versions.slice().sort((a, b) =>
      (b.bodyLen || 0) - (a.bodyLen || 0) ||
      (a.source < b.source ? -1 : 1)
    )[0];
    for (const row of versions) if (row !== best) dropped.add(row);
  }
  return rows.filter((row) => !dropped.has(row));
}
