import { NextResponse } from "next/server";
import { bootstrapApp } from "@/lib/bootstrap";
import { searchProducts } from "@/lib/pricing/service";

export async function GET(request: Request) {
  await bootstrapApp();
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const products = await searchProducts(q);
  return NextResponse.json({ products });
}
