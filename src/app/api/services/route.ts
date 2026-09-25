import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { createService, listActiveServices, OrderError } from "@/lib/order-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const services = await listActiveServices();
  return NextResponse.json({ services });
}

const schema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().min(1).max(2000),
  price: z.number().int().positive(),
});

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Data jasa tidak valid" }, { status: 400 });
  }

  try {
    const service = await createService({ sellerId: auth.session.sub, ...parsed.data });
    return NextResponse.json({ service });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
