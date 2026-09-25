import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { getOrderDetail, OrderError } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  try {
    const order = await getOrderDetail(params.id, auth.session.sub);
    if (!order) return NextResponse.json({ error: "Order tidak ditemukan" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
