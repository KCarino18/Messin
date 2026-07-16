import { NextResponse } from "next/server";
import { bootstrapApp } from "@/lib/bootstrap";
import { rankedOffersForProduct } from "@/lib/pricing/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await bootstrapApp();
  const { id } = await context.params;
  const result = await rankedOffersForProduct(id);
  if (!result) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
