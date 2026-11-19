import type { ReactNode } from "react";

interface Props {
  kind?: "error" | "success" | "info" | "warning";
  children: ReactNode;
}

export function Notice({ kind = "info", children }: Props) {
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
