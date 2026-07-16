import { NextResponse } from "next/server";
import { bootstrapApp } from "@/lib/bootstrap";
import { getDealsUnderBudget } from "@/lib/pricing/service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  await bootstrapApp();
  const { searchParams } = new URL(request.url);
  const budgetParam = searchParams.get("budget");

  let budgetCents = Number(budgetParam);
  if (!Number.isFinite(budgetCents) || budgetCents <= 0) {
    const saved = await prisma.budget.findUnique({ where: { id: "default" } });
    budgetCents = saved?.amountCents ?? 15000;
  }

  const deals = await getDealsUnderBudget(Math.round(budgetCents));
  return NextResponse.json({
    budgetCents: Math.round(budgetCents),
    deals,
    mode: deals.some((d) => d.offer.isDemo) ? "demo" : "live",
  });
}
