"use client";

import { useEffect, useState } from "react";
import { desktop } from "@/lib/desktopClient";

type UpdateStatus =
  | { status: "checking" }
  | { status: "available"; version: string }
  | { status: "downloading"; version?: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string }
  | { status: "idle" };

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    try {
      return desktop().onUpdater((payload) => {
        setUpdate(payload as UpdateStatus);
      });
    } catch {
      return undefined;
    }
  }, []);

  if (!update || update.status === "idle") return null;

  let message = "";
  switch (update.status) {
    case "checking":
      message = "Checking for updates…";
      break;
    case "available":
      message = `Update ${update.version} found — downloading…`;
      break;
    case "downloading":
      message = `Downloading update${update.version ? ` ${update.version}` : ""}… ${update.percent}%`;
      break;
    case "ready":
      message = `Update ${update.version} ready — restart when convenient (dialog shown).`;
      break;
    case "error":
      message = `Update check failed: ${update.message}`;
      break;
    default:
      return null;
  }

  return (
    <div className="rounded-md border border-[var(--emerald-400)]/30 bg-[rgba(40,120,90,0.12)] px-3 py-2 text-xs text-[var(--emerald-300)]">
      {message}
    </div>
  );
}
