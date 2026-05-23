import { NextRequest, NextResponse } from "next/server";

type QuestSpatialProbeEvent = {
  at: string;
  data?: unknown;
  runId: string;
  source: string;
  status: "pass" | "fail" | "info";
  step: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __questSpatialProbeEvents: QuestSpatialProbeEvent[] | undefined;
}

function eventStore() {
  if (!globalThis.__questSpatialProbeEvents) {
    globalThis.__questSpatialProbeEvents = [];
  }

  return globalThis.__questSpatialProbeEvents;
}

export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");
  const events = eventStore().filter((event) => !runId || event.runId === runId);

  return NextResponse.json({
    count: events.length,
    events
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Partial<QuestSpatialProbeEvent> | null;

  if (!body?.runId || !body.step || !body.source || !body.status) {
    return NextResponse.json({ error: "Invalid probe event." }, { status: 400 });
  }

  const event: QuestSpatialProbeEvent = {
    at: body.at ?? new Date().toISOString(),
    data: body.data,
    runId: body.runId,
    source: body.source,
    status: body.status,
    step: body.step
  };

  const events = eventStore();
  events.push(event);
  if (events.length > 800) {
    events.splice(0, events.length - 800);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");

  if (!runId) {
    globalThis.__questSpatialProbeEvents = [];
    return NextResponse.json({ ok: true });
  }

  globalThis.__questSpatialProbeEvents = eventStore().filter((event) => event.runId !== runId);
  return NextResponse.json({ ok: true });
}
