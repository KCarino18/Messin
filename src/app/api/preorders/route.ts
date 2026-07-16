import { NextResponse } from "next/server";
import { bootstrapApp } from "@/lib/bootstrap";
import { getWatcherSnapshot } from "@/lib/watcher/preorderWatcher";

export async function GET() {
  await bootstrapApp();
  const snapshot = await getWatcherSnapshot();
  return NextResponse.json(snapshot);
}
