/**
 * Dates and times, as a person reads them.
 *
 * One module because the product had started to grow a private date formatter
 * per screen, and two screens that disagree about what "yesterday" looks like
 * is the kind of thing nobody reports and everybody notices.
 *
 * Everything here is `Intl`, never a hard-coded format. A visitor in Beirut
 * reading an American date is the smallest possible way for a product to say
 * "this was not made for you", and the browser already knows better.
 */

const DAY_MS = 86_400_000;

/** Midnight at the start of whatever day this instant falls on, locally. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** How many calendar days ago, by the *calendar*, not by elapsed hours. */
export function daysAgo(iso: string, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
}

/**
 * The time of day: `14:32`, or `2:32 pm`, whichever this locale uses.
 *
 * Deliberately no seconds. A message is a thing somebody said, not an event in
 * a log, and the second it was said at has never answered a question anybody
 * had.
 */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The heading over a day's worth of messages.
 *
 * ```text
 *   Today · Yesterday          the two days somebody is likely to be in
 *   Thursday                   inside the last week, where the name of the
 *                              day places it better than a number does
 *   14 August                  older, and the year only once it is not this one
 * ```
 *
 * Weekday names rather than "3 days ago", which is the one difference from
 * `memoryDate` below: a conversation is read downward in order, so each heading
 * is telling you where you are in a sequence, and "3 days ago" then "2 days
 * ago" is arithmetic where "Tuesday" then "Wednesday" is a week.
 */
export function dayLabel(iso: string, now = new Date()): string {
  const days = daysAgo(iso, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';

  const date = new Date(iso);
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * When a conversation last had anything said in it, small enough for a list.
 *
 * The rule every messaging list uses, and it is a good one: within today the
 * *time* is what distinguishes two rows, and beyond it the time is noise and
 * the day is what you want. Never both — a row with `Yesterday 14:32` in it is
 * a row whose name has less space than its timestamp.
 */
export function conversationStamp(iso: string, now = new Date()): string {
  const days = daysAgo(iso, now);
  if (days <= 0) return clockTime(iso);
  if (days === 1) return 'Yesterday';

  const date = new Date(iso);
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * The date on a memory.
 *
 * Relative while relative is more useful than a date, and the visitor's own
 * locale after that. Unlike `dayLabel` this counts in days rather than naming
 * weekdays: the memory book is browsed, not read in order, so "3 days ago"
 * answers the question a reader actually has about an entry they have just
 * scrolled to.
 */
export function memoryDate(iso: string, now = new Date()): string {
  const days = daysAgo(iso, now);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;

  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    // Only once it stops being obvious. A year on every entry is noise for the
    // eleven months of them that are from this one.
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Whether two messages should be drawn as one run.
 *
 * Same person, close enough together in time that they are one thought typed
 * in three goes rather than three separate things said. A log that gives every
 * line its own avatar, its own gap and its own timestamp is a log that reads
 * like a spreadsheet of utterances.
 */
export const GROUPING_WINDOW_MS = 5 * 60 * 1000;
