// Tidying of the titles the app shows.
//
// The channels and the film services decorate their titles with emoji
// (😂 🔥 🤣 ❤️ 💗 🦸🏻), which look untidy in a list. The app shows the titles
// without them, and without the leftovers they leave behind.

// These ranges cover the picture emoji, plus the invisible characters that
// join or colour them, but not letters of any script.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** A title with the emoji taken out and the spaces they leave tidied up. */
export function stripEmoji(title: string): string {
  return title
    .replace(EMOJI, '')
    // What is left of a title that was only emoji is nothing at all.
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([|·–—,.:])/g, '$1')
    .replace(/^[\s|·–—,.:]+/, '')
    .trim();
}
