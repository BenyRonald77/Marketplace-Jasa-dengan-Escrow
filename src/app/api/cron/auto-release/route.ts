import { NextResponse } from "next/server";
import { autoReleaseDueOrders } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const result = await autoReleaseDueOrders();
  return NextResponse.json(result);
}
