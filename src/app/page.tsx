"use client";

import { useEffect, useMemo, useState } from "react";

type Biller = {
  billerId: string;
  billerName: string;
  isAvailable: boolean;
  coverage: string;
  iconUrl?: string;
};

type BillerMeta = {
  totalPages: number;
  currentPage: number;
  totalRecords: number;
  recordsOnCurrentPage: number;
  recordFrom: number;
  recordTo: number;
};

const DEFAULT_CATEGORY = process.env.NEXT_PUBLIC_FASTAG_CATEGORY_KEY || "C10";

async function fetchBillers(pageNumber: number, recordsPerPage: number, categoryKey: string): Promise<{ records: Biller[]; meta: BillerMeta }> {
  const res = await fetch("/api/bbps/billers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pagination: { pageNumber, recordsPerPage },
      filters: { categoryKey },
    }),
  });
  const data: any = await res.json();
  const list = data?.data?.records || data?.records || data?.data || [];
  const records: Biller[] = (list as any[]).map((b) => ({
    billerId: b.billerId || b.id || "",
    billerName: b.billerName || b.name || "",
    isAvailable: typeof b.isAvailable === "boolean" ? b.isAvailable : b.billerStatus === "ACTIVE",
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

type EnquiryResponse = {
  enquiryReferenceId: string;
  amount: number;
  customerName?: string;
  policyStatus?: string;
  dueDate?: string;
};

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
  return {
    enquiryReferenceId: e?.enquiryReferenceId || externalRef,
    amount: e?.BillAmount ?? e?.amount ?? 0,
    customerName: e?.CustomerName || e?.customerName,
    policyStatus: e?.policyStatus,
    dueDate: e?.BillDueDate || e?.dueDate,
  };
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [billers, setBillers] = useState<Biller[]>([]);
  const [meta, setMeta] = useState<BillerMeta | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortAZ, setSortAZ] = useState(true);
  const [observerAttached, setObserverAttached] = useState(false);
  const [selectedBiller, setSelectedBiller] = useState<Biller | null>(null);
  const [billerDetails, setBillerDetails] = useState<BillerDetails | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [enquiry, setEnquiry] = useState<EnquiryResponse | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [fetchingEnquiry, setFetchingEnquiry] = useState(false);


  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoading(true);
        const { records, meta } = await fetchBillers(pageNumber, 24, DEFAULT_CATEGORY);
        if (aborted) return;
        setBillers((prev) => {
          const seen = new Set(prev.map((p) => p.billerId));
          const merged = [...prev];
          for (const r of records) if (!seen.has(r.billerId)) merged.push(r);
          return merged;
        });
        setMeta(meta);
      } catch (e) {
        // no-op: could show toast
      } finally {
        if (!aborted) {
          setLoading(false);
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, [pageNumber]);

  // Infinite scroll observer
  useEffect(() => {
    if (observerAttached) return;
    const sentinel = document.getElementById("sentinel");
    if (!sentinel) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting) return;
      if (loading) return;
      if (meta && pageNumber >= (meta.totalPages || 1)) return;
      setPageNumber((p) => p + 1);
    }, { rootMargin: "200px" });
    io.observe(sentinel);
    setObserverAttached(true);
    return () => io.disconnect();
  }, [observerAttached, loading, meta, pageNumber]);

  // (dropdown preloading removed)

  const openBiller = async (b: Biller) => {
    setSelectedBiller(b);
    setDrawerOpen(true);
    setBillerDetails(null);
    setFormData({});
    setEnquiry(null);
    try {
      setFetchingDetails(true);
      const details = await fetchBillerDetailsApi(b.billerId);
      setBillerDetails(details);
    } finally {
      setFetchingDetails(false);
    }
  };

  // (inline open via dropdown removed)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!billerDetails || !selectedBiller) return;
    for (const p of billerDetails.inputParameters) {
      const value = formData[p.paramName] || "";
      if (p.mandatory && !value) return alert(`Please enter ${p.name}`);
      if (value && p.regex && !(new RegExp(p.regex).test(value))) return alert(`Invalid ${p.name}`);
      if (value && value.length < p.minLength) return alert(`${p.name} must be at least ${p.minLength} characters`);
    }
    try {
      setFetchingEnquiry(true);
      const resp = await preEnquiryApi(selectedBiller.billerId, formData);
      setEnquiry(resp);
    } finally {
      setFetchingEnquiry(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = billers;
    if (q) arr = arr.filter((b) => b.billerName.toLowerCase().includes(q));
    if (onlyAvailable) arr = arr.filter((b) => b.isAvailable);
    arr = [...arr].sort((a, b) => (sortAZ ? a.billerName.localeCompare(b.billerName) : b.billerName.localeCompare(a.billerName)));
    return arr;
  }, [billers, search, onlyAvailable, sortAZ]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-lightBg">
      {/* Hero */}
      <section id="hero" className="relative bg-gradient-to-r from-dark to-primary text-white py-16 md:py-24 rounded-b-3xl overflow-hidden shadow-xl">
        <div className="max-w-6xl mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-4">Fast, Secure <span className="text-accent">FASTag</span> Recharge</h1>
            <p className="text-lg md:text-xl text-textLight mb-8">Top-up your FASTag instantly. Discover issuers, verify details, and complete payment—all in one sleek flow.</p>
            <a href="#recharge" className="inline-block bg-accent text-dark font-bold py-3 px-8 rounded-full text-lg shadow-lg hover:bg-secondary transition">Get Started</a>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_0,white_0,transparent_35%),radial-gradient(circle_at_50%_80%,white_0,transparent_35%)]" />
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-3 gap-6">
        {[
          { icon: "⚡", title: "Instant", desc: "Recharge in seconds with real-time validation." },
          { icon: "🔒", title: "Secure", desc: "Server-routed APIs keep your secrets safe." },
          { icon: "🧭", title: "Guided", desc: "Clear steps ensure no mistakes before pay." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border border-lightBg bg-cardBg p-6 shadow-sm">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="font-bold text-xl mb-2 text-dark">{f.title}</h3>
            <p className="text-gray-600">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Recharge Flow */}
      <section id="recharge" className="max-w-6xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-dark mb-2">Recharge your <span className="text-primary">FASTag</span></h1>
          <p className="text-gray-600">Search and select your FASTag issuer to continue.</p>
        </div>

        <div className="sticky top-16 z-30 bg-lightBg/90 backdrop-blur mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between p-3 rounded-lg border border-lightBg">
          <div className="relative md:flex-1 md:max-w-xl">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              placeholder="Search your FASTag issuer..."
              className="w-full px-4 py-3 pl-4 border border-lightBg rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-cardBg shadow-sm"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</div>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="accent-current text-primary" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
              Only available
            </label>
            <button type="button" onClick={() => setSortAZ((v) => !v)} className="px-3 py-2 border border-lightBg rounded-lg bg-cardBg text-sm hover:border-secondary">
              Sort: {sortAZ ? "A–Z" : "Z–A"}
            </button>
          </div>
        </div>



        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-cardBg border border-lightBg rounded-xl p-6 animate-pulse">
                <div className="w-16 h-16 rounded-lg bg-lightBg mb-4" />
                <div className="h-4 w-3/4 bg-lightBg rounded mb-2" />
                <div className="h-3 w-1/2 bg-lightBg rounded" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div id="billers" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map((b) => (
                <button
                  key={b.billerId}
                  onClick={() => b.isAvailable && openBiller(b)}
                  className={`group text-left bg-cardBg border ${b.isAvailable ? "border-lightBg hover:border-primary hover:shadow-lg hover:-translate-y-0.5" : "border-lightBg opacity-60 cursor-not-allowed"} rounded-xl p-6 transition-all`}
                  disabled={!b.isAvailable}
                >
                  <div className="flex items-center mb-4">
                    <div className="w-14 h-14 bg-white rounded-lg flex items-center justify-center mr-4 shadow-inner overflow-hidden ring-1 ring-transparent group-hover:ring-primary/30 transition">
                      {b.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.iconUrl} alt={b.billerName} className="w-10 h-10 object-contain" />
                      ) : (
                        <span className="text-2xl">🚗</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 line-clamp-1">{b.billerName}</h3>
                      <div className="mt-1 inline-flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 line-clamp-1">{b.coverage}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-lightBg text-secondary">FASTag</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center text-[10px] px-2 py-1 rounded-full ${b.isAvailable ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${b.isAvailable ? "bg-green-600" : "bg-red-600"}`} />
                      {b.isAvailable ? "Available" : "Unavailable"}
                    </span>
                    <span className="text-secondary font-medium group-hover:underline">Select →</span>
                  </div>
                </button>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center text-gray-500 py-16">
                No billers match your search.
              </div>
            )}
            <div id="sentinel" className="h-12" />
          </>
        )}
      </section>



      {/* Slide-over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-lightBg flex flex-col">
            <div className="p-4 border-b border-lightBg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-inner overflow-hidden">
                  {selectedBiller?.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedBiller.iconUrl} alt={selectedBiller.billerName} className="w-8 h-8 object-contain" />
                  ) : (
                    <span className="text-xl">🚗</span>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{selectedBiller?.billerName}</div>
                  <div className="text-xs text-gray-500">{selectedBiller?.coverage}</div>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {fetchingDetails && (
                <div className="animate-pulse space-y-4">
                  <div className="h-5 bg-lightBg rounded w-1/2" />
                  <div className="h-10 bg-lightBg rounded" />
                  <div className="h-10 bg-lightBg rounded" />
                </div>
              )}
              {!fetchingDetails && billerDetails && (
                <form onSubmit={onSubmit} className="space-y-4">
                  {billerDetails.inputParameters.map((p) => (
                    <div key={p.paramName}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {p.name} {p.mandatory && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type={p.dataType === "NUMERIC" ? "tel" : "text"}
                        value={formData[p.paramName] || ""}
                        onChange={(e) => setFormData((s) => ({ ...s, [p.paramName]: e.target.value }))}
                        placeholder={p.desc}
                        minLength={p.minLength}
                        maxLength={p.maxLength}
                        className="w-full px-3 py-2 border border-lightBg rounded focus:outline-none focus:ring-2 focus:ring-primary bg-cardBg"
                        required={p.mandatory}
                      />
                    </div>
                  ))}
                  <button type="submit" className="w-full bg-primary text-white py-2 rounded font-semibold hover:bg-secondary transition">
                    {fetchingEnquiry ? "Fetching..." : "Verify Amount"}
                  </button>
                </form>
              )}
              {!!enquiry && (
                <div className="mt-6 bg-cardBg border border-lightBg rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-700">Amount</span>
                    <span className="text-2xl font-bold text-primary">₹{new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(enquiry.amount)}</span>
                  </div>
                  {enquiry.customerName && <div className="text-sm text-gray-600">Customer: <span className="font-medium">{enquiry.customerName}</span></div>}
                  {enquiry.policyStatus && <div className="text-sm text-gray-600">Status: <span className="font-medium">{enquiry.policyStatus}</span></div>}
                  {enquiry.dueDate && <div className="text-sm text-gray-600">Due: <span className="font-medium">{new Date(enquiry.dueDate).toLocaleDateString("en-IN")}</span></div>}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-lightBg">
              <button className="w-full px-4 py-2 rounded bg-accent text-dark font-bold hover:bg-secondary transition" disabled={!enquiry}>
                Proceed to Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Testimonials */}
      <section id="testimonials" className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-2xl md:text-3xl font-bold text-dark mb-6">Loved by users</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { name: "Rohit", quote: "Clean and fast. Found my issuer quickly and recharged in under a minute." },
            { name: "Meera", quote: "No confusion, no clutter—just works. The UI is really smooth." },
            { name: "Arjun", quote: "Loading more billers as I scroll is slick. Great experience overall." },
          ].map((t) => (
            <div key={t.name} className="p-6 rounded-2xl border border-lightBg bg-cardBg shadow-sm">
              <p className="text-gray-700 mb-3">“{t.quote}”</p>
              <div className="text-sm text-gray-500">— {t.name}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-2xl md:text-3xl font-bold text-dark mb-6">FAQ</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-lightBg bg-cardBg p-6">
            <h4 className="font-semibold mb-2">Is this secure?</h4>
            <p className="text-gray-600">Yes. All requests are routed via Next.js server APIs with required auth headers.</p>
          </div>
          <div className="rounded-2xl border border-lightBg bg-cardBg p-6">
            <h4 className="font-semibold mb-2">Why can’t I see my issuer?</h4>
            <p className="text-gray-600">Try searching or load more. Billers depend on category and availability.</p>
          </div>
          <div className="rounded-2xl border border-lightBg bg-cardBg p-6">
            <h4 className="font-semibold mb-2">What’s next after select?</h4>
            <p className="text-gray-600">We’ll show an inline details form and pre-enquiry before payment.</p>
          </div>
          <div className="rounded-2xl border border-lightBg bg-cardBg p-6">
            <h4 className="font-semibold mb-2">Dark mode?</h4>
            <p className="text-gray-600">Respects your OS preference and stays readable.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
