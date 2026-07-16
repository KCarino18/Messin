import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { bootstrapApp } from "@/lib/bootstrap";

const bodySchema = z.object({
  amountCents: z.number().int().min(500).max(1_000_000),
});

export async function GET() {
  await bootstrapApp();
  const budget = await prisma.budget.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    amountCents: budget?.amountCents ?? 15000,
  });
}

export async function POST(request: Request) {
  await bootstrapApp();
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
  }

  const budget = await prisma.budget.upsert({
    where: { id: "default" },
    create: { id: "default", amountCents: parsed.data.amountCents },
    update: { amountCents: parsed.data.amountCents },
  });

  return NextResponse.json({ amountCents: budget.amountCents });
}
