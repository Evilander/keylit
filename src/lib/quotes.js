// quotes.js — the Library hero speaks in borrowed lines. Writers whose charts
// live in the songbook; one drawn fresh each time the app loads. Never a
// marketing tagline (house rule, 2026-07-12). Pure.
export const QUOTES = [
  { q: "I used to be darker, then I got lighter, then I got dark again.", by: "Bill Callahan · “Jim Cain”" },
  { q: "Dress sexy at my funeral, my good wife.", by: "Bill Callahan · Smog, “Dress Sexy at My Funeral”" },
  { q: "All my favorite singers couldn't sing.", by: "David Berman · Silver Jews, “We Are Real”" },
  { q: "Songs build little rooms in time.", by: "David Berman · Purple Mountains, “Snow Is Falling in Manhattan”" },
  { q: "The best song will never get sung.", by: "Jeff Tweedy · Wilco, “The Late Greats”" },
  { q: "Music is my savior. I was maimed by rock and roll.", by: "Jeff Tweedy · Wilco, “Sunken Treasure”" },
  { q: "Life is what happens to you while you're busy making other plans.", by: "John Lennon · “Beautiful Boy”" },
  { q: "There's nowhere you can be that isn't where you're meant to be.", by: "John Lennon · “All You Need Is Love”" },
  { q: "As life gets longer, awful feels softer.", by: "Isaac Brock · Modest Mouse, “The View”" },
  { q: "Someday you will die and somehow something's gonna steal your carbon.", by: "Isaac Brock · Modest Mouse, “Parting of the Sensory”" },
  { q: "I hope that someday, buddy, we have peace in our lives.", by: "Bonnie “Prince” Billy · “I See a Darkness”" },
  { q: "You are always on my mind.", by: "Bonnie “Prince” Billy · Palace Music, “New Partner”" },
];

/** One line off the shelf. Pass a [0,1) rand for determinism in tests. */
export function pickQuote(rand = Math.random) {
  return QUOTES[Math.floor(rand() * QUOTES.length)];
}
