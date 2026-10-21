// Keeping adult films out of the app.
//
// The film services do not agree on how to mark them: some say so in the
// genre, some only in a flag, and some only in the name. So all three are
// checked here, in one place, and every source goes through it.

// The words that only ever mean an adult film. Words that turn up in ordinary
// films are left out on purpose: "naked" (The Naked Gun), "escort" (Escort),
// "hot" (Hot Shots) and "anal" (analysis) are all ordinary titles.
const ADULT_WORDS = [
  'porn', 'porno', 'pornstar', 'erotic', 'erotica', 'nude', 'hentai',
  'blowjob', 'handjob', 'titjob', 'footjob', 'rimjob', 'creampie', 'cumshot',
  'masturbat', 'orgasm', 'pussy', 'dildo', 'bdsm', 'fetish', 'whore', 'hooker',
  'brothel', 'onlyfans', 'camgirl', 'milf', 'threesome', 'gangbang',
  'deepthroat', 'penis', 'vagina', 'semen', 'sperm', 'genital', 'labia',
  'incest', 'molest', 'rape', 'anal sex', 'sex tape', 'sex video', 'adult film',
  'adult movie', 'sxyvideo', 'pornhub', 'xvideos', 'motherless', 'cuckold',
  'wet nurse', 'wife in the window',
];

// Films the service does not mark at all: nothing in their genre, their flag
// or their name says so. These were found by hand, and the list grows as more
// of them turn up.
const ADULT_TITLES = [
  'adult night',
  'stripper party',
  'the billionaire\'s wet nurse',
  'the bodyguard godfather\'s good girl',
  'party 7',
  'familyxxx',
];

// The genres the service gives its adult films. None of them turn up in the
// ordinary sections.
const ADULT_GENRES = [
  'adult', 'erotic', 'hot', 'porn', 'xxx', 'wrestling', 'nude', '18+',
];

/** Whether a name is one of an adult film. */
export function isAdultTitle(title: string): boolean {
  const name = title.toLowerCase();
  // The films that are not marked at all.
  const plain = name.replace(/[^a-z0-9]/g, '');
  for (const marked of ADULT_TITLES) {
    if (plain === marked.replace(/[^a-z0-9]/g, '')) return true;
  }
  for (const word of ADULT_WORDS) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(name)) return true;
  }
  // "xxx" on its own is an adult film. In a longer title it is often only
  // part of a name, as in "xXx: Return of Xander Cage".
  if (/\bxxx\b/i.test(name)) {
    const rest = name.replace(/\bxxx\b/gi, '').replace(/[^\w]/g, '');
    if (rest.length <= 4) return true;
  }
  return false;
}

/** Whether the genres of a film are the ones the service gives adult films. */
export function isAdultGenre(genre: string | undefined): boolean {
  if (!genre) return false;
  return genre
    .toLowerCase()
    .split(',')
    .map((part) => part.trim())
    .some((part) => ADULT_GENRES.includes(part));
}
