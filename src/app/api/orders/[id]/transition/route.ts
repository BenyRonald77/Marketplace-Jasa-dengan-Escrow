import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import {
  completeOrder,
  disputeOrder,
  markDelivered,
  markInProgress,
  OrderError,
} from "@/lib/order-service";

const schema = z.object({
  action: z.enum(["IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED"]),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });
  }

  try {
    const actorId = auth.session.sub;
    const order =
      parsed.data.action === "IN_PROGRESS"
        ? await markInProgress(params.id, actorId)
        : parsed.data.action === "DELIVERED"
          ? await markDelivered(params.id, actorId)
          : parsed.data.action === "COMPLETED"
            ? await completeOrder(params.id, actorId)
            : await disputeOrder(params.id, actorId, parsed.data.note);

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
