import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { clearSession, getSession, saveSession, subscribe } from "./session";
import type { User } from "./types";

export function useAuth() {
  const session = useSyncExternalStore(subscribe, getSession);
  const queryClient = useQueryClient();

  async function login(email: string, password: string): Promise<User> {
    const result = await api.login(email, password);
    saveSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    return result.user;
  }

  async function register(input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }): Promise<User> {
    const result = await api.register(input);
    saveSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    return result.user;
  }

  function logout() {
    clearSession();
    queryClient.clear(); // không để dữ liệu của người trước lộ sang người sau
  }

  const user = session?.user ?? null;
  return { user, isOwner: user?.role === "owner", login, register, logout };
}
