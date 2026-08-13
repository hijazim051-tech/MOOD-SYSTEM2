import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useBranch } from "../context/BranchContext";

type Account = "cash" | "bank" | "balance";
type Direction = "in" | "out";

type Tx = {
  id: string;
  direction: Direction;
  account: Account;
  amount: number;
  description: string;
  occurredAt: string;
  sourceType: string;
};

const input =
  "w-full rounded-xl border border-gray-200 bg-white p-3 outline-none focus:border-emerald-600";

export default function Treasury() {
  const { effectiveBranchId } = useBranch();
  const [rows, setRows] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account>("cash");
  const [direction, setDirection] = useState<Direction>("in");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [effectiveBranchId]);

  async function load() {
    setLoading(true);
    try {
      let query = supabase
        .from("financial_transactions")
        .select("id,direction,account,amount,description,occurred_at,source_type")
        .order("occurred_at", { ascending: false });

      if (effectiveBranchId) query = query.eq("branch_id", effectiveBranchId);

      const { data, error } = await query;
      if (error) throw error;

      setRows(
        (data || []).map((row: any) => ({
          id: String(row.id),
          direction: row.direction as Direction,
          account: row.account as Account,
          amount: Number(row.amount || 0),
          description: String(row.description || ""),
          occurredAt: String(row.occurred_at || ""),
          sourceType: String(row.source_type || ""),
        }))
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر تحميل الرصيد");
    } finally {
      setLoading(false);
    }
  }

  const totals = useMemo(() => {
    let cash = 0;
    let bank = 0;
    let balance = 0;

    for (const row of rows) {
      const signed = row.direction === "in" ? row.amount : -row.amount;
      if (row.account === "cash") cash += signed;
      else if (row.account === "bank") bank += signed;
      else if (row.account === "balance") balance += signed;
    }

    return { cash, bank, balance, total: cash + bank + balance };
  }, [rows]);

  async function addManual() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا");

    const value = Number(amount);
    if (!(value > 0)) return alert("اكتب مبلغًا صحيحًا");
    if (!note.trim()) return alert("اكتب سبب التعديل");

    setSaving(true);
    try {
      const { error } = await supabase.from("financial_transactions").insert({
        branch_id: effectiveBranchId,
        source_type: "manual_adjustment",
        source_id: crypto.randomUUID(),
        direction,
        account,
        amount: value,
        description: `تسوية يدوية: ${note.trim()}`,
        occurred_at: new Date().toISOString(),
      });

      if (error) throw error;

      setAmount("");
      setNote("");
      await load();
      alert("تم حفظ التسوية في السجل المالي");
    } catch (error) {
      alert(error instanceof Error ? error.message : "تعذر حفظ الحركة");
    } finally {
      setSaving(false);
    }
  }

  const Card = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-2xl bg-white p-6 shadow">
      <p className="text-gray-500">{label}</p>
      <p
        className={`mt-2 text-3xl font-black ${
          value < 0 ? "text-red-700" : "text-emerald-800"
        }`}
      >
        {value.toFixed(2)} د.ل
      </p>
    </div>
  );

  return (
    <div dir="rtl" className="space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-black">💵 الرصيد الحالي</h1>
        <p className="mt-2 text-gray-500">
          مصدر واحد للحقيقة: المبيعات والتحصيل تزيد الرصيد، والمشتريات والمصروفات والدفعات تنقصه تلقائيًا.
        </p>
      </header>

      {loading ? (
        <div>جاري التحميل...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card label="الكاش الحالي" value={totals.cash} />
            <Card label="المصرف الحالي" value={totals.bank} />
            <Card label="الرصيد / الذمم" value={totals.balance} />
            <Card label="الإجمالي" value={totals.total} />
          </div>

          <section className="rounded-2xl bg-white p-5 shadow">
            <h2 className="text-xl font-black">تعديل / تسوية الرصيد</h2>
            <p className="mt-1 text-sm text-gray-500">
              لتصحيح فرق حقيقي أو تسجيل مبلغ داخل/خارج لم يمر بفاتورة. العملية الأصلية لا تُحذف، والتسوية تبقى ظاهرة في السجل.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <select
                className={input}
                value={account}
                onChange={(e) => setAccount(e.target.value as Account)}
              >
                <option value="cash">كاش</option>
                <option value="bank">مصرف</option>
                <option value="balance">رصيد / ذمم</option>
              </select>

              <select
                className={input}
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
              >
                <option value="in">زيادة / داخل</option>
                <option value="out">نقص / خارج</option>
              </select>

              <input
                type="number"
                min="0.01"
                step="0.01"
                className={input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="المبلغ"
              />

              <input
                className={input}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="سبب التعديل *"
              />
            </div>

            <button
              disabled={saving}
              onClick={() => void addManual()}
              className="mt-3 rounded-xl bg-gray-900 px-6 py-3 font-black text-white disabled:opacity-50"
            >
              {saving ? "جاري الحفظ..." : "حفظ التسوية"}
            </button>
          </section>

          <section className="overflow-x-auto rounded-2xl bg-white p-5 shadow">
            <h2 className="mb-4 text-xl font-black">آخر الحركات</h2>
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50">
                <tr>
                  <Th>الوقت</Th>
                  <Th>البيان</Th>
                  <Th>الحساب</Th>
                  <Th>الحركة</Th>
                  <Th>المبلغ</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr key={row.id} className="border-b">
                    <Td>{new Date(row.occurredAt).toLocaleString("ar-LY")}</Td>
                    <Td>{row.description}</Td>
                    <Td>
                      {row.account === "cash"
                        ? "كاش"
                        : row.account === "bank"
                          ? "مصرف"
                          : "رصيد / ذمم"}
                    </Td>
                    <Td>
                      <span
                        className={
                          row.direction === "in"
                            ? "font-bold text-emerald-700"
                            : "font-bold text-red-700"
                        }
                      >
                        {row.direction === "in" ? "داخل" : "خارج"}
                      </span>
                    </Td>
                    <Td>{row.amount.toFixed(2)} د.ل</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="p-3 text-right">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="p-3">{children}</td>;
}
