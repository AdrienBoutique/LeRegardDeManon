import { DateTime } from "luxon";

export const BRUSSELS_TIMEZONE = "Europe/Brussels";

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHmm(value: string): { hour: number; minute: number } {
  const match = hhmmRegex.exec(value);

  if (!match) {
    throw new Error(`Invalid time format: ${value}`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function buildDateTimeForDay(dateIso: string, time: string): DateTime {
  const date = DateTime.fromISO(dateIso, { zone: BRUSSELS_TIMEZONE });

  if (!date.isValid) {
    throw new Error(`Invalid date: ${dateIso}`);
  }

  const { hour, minute } = parseHHmm(time);
  const datetime = date.set({ hour, minute, second: 0, millisecond: 0 });

  if (!datetime.isValid) {
    throw new Error(`Invalid datetime from date=${dateIso}, time=${time}`);
  }

  return datetime;
}

export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

export type TimeInterval = {
  startMs: number;
  endMs: number;
};

export function normalizeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = intervals
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  if (sorted.length === 0) {
    return [];
  }

  const merged: TimeInterval[] = [{ ...sorted[0] }];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const last = merged[merged.length - 1];

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

export function subtractIntervals(
  baseIntervals: TimeInterval[],
  blockedIntervals: TimeInterval[]
): TimeInterval[] {
  const result: TimeInterval[] = [];
  const mergedBlocked = normalizeIntervals(blockedIntervals);

  for (const base of normalizeIntervals(baseIntervals)) {
    let cursor = base.startMs;

    for (const blocked of mergedBlocked) {
      if (blocked.endMs <= cursor) {
        continue;
      }

      if (blocked.startMs >= base.endMs) {
        break;
      }

      if (blocked.startMs > cursor) {
        result.push({
          startMs: cursor,
          endMs: Math.min(blocked.startMs, base.endMs),
        });
      }

      cursor = Math.max(cursor, blocked.endMs);

      if (cursor >= base.endMs) {
        break;
      }
    }

    if (cursor < base.endMs) {
      result.push({ startMs: cursor, endMs: base.endMs });
    }
  }

  return normalizeIntervals(result);
}
