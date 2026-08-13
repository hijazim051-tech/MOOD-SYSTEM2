import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type Row = {
  invoiceId: string;
  invoiceNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  productDetailId: string;
  itemName: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export default function SupplierReports() {
  const { effectiveBranchId, selectedBranch } = useBranch();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, [effectiveBranchId]);

  async function load() {
    setLoading(true);
    setError("");

    let query = supabase
      .from("purchase_invoice_items")
      .select(`
        purchase_invoice_id,
        branch_id,
        product_detail_id,
        item_name_snapshot,
        detail_name_snapshot,
        quantity,
        unit_purchase_price,
        line_subtotal,
        purchase_invoices(
          id,
          invoice_no,
          invoice_date,
          supplier_id,
          supplier_name_snapshot
        )
      `)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (effectiveBranchId) {
      query = query.eq("branch_id", effectiveBranchId);
    }

    const { data, error } = await query;

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(
        (data || []).map((x: any) => {
          const invoice = Array.isArray(x.purchase_invoices)
            ? x.purchase_invoices[0]
            : x.purchase_invoices;

          return {
            invoiceId: String(x.purchase_invoice_id || ""),
            invoiceNo: String(invoice?.invoice_no || ""),
            date: String(invoice?.invoice_date || ""),
            supplierId: String(invoice?.supplier_id || ""),
            supplierName: String(
              invoice?.supplier_name_snapshot || "بدون مورد"
            ),
            productDetailId: String(x.product_detail_id || ""),
            itemName:
              [x.item_name_snapshot, x.detail_name_snapshot]
                .filter(Boolean)
                .join(" — ") || "صنف",
            qty: Number(x.quantity || 0),
            unitPrice: Number(x.unit_purchase_price || 0),
            total: Number(
              x.line_subtotal ??
                Number(x.quantity || 0) *
                  Number(x.unit_purchase_price || 0)
            ),
          };
        })
      );
    }

    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter(
      (r) =>
        !q ||
        `${r.itemName} ${r.supplierName} ${r.invoiceNo}`
          .toLowerCase()
          .includes(q)
    );
  }, [rows, search]);

  const suppliers = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        total: number;
        qty: number;
        lines: number;
        invoices: Set<string>;
      }
    >();

    for (const r of filtered) {
      const k = r.supplierId || r.supplierName;

      const x = map.get(k) || {
        id: k,
        name: r.supplierName,
        total: 0,
        qty: 0,
        lines: 0,
        invoices: new Set<string>(),
      };

      x.total += r.total;
      x.qty += r.qty;
      x.lines++;
      x.invoices.add(r.invoiceId);

      map.set(k, x);
    }

    return [...map.values()]
      .map((x) => ({
        ...x,
        invoicesCount: x.invoices.size,
        average: x.qty ? x.total / x.qty : 0,
      }))
      .sort((a, b) => a.average - b.average);
  }, [filtered]);

  const bestByItem = useMemo(() => {
    const groups = new Map<string, Row[]>();

    for (const r of filtered) {
      const k = r.productDetailId || r.itemName;
      groups.set(k, [...(groups.get(k) || []), r]);
    }

    return [...groups.entries()]
      .map(([key, list]) => {
        const bySupplier = new Map<
          string,
          {
            name: string;
            total: number;
            qty: number;
            last: string;
          }
        >();

        for (const r of list) {
          const k = r.supplierId || r.supplierName;

          const x = bySupplier.get(k) || {
            name: r.supplierName,
            total: 0,
            qty: 0,
            last: r.date,
          };

          x.total += r.total;
          x.qty += r.qty;

          if (r.date > x.last) {
            x.last = r.date;
          }

          bySupplier.set(k, x);
        }

        const ranked = [...bySupplier.values()]
          .map((x) => ({
            ...x,
            avg: x.qty ? x.total / x.qty : 0,
          }))
          .sort((a, b) => a.avg - b.avg);

        return {
          key,
          item: list[0].itemName,
          best: ranked[0],
          alternatives: ranked.slice(1, 4),
        };
      })
      .sort((a, b) => a.item.localeCompare(b.item, "ar"));
  }, [filtered]);

  if (loading) {
    return (
      <div className="p-8 text-xl font-bold">
        جاري تجهيز تقارير الموردين...
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-black">
          تقارير الموردين والأسعار
        </h1>

        <p className="mt-2 text-sm font-bold text-emerald-700">
          الفرع: {selectedBranch?.name || "كل الفروع"}
        </p>

        <p className="mt-2 text-gray-500">
          جميع بنود الفواتير، متوسطات الأسعار، وأرخص مورد لكل صنف.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p className="font-bold">تعذر قراءة بنود الفواتير</p>
          <p className="mt-2 text-sm">{error}</p>
          <p className="mt-2 text-sm">
            إذا استمر الخطأ أرسل الرسالة كما هي.
          </p>
        </div>
      )}

      <input
        className="w-full rounded-xl border bg-white p-3"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="ابحث باسم الصنف أو المورد أو رقم الفاتورة..."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="عدد الموردين" value={suppliers.length} />
        <Card
          title="عدد الفواتير"
          value={new Set(filtered.map((r) => r.invoiceId)).size}
        />
        <Card title="إجمالي البنود" value={filtered.length} />
        <Card
          title="إجمالي المشتريات"
          value={`${filtered
            .reduce((s, r) => s + r.total, 0)
            .toFixed(2)} د.ل`}
        />
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="text-2xl font-black">
          ترتيب الموردين حسب متوسط سعر القطعة
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[700px] text-right">
            <thead>
              <tr className="bg-gray-50">
                <Th>المورد</Th>
                <Th>الفواتير</Th>
                <Th>الكميات</Th>
                <Th>الإجمالي</Th>
                <Th>متوسط القطعة</Th>
              </tr>
            </thead>

            <tbody>
              {suppliers.map((s, i) => (
                <tr key={s.id} className="border-b">
                  <Td>
                    <span className="font-black">
                      #{i + 1} {s.name}
                    </span>
                  </Td>

                  <Td>{s.invoicesCount}</Td>
                  <Td>{s.qty}</Td>
                  <Td>{s.total.toFixed(2)}</Td>

                  <Td>
                    <span
                      className={
                        i === 0
                          ? "rounded-full bg-emerald-100 px-3 py-1 font-black text-emerald-700"
                          : ""
                      }
                    >
                      {s.average.toFixed(2)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="text-2xl font-black">
          أفضل مورد لكل صنف
        </h2>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {bestByItem.map((x) => (
            <article
              key={x.key}
              className="rounded-xl border p-4"
            >
              <h3 className="font-black">{x.item}</h3>

              {x.best ? (
                <>
                  <p className="mt-2 text-emerald-700">
                    الأرخص: <b>{x.best.name}</b> — متوسط{" "}
                    {x.best.avg.toFixed(2)} د.ل
                  </p>

                  {x.alternatives.length > 0 && (
                    <p className="mt-2 text-sm text-gray-500">
                      بدائل:{" "}
                      {x.alternatives
                        .map(
                          (a) =>
                            `${a.name} (${a.avg.toFixed(2)})`
                        )
                        .join("، ")}
                    </p>
                  )}
                </>
              ) : (
                <p>لا توجد بيانات</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="text-2xl font-black">
          كل بنود الفواتير
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-right">
            <thead>
              <tr className="bg-gray-50">
                <Th>التاريخ</Th>
                <Th>الفاتورة</Th>
                <Th>المورد</Th>
                <Th>الصنف</Th>
                <Th>الكمية</Th>
                <Th>سعر الوحدة</Th>
                <Th>الإجمالي</Th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={`${r.invoiceId}-${i}`}
                  className="border-b"
                >
                  <Td>{r.date}</Td>
                  <Td>
                    {r.invoiceNo || r.invoiceId.slice(0, 8)}
                  </Td>
                  <Td>{r.supplierName}</Td>
                  <Td>{r.itemName}</Td>
                  <Td>{r.qty}</Td>
                  <Td>{r.unitPrice.toFixed(2)}</Td>
                  <Td>{r.total.toFixed(2)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <p className="text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="p-3">{children}</td>;
}