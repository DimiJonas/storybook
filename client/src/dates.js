// Dates of memories come from the server as plain text "2025-10-22" (no time, no time zone).
// Always use these helpers instead of `new Date("2025-10-22")`: that would read the text as
// midnight UTC, which is still the previous day in time zones west of UTC (e.g. on a trip to
// New York every memory would show one day too early).
//
// A memory has `date` (its first day) and, if it lasts several days, `end_date` (its last day;
// empty for a single day).

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
// Up to this many days the detail view shows one chip per day, longer ranges as "from – to"
const MAX_DAY_CHIPS = 14;

// "2025-10-22" -> Date for 22 Oct 2025, 00:00 local time
export const parseDate = (text) => {
  const [year, month, day] = text.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Date -> "2025-10-22" (in local time) for sending to the server
export const toDateText = (date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

const pad = (n) => String(n).padStart(2, '0');
// Date -> "22.10."
const dayMonth = (date) => `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.`;
// Date -> "22.10.2025"
const fullDate = (date) => `${dayMonth(date)}${date.getFullYear()}`;
const weekday = (date) => WEEKDAYS[date.getDay()];

// "2025-10-22" -> "22.10.2025"
export const formatDate = (text) => fullDate(parseDate(text));

// Number of calendar days from a to b (b later: positive). Counted on the calendar, so the
// change to/from summer time (a "day" of 23 or 25 hours) doesn't matter.
export const daysBetween = (a, b) =>
  Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86400000
  );

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// First and last day of a memory as Dates (the same day for a single-day memory)
export const memoryDays = (memory) => {
  const start = parseDate(memory.date);
  return { start, end: memory.end_date ? parseDate(memory.end_date) : start };
};

// How many days a memory lasts (1 for a single day)
export const dayCount = (memory) => {
  const { start, end } = memoryDays(memory);
  return daysBetween(start, end) + 1;
};

// "3 Tage" / "1 Tag"
export const daysText = (count) => (count === 1 ? '1 Tag' : `${count} Tage`);

// From–to without weekdays, as short as possible:
//   10.–12.10.2025   30.09.–02.10.2025   30.12.2024–02.01.2025
const rangeText = (start, end) => {
  if (start.getFullYear() !== end.getFullYear()) return `${fullDate(start)}–${fullDate(end)}`;
  if (start.getMonth() !== end.getMonth()) return `${dayMonth(start)}–${fullDate(end)}`;
  return `${pad(start.getDate())}.–${fullDate(end)}`;
};

// Date of a memory for the timeline cards:
//   "22.10.2025"   or for several days "10.–12.10.2025 · 3 Tage"
export const memoryDateText = (memory) => {
  const { start, end } = memoryDays(memory);
  if (!memory.end_date) return fullDate(start);
  return `${rangeText(start, end)} · ${daysText(dayCount(memory))}`;
};

// Date of a memory for the detail view, as a row of small "chips":
//   single day:        ["Mi 22.10.2025"]
//   up to 14 days:     ["Fr 10.10.", "Sa", "So 12.10.2025"]   (first and last with date)
//                      ["Mo 30.12.2024", "Di", "Mi", "Do 02.01.2025"]   (across a new year)
//   longer:            ["Mo 01.08. – Fr 15.08.2025 · 15 Tage"]
export const dayChips = (memory) => {
  const { start, end } = memoryDays(memory);
  const count = dayCount(memory);
  if (count === 1) return [`${weekday(start)} ${fullDate(start)}`];
  const first = `${weekday(start)} ${start.getFullYear() === end.getFullYear() ? dayMonth(start) : fullDate(start)}`;
  const last = `${weekday(end)} ${fullDate(end)}`;
  if (count > MAX_DAY_CHIPS) return [`${first} – ${last} · ${daysText(count)}`];
  const middle = Array.from({ length: count - 2 }, (_, i) => weekday(addDays(start, i + 1)));
  return [first, ...middle, last];
};

const isLeapYear = (year) => new Date(year, 1, 29).getMonth() === 1;

// "An diesem Tag": memories from earlier years that took place on today's day and month.
// A multi-day memory counts on every one of its days; a memory of Feb 29 also appears on
// Feb 28 in years without Feb 29.
// Returns [{ memory, year, day, days }] (day = which day of the memory: 2 of 3), newest year first.
// A memory that spans a new year can appear for more than one year.
export const onThisDay = (memories, today = new Date()) => {
  const month = today.getMonth();
  const date = today.getDate();
  const thisYear = today.getFullYear();
  // Which day(s) of an earlier year count as "today"
  const daysInYear = (year) => {
    const days = [];
    if (!(month === 1 && date === 29) || isLeapYear(year)) days.push(new Date(year, month, date));
    if (month === 1 && date === 28 && !isLeapYear(thisYear) && isLeapYear(year)) days.push(new Date(year, 1, 29));
    return days;
  };

  const found = [];
  for (const memory of memories) {
    const { start, end } = memoryDays(memory);
    const lastYear = Math.min(end.getFullYear(), thisYear - 1);
    for (let year = start.getFullYear(); year <= lastYear; year += 1) {
      const day = daysInYear(year).find((d) => d >= start && d <= end);
      if (day) found.push({ memory, year, day: daysBetween(start, day) + 1, days: dayCount(memory) });
    }
  }
  return found.sort((a, b) => b.year - a.year || b.memory.date.localeCompare(a.memory.date) || b.memory.id - a.memory.id);
};
