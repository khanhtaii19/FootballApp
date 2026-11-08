import prisma from "../lib/prisma.js";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  type AppSettings,
  type SettingKey,
} from "../lib/settings-keys.js";

function parseSettingValue(key: SettingKey, raw: string): unknown {
  switch (key) {
    case "allowed_durations":
      return JSON.parse(raw) as number[];
    case "time_step_minutes":
    case "price_5":
    case "price_7":
    case "hold_timeout_minutes":
    case "cancel_before_hours":
      return Number(raw);
    default:
      return raw;
  }
}

function serializeSettingValue(key: SettingKey, value: unknown): string {
  if (key === "allowed_durations") {
    return JSON.stringify(value);
  }
  return String(value);
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const result = { ...DEFAULT_SETTINGS };

  for (const key of SETTING_KEYS) {
    const raw = map.get(key);
    if (raw === undefined) {
      continue;
    }
    (result as Record<string, unknown>)[key] = parseSettingValue(key, raw);
  }

  return result;
}

export async function updateAppSettings(
  partial: Partial<AppSettings>
): Promise<AppSettings> {
  const entries = Object.entries(partial).filter(
    ([, value]) => value !== undefined
  ) as [SettingKey, unknown][];

  if (entries.length === 0) {
    return getAppSettings();
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: {
          key,
          value: serializeSettingValue(key, value),
        },
        update: {
          value: serializeSettingValue(key, value),
        },
      })
    )
  );

  return getAppSettings();
}
