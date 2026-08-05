import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";

type CustomerSuggestion = {
  customerName: string;
  customerPhone: string;
  recipientPhone: string;
  occasion: string;
  address: string;
  notes: string;
};

export type CustomerInfoData = {
  customerName: string;
  customerPhone: string;
  recipientPhone: string;
  occasion: string;
  deliveryDate: string;
  deliveryTime: string;
  address: string;
  notes: string;
};

type Props = {
  value: CustomerInfoData;
  onChange: (value: CustomerInfoData) => void;
};

export default function CustomerInfo({ value, onChange }: Props) {
  const { effectiveBranchId } = useBranch();
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const requestIdRef = useRef(0);

  const normalizedName = useMemo(
    () => value.customerName.trim(),
    [value.customerName]
  );

  useEffect(() => {
    if (normalizedName.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        let query = supabase
          .from("orders")
          .select("customer_name,customer_phone,recipient_phone,occasion,delivery_address,notes,created_at,branch_id")
          .ilike("customer_name", `%${normalizedName}%`)
          .order("created_at", { ascending: false })
          .limit(30);
        if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);
        const { data, error } = await query;

        if (error) throw error;
        if (requestId !== requestIdRef.current) return;

        const seen = new Set<string>();
        const unique = (data || [])
          .map((row: any) => ({
            customerName: String(row.customer_name || "").trim(),
            customerPhone: String(row.customer_phone || "").trim(),
            recipientPhone: String(row.recipient_phone || "").trim(),
            occasion: String(row.occasion || "").trim(),
            address: String(row.delivery_address || "").trim(),
            notes: String(row.notes || "").trim(),
          }))
          .filter((item) => {
            if (!item.customerName) return false;
            const key = `${item.customerName.toLowerCase()}__${item.customerPhone}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 8);

        setSuggestions(unique);
        setShowSuggestions(unique.length > 0);
      } catch (error) {
        console.error("تعذر تحميل العملاء السابقين:", error);
        setSuggestions([]);
      } finally {
        if (requestId === requestIdRef.current) setLoadingSuggestions(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [normalizedName, effectiveBranchId]);

  function selectCustomer(customer: CustomerSuggestion) {
    onChange({
      ...value,
      customerName: customer.customerName,
      customerPhone: customer.customerPhone,
      recipientPhone: customer.recipientPhone || value.recipientPhone,
      occasion: customer.occasion || value.occasion,
      address: customer.address || value.address,
      notes: value.notes || customer.notes,
    });
    setShowSuggestions(false);
  }
  function update(field: keyof CustomerInfoData, fieldValue: string) {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <h2 className="mb-5 text-2xl font-bold">بيانات العميل</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="relative">
          <input
            value={value.customerName}
            onChange={(e) => {
              update("customerName", e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => window.setTimeout(() => setShowSuggestions(false), 180)}
            className="w-full rounded-xl border p-3"
            placeholder="اسم العميل"
            autoComplete="off"
          />
          {loadingSuggestions && (
            <span className="absolute left-3 top-3 text-xs text-gray-400">جاري البحث...</span>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white shadow-xl">
              {suggestions.map((customer) => (
                <button
                  key={`${customer.customerName}-${customer.customerPhone}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectCustomer(customer)}
                  className="block w-full border-b px-4 py-3 text-right hover:bg-emerald-50 last:border-b-0"
                >
                  <p className="font-bold text-gray-900">{customer.customerName}</p>
                  <p className="mt-1 text-sm text-gray-500">{customer.customerPhone || "بدون رقم"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          value={value.customerPhone}
          onChange={(e) => update("customerPhone", e.target.value)}
          className="rounded-xl border p-3"
          placeholder="رقم الزبون"
        />

        <input
          value={value.recipientPhone}
          onChange={(e) => update("recipientPhone", e.target.value)}
          className="rounded-xl border p-3"
          placeholder="رقم مستلم الهدية (اختياري)"
        />

        <input
          value={value.occasion}
          onChange={(e) => update("occasion", e.target.value)}
          className="rounded-xl border p-3"
          placeholder="المناسبة"
        />

        <input
          type="date"
          value={value.deliveryDate}
          onChange={(e) => update("deliveryDate", e.target.value)}
          className="rounded-xl border p-3"
        />

        <input
          type="time"
          value={value.deliveryTime}
          onChange={(e) => update("deliveryTime", e.target.value)}
          className="rounded-xl border p-3"
        />

        <textarea
          value={value.notes}
          onChange={(e) => update("notes", e.target.value)}
          className="rounded-xl border p-3 md:col-span-2"
          placeholder="ملاحظات"
          rows={3}
        />
      </div>
    </div>
  );
}