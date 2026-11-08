export const SETTING_KEYS = [
  "opening_hour",
  "closing_hour",
  "time_step_minutes",
  "allowed_durations",
  "price_5",
  "price_7",
  "hold_timeout_minutes",
  "cancel_before_hours",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export interface AppSettings {
  opening_hour: string;
  closing_hour: string;
  time_step_minutes: number;
  allowed_durations: number[];
  price_5: number;
  price_7: number;
  hold_timeout_minutes: number;
  cancel_before_hours: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  opening_hour: "05:00",
  closing_hour: "23:00",
  time_step_minutes: 15,
  allowed_durations: [60, 90],
  price_5: 200_000,
  price_7: 500_000,
  hold_timeout_minutes: 15,
  cancel_before_hours: 24,
};
