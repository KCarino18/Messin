import { HomeClient } from "@/components/HomeClient";
import { bootstrapApp } from "@/lib/bootstrap";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  await bootstrapApp();
  const budget = await prisma.budget.findUnique({ where: { id: "default" } });

  return <HomeClient initialBudgetCents={budget?.amountCents ?? 15000} />;
}
