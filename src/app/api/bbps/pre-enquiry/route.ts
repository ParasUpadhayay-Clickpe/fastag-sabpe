import { NextResponse } from "next/server";

export const runtime = "nodejs";

const LAMBDA_BASE = (process.env.NEXT_PUBLIC_BBPS_PROXY_URL || "https://4vtfgim3z4.execute-api.ap-south-1.amazonaws.com/dev").replace(/\/$/, "");

function isErrorResponse(data: any): boolean {
    if (!data) return false;
    const statuscode = data?.statuscode || data?.error?.statuscode;
    const status = data?.status || data?.error?.status;
    // Check for error status codes (ERR, IAN, and other error codes)
    const errorStatusCodes = ["ERR", "IAN", "INV", "NF", "NA"];
    const hasErrorStatusCode = statuscode && errorStatusCodes.includes(String(statuscode).toUpperCase());
    // Check status message for error keywords
    const hasErrorStatus = status && /invalid|error|failed|not found|unavailable/i.test(String(status));
    return hasErrorStatusCode || hasErrorStatus;
}

function extractErrorStatus(data: any): string {
    try {
        return (
            data?.status ||
            data?.error?.status ||
            (typeof data?.error === "string" ? data.error : "") ||
            data?.message ||
            "An error occurred"
        );
    } catch {
        return "An error occurred";
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { billerId, inputParameters, externalRef, transactionAmount } = body || {};
        if (!billerId || !inputParameters || !externalRef) {
            return NextResponse.json({ error: "billerId, inputParameters, externalRef are required" }, { status: 400 });
        }

        const res = await fetch(`${LAMBDA_BASE}/bbps/pre-enquiry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                billerId,
                inputParameters,
                externalRef,
                transactionAmount: transactionAmount ?? 0,
            }),
            cache: "no-store" as RequestCache,
        });
        const data = await res.json();
        if (!res.ok) {
            const msg = extractErrorStatus(data) || "Request failed";
            return NextResponse.json({ error: msg, details: data }, { status: res.status });
        }
        // Check if the response contains an error status code
        if (isErrorResponse(data)) {
            const msg = extractErrorStatus(data) || "Invalid request";
            return NextResponse.json({ error: msg, details: data }, { status: 400 });
        }
        return NextResponse.json(data);
    } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}



