import { createTranslator, Locale } from "./i18n.js";
import { TimeEntry, TimeInputStyle, TimeParseResult } from "./types.js";

const MINUTES_PER_DAY = 24 * 60;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + offsetDays);
  return toDateKey(date);
}

export function parseDateKey(dateKey: string): Date {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function normalizeClockToken(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "24:00") {
    return trimmed;
  }

  if (/^\d{3,4}$/.test(trimmed)) {
    const padded = trimmed.padStart(4, "0");
    const hours = Number(padded.slice(0, 2));
    const minutes = Number(padded.slice(2));
    return isValidClock(hours, minutes) ? `${pad(hours)}:${pad(minutes)}` : null;
  }

  const clockMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!clockMatch) {
    return null;
  }

  const hours = Number(clockMatch[1]);
  const minutes = Number(clockMatch[2]);
  return isValidClock(hours, minutes) ? `${pad(hours)}:${pad(minutes)}` : null;
}

export function parseDurationToken(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/\s+/g, "");
  const durationMatch = compact.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/);
  if (!durationMatch || (!durationMatch[1] && !durationMatch[2])) {
    return null;
  }

  const hours = durationMatch[1] ? Number(durationMatch[1]) : 0;
  const minutes = durationMatch[2] ? Number(durationMatch[2]) : 0;
  return Math.round(hours * 60 + minutes);
}

export function minutesFromTimeKey(timeKey: string, locale: Locale = "zh"): number {
  if (timeKey === "24:00") {
    return MINUTES_PER_DAY;
  }

  const normalized = normalizeClockToken(timeKey);
  if (!normalized) {
    const t = createTranslator(locale);
    throw new Error(t("time.error.invalidTimeValue", { timeKey }));
  }

  const [hours = 0, minutes = 0] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

export function addMinutesToTime(timeKey: string, minutesToAdd: number): string {
  const base = minutesFromTimeKey(timeKey);
  const normalized = ((base + minutesToAdd) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${pad(hours)}:${pad(minutes)}`;
}

export function computeElapsedMinutes(startTime: string, endTime: string): number {
  const start = minutesFromTimeKey(startTime);
  const end = minutesFromTimeKey(endTime);
  if (start === end) {
    return 0;
  }

  return end > start ? end - start : MINUTES_PER_DAY - start + end;
}

export function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours && minutes) {
    return `${hours}h ${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function inferTimeInputStyle(input: string): TimeInputStyle {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return "range_clock";
  }

  if (trimmed.includes("-")) {
    const [startPart = "", endPart = ""] = trimmed.split("-").map((part) => part.trim());
    if (startPart.includes(":") || endPart.includes(":")) {
      return "range_clock";
    }

    return "range_compact";
  }

  if (parseDurationToken(trimmed) !== null) {
    return trimmed.includes("h") ? "duration_hm" : "duration_minutes";
  }

  return trimmed.includes(":") ? "range_clock" : "range_compact";
}

export function splitTagInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,，。、]+/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  );
}

export function parseTimeInput(
  input: string,
  options: { defaultStartTime?: string; defaultEndTime?: string } = {},
  locale: Locale = "zh",
): TimeParseResult {
  const t = createTranslator(locale);
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error(t("time.error.enterTimeRangeOrDuration"));
  }

  if (trimmed.includes("-")) {
    const parts = trimmed.split("-").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(t("time.error.timeRangeFormat"));
    }

    const startTime = normalizeClockToken(parts[0]);
    if (!startTime) {
      throw new Error(t("time.error.invalidStart"));
    }

    const duration = parseDurationToken(parts[1]);
    const endTime = duration !== null ? addMinutesToTime(startTime, duration) : normalizeClockToken(parts[1]);
    if (!endTime) {
      throw new Error(t("time.error.invalidEndOrDuration"));
    }

    const elapsed = duration ?? computeElapsedMinutes(startTime, endTime);
    if (elapsed <= 0) {
      throw new Error(t("time.error.durationPositive"));
    }

    return {
      mode: "range",
      normalizedInput: `${startTime}-${endTime}`,
      description: t("time.description.range", {
        start: startTime,
        end: endTime,
        duration: formatDuration(elapsed),
      }),
      startTime,
      endTime,
      durationMinutes: elapsed,
    };
  }

  const duration = parseDurationToken(trimmed);
  if (duration !== null) {
    return {
      mode: "duration",
      normalizedInput: formatDuration(duration),
      description: t("time.description.durationOnly", { duration: formatDuration(duration) }),
      durationMinutes: duration,
    };
  }

  const clock = normalizeClockToken(trimmed);
  if (!clock) {
    throw new Error(t("time.error.cannotRecognize"));
  }

  if (options.defaultEndTime && options.defaultEndTime !== clock) {
    const elapsed = computeElapsedMinutes(clock, options.defaultEndTime);
    if (elapsed > 0) {
      return {
        mode: "range",
        normalizedInput: `${clock}-${options.defaultEndTime}`,
        description: t("time.description.range", {
          start: clock,
          end: options.defaultEndTime,
          duration: formatDuration(elapsed),
        }),
        startTime: clock,
        endTime: options.defaultEndTime,
        durationMinutes: elapsed,
      };
    }
  }

  if (options.defaultStartTime && options.defaultStartTime !== clock) {
    const elapsed = computeElapsedMinutes(options.defaultStartTime, clock);
    if (elapsed > 0) {
      return {
        mode: "range",
        normalizedInput: `${options.defaultStartTime}-${clock}`,
        description: t("time.description.range", {
          start: options.defaultStartTime,
          end: clock,
          duration: formatDuration(elapsed),
        }),
        startTime: options.defaultStartTime,
        endTime: clock,
        durationMinutes: elapsed,
      };
    }
  }

  throw new Error(t("time.error.needDefaultPoint"));
}

export function sortEntries(entries: TimeEntry[]): TimeEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    const leftStart = left.startTime ? minutesFromTimeKey(left.startTime) : Number.MAX_SAFE_INTEGER;
    const rightStart = right.startTime ? minutesFromTimeKey(right.startTime) : Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function buildSuggestedTimeInput(
  entries: TimeEntry[],
  dateKey: string,
  defaultRangeMinutes: number,
  now: Date = new Date(),
): string {
  const datedEntries = sortEntries(entries).filter((entry) => entry.date === dateKey);
  const lastEntry = datedEntries.at(-1);
  const preferredStyle = lastEntry?.timeInputStyle ?? inferExistingEntryStyle(lastEntry);
  if (preferredStyle === "duration_minutes" || preferredStyle === "duration_hm") {
    return formatDurationWithStyle(defaultRangeMinutes, preferredStyle);
  }

  const timedEntries = datedEntries.filter((entry) => entry.startTime && entry.endTime);
  const lastTimedEntry = timedEntries.at(-1);
  if (lastTimedEntry?.endTime && lastTimedEntry.endTime !== "24:00") {
    const endTime = addMinutesToTime(lastTimedEntry.endTime, defaultRangeMinutes);
    return formatRangeWithStyle(lastTimedEntry.endTime, endTime, preferredStyle);
  }

  const todayTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const endTime = dateKey === toDateKey(now) ? normalizeClockToken(todayTime) ?? "09:30" : "09:30";
  const startTime = addMinutesToTime(endTime, -defaultRangeMinutes);
  return formatRangeWithStyle(startTime, endTime, preferredStyle);
}

export function formatTimeInputForEntry(entry: Pick<TimeEntry, "startTime" | "endTime" | "durationMinutes" | "timeInputStyle">): string {
  const style = entry.timeInputStyle ?? inferExistingEntryStyle(entry);
  if (entry.startTime && entry.endTime) {
    return formatRangeWithStyle(entry.startTime, entry.endTime, style === "range_compact" ? "range_compact" : "range_clock");
  }

  return formatDurationWithStyle(entry.durationMinutes, style === "duration_minutes" ? "duration_minutes" : "duration_hm");
}

export function splitEntryAcrossMidnight(entry: TimeEntry): TimeEntry[] {
  if (!entry.startTime || !entry.endTime) {
    return [entry];
  }

  const start = minutesFromTimeKey(entry.startTime);
  const end = minutesFromTimeKey(entry.endTime);
  if (end > start || entry.endTime === "24:00") {
    return [entry];
  }

  const firstDuration = MINUTES_PER_DAY - start;
  const secondDuration = end;
  const nextDay = shiftDateKey(entry.date, 1);
  const shared = {
    categoryId: entry.categoryId,
    tags: [...entry.tags],
    project: entry.project,
    note: entry.note,
    source: entry.source,
    timeInputStyle: entry.timeInputStyle,
    updatedAt: entry.updatedAt,
  };

  return [
    {
      ...shared,
      id: entry.id,
      date: entry.date,
      startTime: entry.startTime,
      endTime: "24:00",
      durationMinutes: firstDuration,
      createdAt: entry.createdAt,
    },
    {
      ...shared,
      id: `${entry.id}-next`,
      date: nextDay,
      startTime: "00:00",
      endTime: entry.endTime,
      durationMinutes: secondDuration,
      createdAt: entry.createdAt,
    },
  ];
}

function isValidClock(hours: number, minutes: number): boolean {
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function formatRangeWithStyle(startTime: string, endTime: string, style: TimeInputStyle): string {
  const effectiveStyle = style === "range_compact" ? "range_compact" : "range_clock";
  return `${formatClockWithStyle(startTime, effectiveStyle)}-${formatClockWithStyle(endTime, effectiveStyle)}`;
}

function formatDurationWithStyle(durationMinutes: number, style: TimeInputStyle): string {
  if (style === "duration_minutes") {
    return `${durationMinutes}m`;
  }

  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours && minutes) {
    return `${hours}h${minutes}m`;
  }

  if (hours) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

function formatClockWithStyle(timeKey: string, style: "range_compact" | "range_clock"): string {
  if (style === "range_compact" && timeKey !== "24:00") {
    return timeKey.replace(":", "");
  }

  return timeKey;
}

function inferExistingEntryStyle(entry?: Pick<TimeEntry, "startTime" | "endTime" | "timeInputStyle">): TimeInputStyle {
  if (!entry) {
    return "range_clock";
  }

  if (entry.timeInputStyle) {
    return entry.timeInputStyle;
  }

  if (entry.startTime && entry.endTime) {
    return "range_clock";
  }

  return "duration_hm";
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
