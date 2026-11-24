import { describe, expect, it } from "vitest";
import { buildSettingsPatch, toForm } from "./settingsForm";
import type { AppSettings } from "./types";

const settings: AppSettings = {
  opening_hour: "05:00",
  closing_hour: "23:00",
  time_step_minutes: 15,
  allowed_durations: [60, 90],
  price_5: 200000,
  price_7: 500000,
  hold_timeout_minutes: 15,
  cancel_before_hours: 24,
  deposit_percent: 30,
  bank_bin: "",
  bank_account_no: "",
  bank_account_name: "",
};

describe("buildSettingsPatch", () => {
  it("is empty when nothing changed", () => {
    expect(buildSettingsPatch(settings, toForm(settings))).toEqual({});
  });

  it("sends only the changed fields with the right types", () => {
    const form = { ...toForm(settings), price_5: "250000", deposit_percent: "40", bank_bin: " 970436 " };
    expect(buildSettingsPatch(settings, form)).toEqual({
      price_5: 250000,
      deposit_percent: 40,
      bank_bin: "970436",
    });
  });

  it("parses the durations list", () => {
    const form = { ...toForm(settings), allowed_durations: "60" };
    expect(buildSettingsPatch(settings, form)).toEqual({ allowed_durations: [60] });
  });
});
