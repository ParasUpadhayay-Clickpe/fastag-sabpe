import { NextResponse } from "next/server";

const BASE_URL = "https://api.instantpay.in";

function buildHeaders() {
    const clientId = process.env.ACCESS || "";
    const clientSecret = process.env.SECRET || "";
    const outletId = process.env.OUTLETID || "";
    const endpointIp = process.env.ENDPOINT_IP || "127.0.0.1";

    return {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Ipay-Auth-Code": "1",
        "X-Ipay-Client-Id": clientId,
        "X-Ipay-Client-Secret": clientSecret,
        "X-Ipay-Endpoint-Ip": endpointIp,
        "X-Ipay-Outlet-Id": outletId,
    } as Record<string, string>;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const billerId = body?.billerId;
        if (!billerId) return NextResponse.json({ error: "billerId is required" }, { status: 400 });

        const res = await fetch(`${BASE_URL}/marketplace/utilityPayments/billerDetails`, {
            method: "POST",
            headers: buildHeaders(),
            body: JSON.stringify({ billerId }),
            cache: "no-store" as RequestCache,
        });
        const data = await res.json();
        if (!res.ok) return NextResponse.json({ error: data }, { status: res.status });
        return NextResponse.json(data);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



