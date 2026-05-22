import { NextRequest, NextResponse } from "next/server";
import { dispatch } from "@/lib/notification-engine";
import type { NotificationPayload } from "@/lib/notification-engine";

export async function POST(request: NextRequest) {
  try {
    const payload: NotificationPayload = await request.json();

    if (!payload.event || !payload.title || !payload.adminId) {
      return NextResponse.json({ error: "Missing required fields: event, title, adminId" }, { status: 400 });
    }

    const result = await dispatch(payload);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Notification dispatch error:", err);
    return NextResponse.json({ error: err.message || "Failed to dispatch" }, { status: 500 });
  }
}
