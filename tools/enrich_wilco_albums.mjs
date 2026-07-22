// Assign album metadata to the private Wilco corpus.
//
// Track lists are transcribed from Wilco's official discography. Keep this
// offline and deterministic: rebuilding the private browse index must not
// depend on a third-party service being available.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "corpus");

const albums = [
  {
    album: "A.M.", albumOrder: 10,
    tracks: [
      "I Must Be High", "Casino Queen", "Box Full of Letters", "Shouldn't Be Ashamed",
      "Pick Up the Change", "I Thought I Held You", "That's Not the Issue",
      "It's Just That Simple", "Should've Been in Love", "Passenger Side", "Dash 7",
      "Blue Eyed Soul", "Too Far Apart",
    ],
  },
  {
    album: "Being There", albumOrder: 20,
    tracks: [
      "Misunderstood", "Far, Far Away", "Monday", "Outtasite (Outta Mind)",
      "Forget the Flowers", "Red-Eyed and Blue", "I Got You (At the End of the Century)",
      "What's the World Got in Store", "Hotel Arizona", "Say You Miss Me", "Sunken Treasure",
      "Someday Soon", "Outta Mind (Outta Sight)", "Someone Else's Song", "Kingpin",
      "(Was I) In Your Dreams", "Why Would You Wanna Live", "The Lonely 1",
      "Dreamer in My Dreams",
    ],
  },
  {
    album: "Mermaid Avenue", albumOrder: 30,
    tracks: [
      "Walt Whitman's Niece", "California Stars", "Way Over Yonder in the Minor Key",
      "Birds and Ships", "Hoodoo Voodoo", "She Came Along to Me", "At My Window Sad and Lonely",
      "Ingrid Bergman", "Christ for President", "I Guess I Planted", "One by One",
      "Eisler on the Go", "Hesitating Beauty", "Another Man's Done Gone", "The Unwelcome Guest",
    ],
  },
  {
    album: "Summerteeth", albumOrder: 40,
    tracks: [
      "Can't Stand It", "She's a Jar", "A Shot in the Arm", "We're Just Friends",
      "I'm Always in Love", "Nothing'severgonnastandinmyway(again)", "Pieholden Suite",
      "How to Fight Loneliness", "Via Chicago", "ELT", "My Darling",
      "When You Wake Up Feeling Old", "Summer Teeth", "In a Future Age", "Candyfloss",
    ],
  },
  {
    album: "Mermaid Avenue Vol. II", albumOrder: 50,
    tracks: [
      "Airline to Heaven", "My Flying Saucer", "Feed of Man", "Hot Rod Hotel", "I Was Born",
      "Secret of the Sea", "Stetson Kennedy", "Remember the Mountain Bed", "Blood of the Lamb",
      "Aginst Th' Law", "All You Fascists", "Joe DiMaggio Done It Again", "Meanest Man",
      "Black Wind Blowing", "Someday Some Morning Sometime",
    ],
  },
  {
    album: "Yankee Hotel Foxtrot", albumOrder: 60,
    tracks: [
      "I Am Trying to Break Your Heart", "Kamera", "Radio Cure", "War on War", "Jesus, Etc.",
      "Ashes of American Flags", "Heavy Metal Drummer", "I'm the Man Who Loves You",
      "Pot Kettle Black", "Poor Places", "Reservations",
    ],
  },
  {
    album: "More Like the Moon EP", albumOrder: 65,
    tracks: [
      "More Like the Moon", "Bob Dylan's 49th Beard", "Woodgrain", "A Magazine Called Sunset",
      "The Good Part", "Cars Can't Escape",
    ],
  },
  {
    album: "A Ghost Is Born", albumOrder: 70,
    tracks: [
      "At Least That's What You Said", "Hell Is Chrome", "Spiders (Kidsmoke)", "Muzzle of Bees",
      "Hummingbird", "Handshake Drugs", "Wishful Thinking", "Company in My Back", "I'm a Wheel",
      "Theologians", "Less Than You Think", "The Late Greats",
    ],
  },
  {
    album: "Sky Blue Sky", albumOrder: 80,
    tracks: [
      "Either Way", "You Are My Face", "Impossible Germany", "Sky Blue Sky", "Side with the Seeds",
      "Shake It Off", "Please Be Patient with Me", "Hate It Here", "Leave Me (Like You Found Me)",
      "Walken", "What Light", "On and On and On",
    ],
  },
  { album: "The Wilco Book", albumOrder: 75, tracks: ["Diamond Claw"] },
  {
    album: "Wilco (The Album)", albumOrder: 90,
    tracks: [
      "Wilco (The Song)", "Deeper Down", "One Wing", "Bull Black Nova", "You and I",
      "You Never Know", "Country Disappeared", "Solitaire", "I'll Fight", "Sonny Feeling",
      "Everlasting Everything",
    ],
  },
  {
    album: "The Whole Love", albumOrder: 100,
    tracks: [
      "Art of Almost", "I Might", "Sunloathe", "Dawned on Me", "Black Moon", "Born Alone",
      "Open Mind", "Capitol City", "Standing O", "Rising Red Lung", "Whole Love",
      "One Sunday Morning (Song for Jane Smiley's Boyfriend)",
    ],
  },
  { album: "Mermaid Avenue Vol. III", albumOrder: 110, tracks: ["When the Roses Bloom Again"] },
  { album: "Star Wars", albumOrder: 120, tracks: ["More...", "Random Name Generator", "The Joke Explained", "You Satellite", "Taste the Ceiling", "Pickled Ginger", "Where Do I Begin", "Cold Slope", "Magnetized"] },
  { album: "Schmilco", albumOrder: 130, tracks: ["Normal American Kids", "If I Ever Was a Child", "Cry All Day", "Common Sense", "Nope", "Someone to Lose", "Happiness", "Shrug and Destroy", "We Aren't the World (Safety Girl)", "Just Say Goodbye"] },
  { album: "Ode to Joy", albumOrder: 140, tracks: ["Bright Leaves", "Before Us", "One and a Half Stars", "Quiet Amplifier", "Everyone Hides", "White Wooden Cross", "Citizens", "We Were Lucky", "Love Is Everywhere (Beware)", "Hold Me Anyway", "An Empty Corner"] },
  { album: "Cruel Country", albumOrder: 150, tracks: ["I Am My Mother", "Cruel Country", "Hints", "Ambulance", "The Empty Condor", "Tonight's the Day", "All Across the World", "Darkness Is Cheap", "Bird Without a Tail / Base of My Skull", "Tired of Taking It Out on You", "The Universe", "Many Worlds", "Hearts Hard to Find", "Falling Apart (Right Now)", "Please Be Wrong", "Story to Tell", "A Lifetime to Find", "Country Song Upside-Down", "Mystery Binds", "Sad Kind of Way", "The Plains"] },
  { album: "Cousin", albumOrder: 160, tracks: ["Infinite Surprise", "Ten Dead", "Levee", "Evicted", "Sunlight Ends", "A Bowl and a Pudding", "Cousin", "Pittsburgh", "Soldier Child", "Meant to Be"] },
  { album: "Hot Sun Cool Shroud EP", albumOrder: 170, tracks: ["Hot Sun", "Livid", "Ice Cream", "Annihilation", "Inside the Bell Bones", "Say You Love Me"] },
];

function normTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const aliases = new Map(Object.entries({
  "against th law": "aginst th law",
  "against the law": "aginst th law",
  "bob dylans beard": "bob dylans 49th beard",
  "company on my back": "company in my back",
  "every little thing": "elt",
  "i got you": "i got you at the end of the century",
  "in your dreams": "was i in your dreams",
  "kidsmokespiders": "spiders kidsmoke",
  "lonely one": "the lonely 1",
  "magazine called sunset": "a magazine called sunset",
  "nothingsevergonnastandinmywayagain": "nothingsevergonnastandinmyway again",
  "summerteeth": "summer teeth",
  "tired of taking it out with you": "tired of taking it out on you",
  "was i in your dreams live": "was i in your dreams",
  "whats the world got in store for you": "whats the world got in store",
  "why woud you wanna live": "why would you wanna live",
}));

const byTitle = new Map();
for (const album of albums) {
  for (const track of album.tracks) {
    const key = normTitle(track);
    if (!byTitle.has(key)) byTitle.set(key, album);
  }
}

// Album-era extras that are useful beside the parent record even though they
// were issued as B-sides, bonus tracks, demos, or on later compilations.
const eraExtras = new Map();
function addExtras(albumName, titles) {
  const album = albums.find((row) => row.album === albumName);
  for (const title of titles) eraExtras.set(normTitle(title), album);
}
addExtras("A.M.", ["Childlike and Evergreen Demo", "I Can't Keep from Talking", "Late Blooming Son", "No Poetry", "No More Poetry", "Pecan Pie", "Promising"]);
addExtras("Summerteeth", ["Blasting Fonda"]);
addExtras("Yankee Hotel Foxtrot", ["Not for the Season", "Nothing Up My Sleeve", "Venus Stop the Train"]);
addExtras("A Ghost Is Born", ["Hesitation Rocks", "Kicking Television", "Panthers"]);
addExtras("Sky Blue Sky", ["Glad It's Over", "Let's Not Get Carried Away", "Thanks I Get", "The Thanks I Get"]);

const RARITIES = { album: "Rarities, Covers & Live", albumOrder: 9990 };

function albumFor(title) {
  const raw = normTitle(title);
  const key = aliases.get(raw) || raw;
  return byTitle.get(key) || eraExtras.get(key) || RARITIES;
}

const files = [];
for (const source of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, source);
  if (source.startsWith("_") || !fs.statSync(dir).isDirectory()) continue;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".json")) files.push(path.join(dir, name));
  }
}

let changed = 0;
const counts = new Map();
for (const file of files) {
  let song;
  try { song = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
  if (!song || Array.isArray(song) || song.artist !== "Wilco") continue;
  const album = albumFor(song.title);
  counts.set(album.album, (counts.get(album.album) || 0) + 1);
  if (song.album === album.album && song.albumOrder === album.albumOrder) continue;
  song.album = album.album;
  song.albumOrder = album.albumOrder;
  fs.writeFileSync(file, JSON.stringify(song), "utf8");
  changed++;
}

console.log("Wilco records updated:", changed);
for (const [album, count] of [...counts].sort((a, b) => {
  const aa = albums.find((row) => row.album === a[0]) || RARITIES;
  const bb = albums.find((row) => row.album === b[0]) || RARITIES;
  return aa.albumOrder - bb.albumOrder;
})) console.log(String(count).padStart(3), album);
