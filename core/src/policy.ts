export interface Policy {
  /** "block" stops hijacks; "report" only logs them (used to measure false positives). */
  mode: "block" | "report";
  /** How long after a click it still counts as the cause of a popup or navigation. Matches Chrome's ~5s user activation. */
  activationMs: number;
  /** Time between periodic overlay scans. Traps often re-arm on timers. */
  scanIntervalMs: number;
  /** Score at which a page is reported as a likely scam. */
  scamThreshold: number;
  /**
   * Cancel trusted clicks that land on something invisible (agent hosts only).
   * Off for people: they see the page, and real sites do use invisible click layers.
   */
  clickShield: boolean;
}

export const policy: Policy = {
  mode: "block",
  activationMs: 5000,
  scanIntervalMs: 1000,
  scamThreshold: 7,
  clickShield: false,
};

export function setPolicy(overrides: Partial<Policy> = {}): void {
  Object.assign(policy, overrides);
}

export const blocking = (): boolean => policy.mode === "block";
