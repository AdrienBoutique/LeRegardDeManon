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

export type StaffScheduleMode = "WEEKLY" | "CUSTOM_DAYS";

export type StaffAvailabilityRule = DatedRule & {
  staffMemberId: string;
};

export type InstituteAvailabilityRule = DatedRule;

export type StaffCustomTimeSlot = {
  startTime: string;
  endTime: string;
};

export type StaffCustomWorkingDay = {
  staffMemberId: string;
  workingDate: string;
  isClosed: boolean;
  timeSlots: StaffCustomTimeSlot[];
};

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

export function buildCustomDayIntervals(
  dateIso: string,
  dayStartLocal: DateTime,
  workingDay: StaffCustomWorkingDay | null | undefined,
  instituteIntervals: TimeInterval[]
): TimeInterval[] {
  if (!workingDay || workingDay.isClosed) {
    return [];
  }

  if (workingDay.workingDate !== dateIso) {
    return [];
  }

  const intervals: TimeInterval[] = [];

  for (const slot of workingDay.timeSlots) {
    const start = buildDateTimeForDay(dateIso, slot.startTime);
    const end = buildDateTimeForDay(dateIso, slot.endTime);

    if (end <= start) {
      continue;
    }

    intervals.push({
      startMs: start.toUTC().toMillis(),
      endMs: end.toUTC().toMillis(),
    });
  }

  if (instituteIntervals.length > 0) {
    return intersectIntervals(intervals, instituteIntervals);
  }

  return intervals;
}

export function buildStaffWorkIntervalsByMode(
  dateIso: string,
  dayStartLocal: DateTime,
  instituteIntervals: TimeInterval[],
  input: Array<{
    staffMemberId: string;
    availabilityMode: StaffScheduleMode;
    weeklyRules?: StaffAvailabilityRule[];
    customWorkingDay?: StaffCustomWorkingDay | null;
  }>
): Map<string, TimeInterval[]> {
  const workIntervalsByStaff = new Map<string, TimeInterval[]>();

  for (const item of input) {
    if (item.availabilityMode === "CUSTOM_DAYS") {
      const intervals = buildCustomDayIntervals(dateIso, dayStartLocal, item.customWorkingDay, instituteIntervals);
      if (intervals.length > 0) {
        workIntervalsByStaff.set(item.staffMemberId, intervals);
      }
      continue;
    }

    const workIntervals = buildStaffWorkIntervals(
      dateIso,
      dayStartLocal,
      item.weeklyRules ?? [],
      instituteIntervals
    );
    const staffIntervals = workIntervals.get(item.staffMemberId) ?? [];
    if (staffIntervals.length > 0) {
      workIntervalsByStaff.set(item.staffMemberId, staffIntervals);
    }
  }

  return workIntervalsByStaff;
}
