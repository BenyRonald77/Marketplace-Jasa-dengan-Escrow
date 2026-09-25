import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import {
  InsufficientBalanceError,
  listOrdersForUser,
  OrderError,
  placeOrder,
} from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const orders = await listOrdersForUser(auth.session.sub);
  return NextResponse.json({ orders });
}

const schema = z.object({ serviceId: z.string().min(1) });

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "serviceId wajib diisi" }, { status: 400 });
  }

  try {
    const order = await placeOrder({ buyerId: auth.session.sub, serviceId: parsed.data.serviceId });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
