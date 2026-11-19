import type { AppSettings } from "./types";

export type FormState = Record<string, string>;

const NUMERIC = [
  "time_step_minutes",
  "price_5",
  "price_7",
  "hold_timeout_minutes",
  "cancel_before_hours",
  "deposit_percent",
] as const;

const TEXT = ["opening_hour", "closing_hour", "bank_bin", "bank_account_no", "bank_account_name"] as const;

export function toForm(s: AppSettings): FormState {
  const form: FormState = {};
  for (const key of [...NUMERIC, ...TEXT]) form[key] = String(s[key]);
  form.allowed_durations = s.allowed_durations.join(",");
  return form;
}

/** Chỉ gửi các trường người dùng đã sửa, đúng kiểu dữ liệu server mong đợi. */
export function buildSettingsPatch(original: AppSettings, form: FormState): Partial<AppSettings> {
  const patch: Record<string, unknown> = {};
  for (const key of NUMERIC) {
    if (form[key] !== String(original[key])) patch[key] = Number(form[key]);
  }
  for (const key of TEXT) {
    if (form[key] !== String(original[key])) patch[key] = form[key].trim();
  }
  if (form.allowed_durations !== original.allowed_durations.join(",")) {
    patch.allowed_durations = form.allowed_durations
      .split(",")
      .map((v) => Number(v))
      .filter((v) => !Number.isNaN(v));
  }
  return patch as Partial<AppSettings>;
}

