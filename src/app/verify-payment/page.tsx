"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

type CustomerParam = { Name?: string; Value?: string };
type VerifyData = {
    enquiryReferenceId?: string;
    CustomerName?: string;
    BillNumber?: string;
    BillPeriod?: string;
    BillDate?: string;
    BillDueDate?: string;
    BillAmount?: string | number;
    CustomerParamsDetails?: CustomerParam[];
    BillDetails?: any[];
    AdditionalDetails?: any[];
};

type VerifyPayload = {
    statuscode?: string;
    status?: string;
    data?: VerifyData;
    timestamp?: string;
    ipay_uuid?: string;
    orderid?: string | null;
    environment?: string;
    actcode?: string | null;
    internalCode?: string | null;
};

function formatAmount(a: string | number | undefined) {
    const num = typeof a === "string" ? Number(a) : a ?? 0;
    return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function VerifyPaymentInner() {
    const sp = useSearchParams();
    const [manual, setManual] = useState("");

    const payload: VerifyPayload | null = useMemo(() => {
        try {
            const raw = sp.get("payload");
            if (raw) return JSON.parse(decodeURIComponent(raw));
        } catch { }
        try {
            return manual ? JSON.parse(manual) : null;
        } catch {
            return null;
        }
    }, [sp, manual]);

    const statuscode = payload?.statuscode || "";
    const isSuccess = (statuscode || "").toUpperCase() === "TXN";
    const isPending = (statuscode || "").toUpperCase() === "PEN";
    const badgeClass = isSuccess
        ? "bg-green-100 text-green-800"
        : isPending
            ? "bg-yellow-100 text-yellow-800"
            : "bg-red-100 text-red-800";

    const d = payload?.data || {};

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <nav className="text-sm text-gray-500 mb-4">
                <Link href="/" className="hover:text-primary">Home</Link>
                <span className="px-2">/</span>
                <span className="text-gray-700">Verify Payment</span>
            </nav>

            <div className="bg-white/90 rounded-xl shadow-md p-6 border border-lightBg">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl md:text-3xl font-bold text-dark">Payment Status</h1>
                    {payload?.status && (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${badgeClass}`}>{payload.status}</span>
                    )}
                </div>

                {!payload && (
                    <div className="space-y-3">
                        <p className="text-gray-600">Pass the JSON in a query param named <code className="px-1 py-0.5 rounded bg-cardBg">payload</code> (URL-encoded), or paste below and preview.</p>
                        <textarea value={manual} onChange={(e) => setManual(e.target.value)} className="w-full h-40 p-3 border border-lightBg rounded bg-cardBg" placeholder="Paste verification JSON here..." />
                    </div>
                )}

                {payload && (
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="bg-lightBg rounded-lg p-4">
                                <div className="flex justify-between"><span className="text-gray-600">Enquiry Ref</span><span className="font-semibold">{d.enquiryReferenceId || "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Customer</span><span className="font-semibold">{d.CustomerName || "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Bill Number</span><span className="font-semibold">{d.BillNumber || "-"}</span></div>
                            </div>

                            <div className="bg-lightBg rounded-lg p-4">
                                <div className="flex justify-between"><span className="text-gray-600">Bill Period</span><span className="font-semibold">{d.BillPeriod || "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Bill Date</span><span className="font-semibold">{d.BillDate || "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Due Date</span><span className="font-semibold">{d.BillDueDate || "-"}</span></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-gradient-to-r from-primary to-secondary text-white rounded-lg p-5 shadow-md">
                                <div className="flex items-center justify-between">
                                    <span className="text-lg">Amount</span>
                                    <span className="text-3xl font-bold">₹{formatAmount(d.BillAmount)}</span>
                                </div>
                            </div>

                            {Array.isArray(d.CustomerParamsDetails) && d.CustomerParamsDetails.length > 0 && (
                                <div className="bg-cardBg rounded-lg p-4 border border-lightBg">
                                    <h3 className="font-semibold mb-3">Customer Parameters</h3>
                                    <div className="space-y-2 text-sm">
                                        {d.CustomerParamsDetails.map((p, idx) => (
                                            <div key={idx} className="flex justify-between"><span className="text-gray-600">{p.Name}</span><span className="font-medium">{p.Value}</span></div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {Array.isArray(d.BillDetails) && d.BillDetails.length > 0 && (
                                <div className="bg-cardBg rounded-lg p-4 border border-lightBg">
                                    <h3 className="font-semibold mb-3">Bill Details</h3>
                                    <pre className="text-xs bg-lightBg p-3 rounded overflow-x-auto">{JSON.stringify(d.BillDetails, null, 2)}</pre>
                                </div>
                            )}
                            {Array.isArray(d.AdditionalDetails) && d.AdditionalDetails.length > 0 && (
                                <div className="bg-cardBg rounded-lg p-4 border border-lightBg">
                                    <h3 className="font-semibold mb-3">Additional Details</h3>
                                    <pre className="text-xs bg-lightBg p-3 rounded overflow-x-auto">{JSON.stringify(d.AdditionalDetails, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {payload && (
                <div className="mt-6 grid md:grid-cols-2 gap-6">
                    <div className="bg-white/90 rounded-xl shadow-md p-6 border border-lightBg">
                        <h3 className="font-semibold text-dark mb-3">Meta</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Status Code</span><span className="font-medium">{payload.statuscode}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Timestamp</span><span className="font-medium">{payload.timestamp || "-"}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">UUID</span><span className="font-medium break-all">{payload.ipay_uuid || "-"}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Environment</span><span className="font-medium">{payload.environment || "-"}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Act Code</span><span className="font-medium">{payload.actcode ?? '-'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Order ID</span><span className="font-medium">{payload.orderid ?? '-'}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Internal Code</span><span className="font-medium">{payload.internalCode ?? '-'}</span></div>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(d.enquiryReferenceId || '')}
                                className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md border border-lightBg bg-cardBg hover:border-secondary"
                            >Copy Enquiry Ref</button>
                        </div>
                    </div>

                    <div className="bg-white/90 rounded-xl shadow-md p-6 border border-lightBg">
                        <h3 className="font-semibold text-dark mb-3">Actions</h3>
                        <div className="flex gap-3">
                            <Link href="/" className="px-4 py-2 rounded-md border border-lightBg bg-cardBg hover:border-secondary">Back Home</Link>
                            <button className="px-4 py-2 rounded-md bg-accent text-dark font-bold hover:bg-secondary">Download Receipt</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function VerifyPaymentPage() {
    return (
        <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-8 text-gray-600">Loading payment status...</div>}>
            <VerifyPaymentInner />
        </Suspense>
    );
}


