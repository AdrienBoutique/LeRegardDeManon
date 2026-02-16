import { DateTime } from "luxon";
import {
  BRUSSELS_TIMEZONE,
  buildDateTimeForDay,
  intersectIntervals,
  TimeInterval,
} from "./time";

type DatedRule = {
  startTime: string;
  endTime: string;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
};

export type StaffAvailabilityRule = DatedRule & {
  staffMemberId: string;
};

export type InstituteAvailabilityRule = DatedRule;

function isRuleApplicable(dayStartLocal: DateTime, rule: DatedRule): boolean {
  const effectiveFrom = rule.effectiveFrom
    ? DateTime.fromJSDate(rule.effectiveFrom, { zone: BRUSSELS_TIMEZONE }).startOf("day")
    : null;
  const effectiveTo = rule.effectiveTo
    ? DateTime.fromJSDate(rule.effectiveTo, { zone: BRUSSELS_TIMEZONE }).endOf("day")
    : null;

  return (
    (!effectiveFrom || dayStartLocal >= effectiveFrom) &&
    (!effectiveTo || dayStartLocal <= effectiveTo)
  );
}

function ruleToInterval(dateIso: string, rule: DatedRule): TimeInterval | null {
  const start = buildDateTimeForDay(dateIso, rule.startTime);
  const end = buildDateTimeForDay(dateIso, rule.endTime);

  if (end <= start) {
    return null;
  }

  return {
    startMs: start.toUTC().toMillis(),
    endMs: end.toUTC().toMillis(),
  };
}

export function buildInstituteIntervals(
  dateIso: string,
  dayStartLocal: DateTime,
  rules: InstituteAvailabilityRule[]
): TimeInterval[] {
  const intervals: TimeInterval[] = [];

  for (const rule of rules) {
    if (!isRuleApplicable(dayStartLocal, rule)) {
      continue;
    }

    const interval = ruleToInterval(dateIso, rule);
    if (interval) {
      intervals.push(interval);
    }
  }

  return intervals;
}

export function buildStaffWorkIntervals(
  dateIso: string,
  dayStartLocal: DateTime,
  rules: StaffAvailabilityRule[],
  instituteIntervals: TimeInterval[]
): Map<string, TimeInterval[]> {
  const workIntervalsByStaff = new Map<string, TimeInterval[]>();

  for (const rule of rules) {
    if (!isRuleApplicable(dayStartLocal, rule)) {
      continue;
    }

    const interval = ruleToInterval(dateIso, rule);
    if (!interval) {
      continue;
    }

    const baseIntervals = [interval];
    const scoped =
      instituteIntervals.length > 0
        ? intersectIntervals(baseIntervals, instituteIntervals)
        : [];

    if (scoped.length === 0) {
      continue;
    }

    const existing = workIntervalsByStaff.get(rule.staffMemberId) ?? [];
    workIntervalsByStaff.set(rule.staffMemberId, existing.concat(scoped));
  }

  return workIntervalsByStaff;
}
