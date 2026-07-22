const PLPD_COMPONENT_STATES = [
  "default",
  "hover",
  "active",
  "loading",
  "error",
  "empty",
  "gated",
] as const;

type PlpdComponentState = (typeof PLPD_COMPONENT_STATES)[number];

export { PLPD_COMPONENT_STATES };
export type { PlpdComponentState };
