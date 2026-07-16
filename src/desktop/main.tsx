import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/cinzel/500.css";
import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import { HomeClient } from "@/components/HomeClient";
import { desktop } from "@/lib/desktopClient";
import "@/app/globals.css";

async function boot() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");

  let initialBudgetCents = 15000;
  try {
    const budget = await desktop().getBudget();
    initialBudgetCents = budget.amountCents;
  } catch {
    // first paint still works; HomeClient will refresh
  }

  createRoot(root).render(
    <StrictMode>
      <HomeClient initialBudgetCents={initialBudgetCents} />
    </StrictMode>,
  );
}

void boot();
