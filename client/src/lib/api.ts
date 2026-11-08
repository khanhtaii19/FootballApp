const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export type AppSettings = {
  opening_hour: string;
  closing_hour: string;
  time_step_minutes: number;
  allowed_durations: number[];
  price_5: number;
  price_7: number;
  hold_timeout_minutes: number;
  cancel_before_hours: number;
};

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { email: string; role: string; name: string };
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Yêu cầu thất bại"
    );
  }
  return data as T;
}

export async function login(email: string, password: string) {
  return parseJson<AuthResponse>(
    await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
  );
}

export async function getSettings(): Promise<AppSettings> {
  const data = await parseJson<{ settings: AppSettings }>(
    await fetch(`${API_BASE}/settings`)
  );
  return data.settings;
}

export async function updateSettings(
  token: string,
  partial: Partial<AppSettings>
) {
  return parseJson<{ settings: AppSettings; message: string }>(
    await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(partial),
    })
  );
}
