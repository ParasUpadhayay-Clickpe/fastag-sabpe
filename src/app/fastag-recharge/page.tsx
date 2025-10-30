"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Biller = {
    billerId: string;
    billerName: string;
    isAvailable: boolean;
    coverage: string;
    iconUrl?: string;
};

type InputParameter = {
    name: string;
    paramName: string;
    dataType: "NUMERIC" | "ALPHANUMERIC";
    minLength: number;
    maxLength: number;
    regex?: string;
    mandatory: boolean;
    desc?: string;
};

type BillerDetails = {
    inputParameters: InputParameter[];
    paymentModes: string[];
    fetchRequirement: string;
    supportValidation: string;
    paymentAmountExactness: "EXACT" | "ANY";
};

type EnquiryResponse = {
    enquiryReferenceId: string;
    amount: number;
    customerName?: string;
    policyStatus?: string;
    dueDate?: string;
    billNumber?: string;
    billPeriod?: string;
    billDate?: string;
    billDueDate?: string;
    customerParams?: Record<string, string>;
    additionalDetails?: Record<string, string>;
    billDetails?: Record<string, string>;
};

type BillerMeta = {
    totalPages: number;
    currentPage: number;
    totalRecords: number;
    recordsOnCurrentPage: number;
    recordFrom: number;
    recordTo: number;
};

const DEFAULT_CATEGORY = process.env.NEXT_PUBLIC_FASTAG_CATEGORY_KEY || "C10"; // Configure category via env if needed

async function fetchBillers(pageNumber: number, recordsPerPage: number): Promise<{ records: Biller[]; meta: BillerMeta }> {
    const res = await fetch("/api/bbps/billers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            pagination: { pageNumber, recordsPerPage },
            filters: { categoryKey: DEFAULT_CATEGORY },
        }),
    });
    const data: any = await res.json();
    const list = data?.data?.records || data?.records || data?.data || [];
    const records: Biller[] = (list as any[]).map((b) => ({
        billerId: b.billerId || b.id || "",
        billerName: b.billerName || b.name || "",
        isAvailable: typeof b.isAvailable === "boolean" ? b.isAvailable : (b.billerStatus === "ACTIVE"),
        coverage: b.coverageCity && b.coverageCity !== "-" ? b.coverageCity : (b.coverageState && b.coverageState !== "-" ? b.coverageState : "PAN India"),
        iconUrl: b.iconUrl,
    }));
    const metaRaw = data?.data?.meta || {};
    const meta: BillerMeta = {
        totalPages: Number(metaRaw.totalPages || 1),
        currentPage: Number(metaRaw.currentPage || pageNumber || 1),
        totalRecords: Number(metaRaw.totalRecords || records.length),
        recordsOnCurrentPage: Number(metaRaw.recordsOnCurrentPage || records.length),
        recordFrom: Number(metaRaw.recordFrom || 1),
        recordTo: Number(metaRaw.recordTo || records.length),
    };
    return { records, meta };
}

// Formatting helpers for beautiful UI
function normalizeNA(value?: string): string | undefined {
    if (!value) return value;
    const v = String(value).trim();
    if (!v || v === "NA" || v === "N/A" || v === "-" || v === "01/01/1900") return undefined;
    return v;
}

function formatINR(amount: number | string | undefined, opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }): string {
    const n = typeof amount === "number" ? amount : parseFloat(String(amount || 0));
    return new Intl.NumberFormat("en-IN", opts).format(Number.isFinite(n) ? n : 0);
}

function formatDate(value?: string): string | undefined {
    const v = normalizeNA(value);
    if (!v) return undefined;
    // Accept dd/mm/yyyy from API as is; also try parsing to readable format
    const parts = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (parts) {
        const [_, dd, mm, yyyy] = parts;
        const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (!isNaN(d.getTime())) return d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    }
    const d2 = new Date(v);
    if (!isNaN(d2.getTime())) return d2.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    return v;
}

async function fetchBillerDetailsApi(billerId: string): Promise<BillerDetails> {
    const res = await fetch("/api/bbps/biller-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billerId }),
    });
    const data: any = await res.json();
    const details = data?.data || data;
    const paramsSrc = details?.inputParameters || details?.parameters || [];
    const inputParameters: InputParameter[] = (paramsSrc as any[]).map((p: any) => ({
        name: p.desc || p.name,
        paramName: p.name || p.paramName,
        dataType: (p.inputType === "NUMERIC" ? "NUMERIC" : "ALPHANUMERIC") as "NUMERIC" | "ALPHANUMERIC",
        minLength: Number(p.minLength || 0),
        maxLength: Number(p.maxLength || 256),
        regex: p.regex || "",
        mandatory: !!p.mandatory,
        desc: p.desc || "",
    }));
    const paymentModes: string[] = (details?.paymentModes || []).map((m: any) => m?.name || m).filter(Boolean);
    return {
        inputParameters,
        paymentModes: paymentModes.length ? paymentModes : ["UPI", "Internet_Banking", "Debit_Card", "Credit_Card", "Account_Transfer", "NEFT", "Bharat_QR"],
        fetchRequirement: details?.fetchRequirement || "SUPPORTED",
        supportValidation: details?.supportValidation || "SUPPORTED",
        paymentAmountExactness: details?.paymentAmountExactness || "EXACT",
    } as BillerDetails;
}

function extractErrorStatus(data: any): string {
    try {
        return (
            data?.error ||
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

async function preEnquiryApi(billerId: string, inputParameters: Record<string, string>): Promise<EnquiryResponse> {
    const externalRef = `SABPE_${Date.now()}`;
    const res = await fetch("/api/bbps/pre-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billerId, inputParameters, externalRef }),
    });
    const data: any = await res.json();

    // Check for HTTP errors
    if (!res.ok) {
        const msg = extractErrorStatus(data) || "Failed to fetch recharge details";
        throw new Error(msg);
    }

    // Check for error status codes in the response
    const statuscode = data?.statuscode || data?.error?.statuscode;
    const status = data?.status || data?.error?.status;
    const errorStatusCodes = ["ERR", "IAN", "INV", "NF", "NA"];
    const hasErrorStatusCode = statuscode && errorStatusCodes.includes(String(statuscode).toUpperCase());
    const hasErrorStatus = status && /invalid|error|failed|not found|unavailable/i.test(String(status));

    if (hasErrorStatusCode || hasErrorStatus) {
        const msg = extractErrorStatus(data) || "Invalid request";
        throw new Error(msg);
    }

    const e = data?.data || data;
    const toNumber = (val: any): number => {
        const n = parseFloat(String(val ?? "").replace(/[,\s]/g, ""));
        return Number.isFinite(n) ? n : 0;
    };
    const mapListToRecord = (list: any[]): Record<string, string> => {
        const rec: Record<string, string> = {};
        (list || []).forEach((it: any) => {
            if (!it) return;
            const k = String(it.Name || it.name || "").trim();
            const v = String(it.Value || it.value || "").trim();
            if (k) rec[k] = v;
        });
        return rec;
    };

    const customerParams = mapListToRecord(e?.CustomerParamsDetails || e?.customerParamsDetails || []);
    const additionalDetails = mapListToRecord(e?.AdditionalDetails || e?.additionalDetails || []);
    const billDetails = mapListToRecord(e?.BillDetails || e?.billDetails || []);

    return {
        enquiryReferenceId: e?.enquiryReferenceId || externalRef,
        amount: toNumber(e?.BillAmount ?? e?.amount ?? 0),
        customerName: e?.CustomerName || e?.customerName,
        policyStatus: e?.policyStatus || additionalDetails["status"],
        dueDate: e?.BillDueDate || e?.dueDate,
        billNumber: e?.BillNumber,
        billPeriod: e?.BillPeriod,
        billDate: e?.BillDate,
        billDueDate: e?.BillDueDate,
        customerParams,
        additionalDetails,
        billDetails,
    };
}

export default function FastagRechargePage() {
    const [currentStep, setCurrentStep] = useState(1);
    const [billers, setBillers] = useState<Biller[]>([]);
    const [search, setSearch] = useState("");
    const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
    const [billerDetails, setBillerDetails] = useState<BillerDetails | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [enquiryData, setEnquiryData] = useState<EnquiryResponse | null>(null);
    const [selectedPaymentMode, setSelectedPaymentMode] = useState<string | null>(null);
    const [loadingBillers, setLoadingBillers] = useState(false);
    const [pageNumber, setPageNumber] = useState(1);
    const [meta, setMeta] = useState<BillerMeta | null>(null);
    const [loadingEnquiry, setLoadingEnquiry] = useState(false);
    const [alert, setAlert] = useState<{ type: "info" | "error" | "success"; message: string } | null>(null);

    const statusText = (enquiryData?.policyStatus || enquiryData?.additionalDetails?.["status"] || "").toString();
    const statusTone = /success|active|ok|low balance|valid/i.test(statusText) ? "success" : /pending|processing/i.test(statusText) ? "pending" : /block|inactive|invalid|error|fail|expired/i.test(statusText) ? "error" : "info";
    const statusClasses = statusTone === "success" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : statusTone === "pending" ? "bg-amber-100 text-amber-700 border-amber-300" : statusTone === "error" ? "bg-red-100 text-red-700 border-red-300" : "bg-blue-100 text-blue-700 border-blue-300";
    const availableBalanceRaw = enquiryData?.additionalDetails?.["Available Balance"];
    const rechargeLimitRaw = enquiryData?.additionalDetails?.["Available Recharge Limit"];
    const availableBalance = Number.parseFloat(String(availableBalanceRaw ?? "").replace(/[,\s]/g, ""));
    const rechargeLimit = Number.parseFloat(String(rechargeLimitRaw ?? "").replace(/[,\s]/g, ""));
    const progressPct = Number.isFinite(availableBalance) && Number.isFinite(rechargeLimit) && rechargeLimit > 0 ? Math.max(0, Math.min(100, (availableBalance / rechargeLimit) * 100)) : 0;

    useEffect(() => {
        let abort = false;
        (async () => {
            try {
                setLoadingBillers(true);
                const { records, meta } = await fetchBillers(pageNumber, 9);
                if (!abort) {
                    setBillers(records);
                    setMeta(meta);
                }
            } catch (e: any) {
                if (!abort) setAlert({ type: "error", message: e?.message || "Failed to load FASTag providers" });
            } finally {
                if (!abort) setLoadingBillers(false);
            }
        })();
        return () => {
            abort = true;
        };
    }, [pageNumber]);

    const filteredBillers = useMemo(() => {
        const q = search.toLowerCase();
        return billers.filter((b) => b.billerName.toLowerCase().includes(q));
    }, [billers, search]);

    const selectBiller = async (b: Biller) => {
        setSelectedBiller(b);
        setAlert({ type: "info", message: "Loading FASTag details form..." });
        try {
            const details = await fetchBillerDetailsApi(b.billerId);
            setBillerDetails(details);
            setAlert(null);
            setCurrentStep(2);
        } catch (e: any) {
            setAlert({ type: "error", message: e?.message || "Failed to load biller details" });
        }
    };

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!billerDetails || !selectedBiller) return;

        for (const p of billerDetails.inputParameters) {
            const value = formData[p.paramName] || "";
            if (p.mandatory && !value) {
                setAlert({ type: "error", message: `Please enter ${p.name}` });
                return;
            }
            if (value && p.regex && !(new RegExp(p.regex).test(value))) {
                setAlert({ type: "error", message: `Invalid ${p.name}` });
                return;
            }
            if (value && value.length < p.minLength) {
                setAlert({ type: "error", message: `${p.name} must be at least ${p.minLength} characters` });
                return;
            }
        }

        setCurrentStep(3);
        setLoadingEnquiry(true);
        try {
            const resp = await preEnquiryApi(selectedBiller.billerId, formData);
            setEnquiryData(resp);
        } catch (e: any) {
            setAlert({ type: "error", message: e?.message || "Failed to fetch recharge details" });
            setCurrentStep(2);
        } finally {
            setLoadingEnquiry(false);
        }
    };

    const proceedToPayment = () => {
        if (!selectedPaymentMode) {
            setAlert({ type: "error", message: "Please select a payment mode" });
            return;
        }
        setCurrentStep(4);
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 w-full">
            <div className="mb-6">
                <nav className="text-sm text-gray-500 mb-2">
                    <Link href="/" className="hover:text-[var(--color-primary)]">Home</Link>
                    <span className="px-2">/</span>
                    <span className="text-gray-700">FASTag Recharge</span>
                </nav>
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-600">Recharge FASTag</h1>
                    <p className="text-gray-600 text-lg">Quick, secure FASTag recharge in a sleek flow</p>
                </div>
            </div>

            {alert && (
                <div className={`${alert.type === "error" ? "bg-red-100 border-red-400 text-red-700" : alert.type === "success" ? "bg-green-100 border-green-400 text-green-700" : "bg-blue-100 border-blue-400 text-blue-700"} border px-4 py-3 rounded-lg mb-4`}>
                    {alert.message}
                </div>
            )}

            {/* Progress */}
            <div className="bg-white/90 rounded-xl shadow-md p-6 mb-8 border border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                    {[1, 2, 3, 4].map((step) => (
                        <div key={step} className="flex items-center flex-1 last:flex-none">
                            <div className={`flex flex-col items-center ${currentStep === step ? "opacity-100" : currentStep > step ? "opacity-100" : "opacity-50"}`}>
                                <div className={`w-12 h-12 rounded-full ${currentStep === step ? "bg-gradient-to-r from-emerald-500 to-teal-600 shadow-md" : currentStep > step ? "bg-teal-500" : "bg-slate-300"} text-white flex items-center justify-center font-bold mb-2 text-lg`}>{step}</div>
                                <span className="text-sm font-medium text-gray-700">
                                    {step === 1 ? "Select Issuer" : step === 2 ? "Enter Details" : step === 3 ? "Verify Amount" : "Make Payment"}
                                </span>
                            </div>
                            {step < 4 && <div className={`h-[2px] mx-2 flex-1 ${currentStep > step ? "bg-gradient-to-r from-teal-500 to-emerald-500" : "bg-slate-300"}`} />}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 1 */}
            {currentStep === 1 && (
                <div className="bg-white/90 rounded-xl shadow-md p-8 border border-[var(--color-border)]">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Choose Your FASTag Issuer</h2>
                    <div className="mb-6">
                        <div className="relative">
                            <input value={search} onChange={(e) => setSearch(e.target.value)} type="text" placeholder="Search your FASTag issuer..." className="w-full px-4 py-3 pl-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] shadow-sm" />
                        </div>
                    </div>
                    {loadingBillers ? (
                        <div className="flex justify-center items-center py-12"><div className="spinner border-4 border-gray-200 border-t-emerald-500 rounded-full w-10 h-10 animate-spin" /></div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredBillers.map((b) => (
                                    <button key={b.billerId} onClick={() => selectBiller(b)} className={`text-left bg-white dark:bg-zinc-900 border ${b.isAvailable ? "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:shadow-lg hover:-translate-y-0.5" : "border-[var(--color-border)] opacity-50 cursor-not-allowed"} rounded-xl p-6 transition-all`} disabled={!b.isAvailable}>
                                        <div className="flex items-center mb-4">
                                            <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center mr-4 shadow-inner overflow-hidden">
                                                {b.iconUrl ? (
                                                    <img src={b.iconUrl} alt={b.billerName} className="w-12 h-12 object-contain" />
                                                ) : (
                                                    <span className="text-3xl">🚗</span>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-900">{b.billerName}</h3>
                                                <p className="text-sm text-gray-500">{b.coverage}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className={`inline-flex items-center text-xs ${b.isAvailable ? "text-green-600" : "text-red-600"}`}>
                                                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${b.isAvailable ? "bg-green-600" : "bg-red-600"}`} />
                                                {b.isAvailable ? "Available" : "Unavailable"}
                                            </span>
                                            <span className="text-[var(--color-primary)] hover:brightness-110 font-medium">Select →</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-6 flex items-center justify-between">
                                <span className="text-sm text-gray-600">
                                    {meta ? `Showing ${meta.recordFrom}-${meta.recordTo} of ${meta.totalRecords}` : ""}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                                        disabled={!meta || pageNumber <= 1}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPageNumber((p) => (!meta ? p + 1 : Math.min(meta.totalPages, p + 1)))}
                                        disabled={!meta || pageNumber >= (meta?.totalPages || 1)}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 disabled:opacity-50 hover:bg-gray-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Step 2 */}
            {currentStep === 2 && billerDetails && selectedBiller && (
                <div className="bg-white/90 rounded-xl shadow-md p-8 border border-[var(--color-border)]">
                    <div className="flex items-center mb-6">
                        <button onClick={() => setCurrentStep(1)} className="text-emerald-600 hover:text-teal-700 mr-4">←</button>
                        <h2 className="text-2xl font-bold text-gray-900">Enter FASTag Details</h2>
                    </div>
                    <div className="bg-[var(--color-muted)] dark:bg-zinc-900/60 rounded-lg p-4 mb-6 flex items-center border border-[var(--color-border)]">
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center mr-4 overflow-hidden shadow-inner">
                            {selectedBiller.iconUrl ? (
                                <img src={selectedBiller.iconUrl} alt={selectedBiller.billerName} className="w-10 h-10 object-contain" />
                            ) : (
                                <span className="text-2xl">🚗</span>
                            )}
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900">{selectedBiller.billerName}</h4>
                            <p className="text-sm text-gray-600">{selectedBiller.coverage}</p>
                        </div>
                    </div>
                    <form onSubmit={onSubmit} className="space-y-6">
                        {billerDetails.inputParameters.map((param) => (
                            <div key={param.paramName}>
                                <label className="block text-gray-700 font-semibold mb-2">{param.name} {param.mandatory && <span className="text-red-500">*</span>}</label>
                                <input
                                    type={param.dataType === "NUMERIC" ? "tel" : "text"}
                                    value={formData[param.paramName] || ""}
                                    onChange={(e) => setFormData((s) => ({ ...s, [param.paramName]: e.target.value }))}
                                    placeholder={param.desc}
                                    minLength={param.minLength}
                                    maxLength={param.maxLength}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] shadow-sm"
                                    required={param.mandatory}
                                />
                                {param.desc && <p className="text-sm text-gray-500 mt-1">{param.desc}</p>}
                            </div>
                        ))}
                        <div className="flex gap-4 pt-4">
                            <button type="button" onClick={() => setCurrentStep(1)} className="px-8 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition duration-300">Back</button>
                            <button type="submit" className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-8 py-3 rounded-lg font-bold hover:from-teal-600 hover:to-emerald-500 transition duration-300 shadow-md">Fetch Recharge Details</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Step 3 */}
            {currentStep === 3 && (
                <div className="bg-white/90 rounded-xl shadow-md p-8 border border-[var(--color-border)]">
                    <div className="flex items-center mb-6">
                        <button onClick={() => setCurrentStep(2)} className="text-emerald-600 hover:text-teal-700 mr-4">←</button>
                        <h2 className="text-2xl font-bold text-gray-900">Verify Recharge Details</h2>
                    </div>

                    {loadingEnquiry ? (
                        <div className="flex flex-col justify-center items-center py-12">
                            <div className="spinner mb-4 border-4 border-gray-200 border-t-emerald-500 rounded-full w-10 h-10 animate-spin" />
                            <p className="text-gray-600">Fetching your recharge details...</p>
                        </div>
                    ) : enquiryData ? (
                        <div>
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg p-6 mb-6 shadow-md">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xl font-bold">FASTag Information</h3>
                                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusClasses}`}>{statusText || "Status"}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="flex justify-between"><span>Customer Name:</span><span className="font-semibold">{enquiryData.customerName || "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Status:</span><span className="font-semibold">{statusText || "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Vehicle Number:</span><span className="font-semibold">{enquiryData.customerParams?.["Vehicle Number"] || "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Available Balance:</span><span className="font-semibold">{enquiryData.additionalDetails?.["Available Balance"] ? `₹${formatINR(enquiryData.additionalDetails?.["Available Balance"], { maximumFractionDigits: 0 })}` : "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Recharge Limit:</span><span className="font-semibold">{enquiryData.additionalDetails?.["Available Recharge Limit"] ? `₹${formatINR(enquiryData.additionalDetails?.["Available Recharge Limit"], { maximumFractionDigits: 0 })}` : "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Vehicle Class:</span><span className="font-semibold">{enquiryData.additionalDetails?.["vehicleClassDesc"] || enquiryData.additionalDetails?.["vehicleClass"] || "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Tag ID:</span><span className="font-semibold break-all">{enquiryData.additionalDetails?.["tagId"] || "N/A"}</span></div>
                                    <div className="flex justify-between"><span>Enquiry Ref:</span><span className="font-semibold">{enquiryData.enquiryReferenceId}</span></div>
                                    {formatDate(enquiryData.dueDate) && <div className="flex justify-between"><span>Due Date:</span><span className="font-semibold">{formatDate(enquiryData.dueDate)}</span></div>}
                                </div>
                            </div>
                            {(Number.isFinite(availableBalance) || Number.isFinite(rechargeLimit)) && (availableBalanceRaw || rechargeLimitRaw) && (
                                <div className="bg-white/90 rounded-lg p-6 mb-6 border border-[var(--color-border)]">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-gray-700 font-medium">Balance Overview</span>
                                        <span className="text-sm text-gray-600">{Number.isFinite(availableBalance) ? `₹${formatINR(availableBalance, { maximumFractionDigits: 0 })}` : "-"} / {Number.isFinite(rechargeLimit) ? `₹${formatINR(rechargeLimit, { maximumFractionDigits: 0 })}` : "-"}</span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                                        <div className="h-3 bg-gradient-to-r from-emerald-500 to-teal-600" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    <div className="text-right text-xs text-gray-500 mt-1">{Math.round(progressPct)}%</div>
                                </div>
                            )}
                            <div className="bg-[var(--color-muted)] dark:bg-zinc-900/60 rounded-lg p-6 mb-6 border border-[var(--color-border)]">
                                <div className="flex justify-between items-center mb-4"><span className="text-gray-700 text-lg">Recharge Amount</span><span className="text-3xl font-bold text-emerald-600">₹{formatINR(enquiryData.amount)}</span></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                                    {enquiryData.billNumber && <div className="flex justify-between"><span>Bill Number:</span><span className="font-medium">{enquiryData.billNumber}</span></div>}
                                    {enquiryData.billPeriod && <div className="flex justify-between"><span>Bill Period:</span><span className="font-medium">{enquiryData.billPeriod}</span></div>}
                                    {formatDate(enquiryData.billDate) && <div className="flex justify-between"><span>Bill Date:</span><span className="font-medium">{formatDate(enquiryData.billDate)}</span></div>}
                                    {formatDate(enquiryData.billDueDate) && <div className="flex justify-between"><span>Bill Due Date:</span><span className="font-medium">{formatDate(enquiryData.billDueDate)}</span></div>}
                                </div>
                            </div>
                            <div className="mb-6">
                                <label className="block text-gray-700 font-semibold mb-3">Select Payment Mode</label>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {(billerDetails?.paymentModes?.length ? billerDetails.paymentModes : ["UPI", "Card", "Net Banking", "Wallet"]).map((mode) => {
                                        const icon = mode === "UPI" ? "📱" : mode === "Card" ? "💳" : mode === "Net Banking" ? "🏦" : "👛";
                                        return (
                                            <button key={mode} type="button" onClick={() => setSelectedPaymentMode(mode)} className={`border-2 rounded-lg p-4 text-center transition duration-300 ${selectedPaymentMode === mode ? "border-[var(--color-primary)] bg-[var(--color-muted)] dark:bg-zinc-900/60 ring-2 ring-[var(--color-primary)]/40" : "border-gray-300 hover:border-[var(--color-primary)] hover:shadow-sm"}`}>
                                                <div className="text-2xl mb-2">{icon}</div>
                                                <p className="text-sm font-medium">{mode}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {enquiryData.customerParams && Object.keys(enquiryData.customerParams).length > 0 && (
                                <div className="bg-white/80 dark:bg-zinc-900/60 rounded-lg p-6 mb-6 border border-[var(--color-border)]">
                                    <h4 className="font-semibold mb-3 text-gray-800">Customer Parameters</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        {Object.entries(enquiryData.customerParams).map(([k, v]) => (
                                            <div key={k} className="flex justify-between"><span className="text-gray-600">{k}:</span><span className="font-medium">{v || "-"}</span></div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {enquiryData.additionalDetails && Object.keys(enquiryData.additionalDetails).length > 0 && (
                                <div className="bg-white/80 dark:bg-zinc-900/60 rounded-lg p-6 mb-6 border border-[var(--color-border)]">
                                    <h4 className="font-semibold mb-3 text-gray-800">Additional Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        {Object.entries(enquiryData.additionalDetails).map(([k, v]) => (
                                            <div key={k} className="flex justify-between"><span className="text-gray-600">{k}:</span><span className="font-medium break-all">{v || "-"}</span></div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {enquiryData.billDetails && Object.keys(enquiryData.billDetails).length > 0 && (
                                <div className="bg-white/80 dark:bg-zinc-900/60 rounded-lg p-6 mb-6 border border-[var(--color-border)]">
                                    <h4 className="font-semibold mb-3 text-gray-800">Bill Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                        {Object.entries(enquiryData.billDetails).map(([k, v]) => (
                                            <div key={k} className="flex justify-between"><span className="text-gray-600">{k}:</span><span className="font-medium">{v || "-"}</span></div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setCurrentStep(2)} className="px-8 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition duration-300">Back</button>
                                <button type="button" onClick={proceedToPayment} className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-500 text-white px-8 py-3 rounded-lg font-bold transition duration-300 shadow-md">Proceed to Payment</button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-gray-600">No data</div>
                    )}
                </div>
            )}

            {/* Step 4 */}
            {currentStep === 4 && (
                <div className="bg-white/90 rounded-xl shadow-md p-8 border border-[var(--color-border)]">
                    <div className="text-center py-12">
                        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-[var(--color-primary)] text-4xl">✅</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready for Payment</h2>
                        <p className="text-gray-600 mb-8">Payment gateway integration will be implemented here</p>
                        <div className="bg-[var(--color-muted)] dark:bg-zinc-900/60 rounded-lg p-6 max-w-md mx-auto text-left border border-[var(--color-border)]">
                            <h3 className="font-semibold mb-3">Summary</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-600">Issuer:</span><span className="font-medium">{selectedBiller?.billerName || "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Amount:</span><span className="font-medium">₹{enquiryData ? new Intl.NumberFormat("en-IN").format(enquiryData.amount) : "-"}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Payment Mode:</span><span className="font-medium">{selectedPaymentMode || "-"}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}



