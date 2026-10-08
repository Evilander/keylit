// Release track lists for the requested private-corpus album imports.
// Hidden tracks are acquired separately and never inflate main-track coverage.
export const REQUESTED_ALBUMS = [
  {
    artist: "Coldplay", album: "Parachutes", albumOrder: 1, albumYear: 2000,
    sourceUrl: "https://www.coldplay.com/release/parachutes/",
    tracks: ["Don't Panic", "Shiver", "Spies", "Sparks", "Yellow", "Trouble", "Parachutes", "High Speed", "We Never Change", "Everything's Not Lost"],
    extras: [{ title: "Life Is for Living", trackNumber: 10, kind: "hidden" }],
  },
  {
    artist: "Coldplay", album: "A Rush of Blood to the Head", albumOrder: 2, albumYear: 2002,
    sourceUrl: "https://www.coldplay.com/release/a-rush-of-blood-to-the-head/",
    tracks: ["Politik", "In My Place", "God Put a Smile Upon Your Face", "The Scientist", "Clocks", "Daylight", "Green Eyes", "Warning Sign", "A Whisper", "A Rush of Blood to the Head", "Amsterdam"],
    extras: [],
  },
  {
    artist: "Kings of Leon", album: "Youth and Young Manhood", albumOrder: 1, albumYear: 2003,
    sourceUrl: "https://music.apple.com/us/album/youth-and-young-manhood/1435820262",
    tracks: ["Red Morning Light", "Happy Alone", "Wasted Time", "Joe's Head", "Trani", "California Waiting", "Spiral Staircase", "Molly's Chambers", "Genius", "Dusty", "Holy Roller Novocaine"],
    extras: [{ title: "Talihina Sky", trackNumber: 11, kind: "hidden" }],
  },
  {
    artist: "Kings of Leon", album: "Aha Shake Heartbreak", albumOrder: 2, albumYear: 2004,
    sourceUrl: "https://music.apple.com/us/album/aha-shake-heartbreak/1482424654",
    tracks: ["Slow Night, So Long", "King of the Rodeo", "Taper Jean Girl", "Pistol of Fire", "Milk", "The Bucket", "Soft", "Razz", "Day Old Blues", "Four Kicks", "Velvet Snow", "Rememo"],
    extras: [
      { title: "Too Good to Tango", trackNumber: 1, kind: "hidden" },
      { title: "Where Nobody Knows", trackNumber: 13, kind: "bonus" },
    ],
  },
  {
    artist: "Kings of Leon", album: "Because of the Times", albumOrder: 3, albumYear: 2007,
    sourceUrl: "https://music.apple.com/us/album/because-of-the-times/1436364863",
    tracks: ["Knocked Up", "Charmer", "On Call", "McFearless", "Black Thumbnail", "My Party", "True Love Way", "Ragoo", "Fans", "The Runner", "Trunk", "Camaro", "Arizona"],
    extras: [],
  },
];

export const slug = (value) => String(value).normalize("NFKD").toLowerCase()
  .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function titleKey(value) {
  return slug(String(value).replace(/\s*\((?:ver(?:sion)?\.?\s*\d+|acoustic|live|intro)\)\s*$/i, ""));
}

export function requestedTrack(artist, title) {
  const artistKey = slug(artist);
  const songKey = titleKey(title);
  for (const entry of REQUESTED_ALBUMS) {
    if (slug(entry.artist) !== artistKey) continue;
    const index = entry.tracks.findIndex((name) => titleKey(name) === songKey);
    const extra = entry.extras.find((track) => titleKey(track.title) === songKey);
    if (index < 0 && !extra) continue;
    return {
      artist: entry.artist, title: index >= 0 ? entry.tracks[index] : extra.title,
      album: entry.album, albumOrder: entry.albumOrder, albumYear: entry.albumYear,
      trackNumber: index >= 0 ? index + 1 : extra.trackNumber,
      albumTrackKind: index >= 0 ? "main" : extra.kind,
      albumSourceUrl: entry.sourceUrl,
    };
  }
  return null;
}

export function albumCoverage(records) {
  return REQUESTED_ALBUMS.map((album) => {
    const matches = records.filter((record) => slug(record.artist) === slug(album.artist));
    const tracks = album.tracks.map((title, index) => {
      const versions = matches.filter((record) => titleKey(record.title) === titleKey(title));
      return { title, trackNumber: index + 1, charts: versions.length,
        formats: [...new Set(versions.map((record) => record.format))],
        sources: [...new Set(versions.map((record) => record.source))] };
    });
    return { artist: album.artist, album: album.album, expected: tracks.length,
      covered: tracks.filter((track) => track.charts > 0).length,
      missing: tracks.filter((track) => track.charts === 0).map((track) => track.title), tracks };
  });
}
