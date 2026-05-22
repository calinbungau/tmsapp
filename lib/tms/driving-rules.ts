/**
 * EU Regulation (EC) 561/2006 — driving and rest time check (simplified).
 *
 *  - Max 4.5h continuous driving before a 45-minute break (or split 15+30).
 *  - Max 9h daily driving (extendable to 10h twice per week).
 *  - Min 11h daily rest (reducible to 9h three times per week).
 */
export interface PlannedLeg {
  duration_minutes: number;
}

export interface DrivingRulesViolation {
  type:
    | "exceeds_4_5h_block"
    | "exceeds_9h_day"
    | "missing_break"
    | "missing_daily_rest";
  severity: "warning" | "error";
  message: string;
  detail?: string;
  legIndex?: number;
}

const FOUR_AND_HALF_HOURS = 4.5 * 60;
const NINE_HOURS = 9 * 60;
const MIN_BREAK = 45;

export function checkDrivingRules(
  legs: PlannedLeg[],
  breaksAfterLeg: number[] = []
): DrivingRulesViolation[] {
  const violations: DrivingRulesViolation[] = [];
  let blockMinutes = 0;
  let dailyMinutes = 0;
  // Each violation type only fires ONCE per current shift / continuous block.
  // A 45-min break resets the block flag; an 11-hour rest resets both.
  let blockViolationFired = false;
  let dailyViolationFired = false;

  for (let i = 0; i < legs.length; i++) {
    const drive = legs[i].duration_minutes ?? 0;
    blockMinutes += drive;
    dailyMinutes += drive;

    if (blockMinutes > FOUR_AND_HALF_HOURS && !blockViolationFired) {
      blockViolationFired = true;
      violations.push({
        type: "exceeds_4_5h_block",
        severity: "warning",
        message: `Continuous driving exceeds 4h30 by leg ${i + 1}`,
        detail: `Cumulative ${(blockMinutes / 60).toFixed(1)}h without a 45-min break`,
        legIndex: i,
      });
    }
    if (dailyMinutes > NINE_HOURS && !dailyViolationFired) {
      dailyViolationFired = true;
      violations.push({
        type: "exceeds_9h_day",
        severity: "error",
        message: `Daily driving exceeds 9h by leg ${i + 1}`,
        detail: `Cumulative ${(dailyMinutes / 60).toFixed(1)}h in current shift`,
        legIndex: i,
      });
    }

    const restAfter = breaksAfterLeg[i] ?? 0;
    if (restAfter >= MIN_BREAK) {
      blockMinutes = 0;
      blockViolationFired = false;
    }
    if (restAfter >= 11 * 60) {
      blockMinutes = 0;
      dailyMinutes = 0;
      blockViolationFired = false;
      dailyViolationFired = false;
    }
  }
  return violations;
}
