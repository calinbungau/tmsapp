import { NextRequest, NextResponse } from "next/server";

// Internal self-hosted Nominatim instance
const NOMINATIM_BASE = "https://rvs.bngtracking.ro";

async function fetchNominatim(path: string): Promise<Response> {
  return fetch(`${NOMINATIM_BASE}${path}`, {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "BNG-TMS/1.0",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const q = searchParams.get("q") || "";
  const lat = searchParams.get("lat") || "";
  const lon = searchParams.get("lon") || "";
  const zoom = searchParams.get("zoom") || "10";

  try {
    let path: string;
    if (action === "search") {
      path = `/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`;
    } else if (action === "reverse") {
      path = `/reverse?format=json&lat=${lat}&lon=${lon}&zoom=${zoom}&addressdetails=1`;
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const res = await fetchNominatim(path);
    const text = await res.text();

    if (!res.ok) {
      return NextResponse.json(
        { error: `Nominatim returned ${res.status}` },
        { status: res.status }
      );
    }

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        { error: "Nominatim returned invalid response" },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
