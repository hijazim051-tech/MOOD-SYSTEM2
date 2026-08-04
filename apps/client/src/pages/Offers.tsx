import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { logActivity } from "../lib/activityLog";
import { useBranch } from "../context/BranchContext";
import { getBranchStock } from "../lib/branchStock";

type Material = {
  id: number;
  productId: number;
  productName: string;
  detailName: string;
  stock: number;
  sellPrice: number;
};

type Offer = {
  id: number;
  productDetailId: number;
  title: string;
  originalPrice: number;
  offerPrice: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  notes: string;
  productName: string;
  detailName: string;
};

const todayInput = () => new Date().toISOString().slice(0, 10);

export default function Offers() {
  const { effectiveBranchId } = useBranch();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [productDetailId, setProductDetailId] = useState("");
  const [title, setTitle] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [startsAt, setStartsAt] = useState(todayInput());
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    void loadAll();
  }, [effectiveBranchId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [productsResult, detailsResult, offersResult, branchRows] = await Promise.all([
        supabase.from("products").select("id,name"),
        supabase
          .from("product_details")
          .select("id,product_id,name,color,stock,sell_price,unit_sell_price")
          .order("name"),
        supabase
          .from("offers")
          .select(`
            id, product_detail_id, title, original_price, offer_price,
            starts_at, ends_at, is_active, notes, branch_id,
            product_details (name, color, products (name))
          `)
          .order("created_at", { ascending: false }),
        getBranchStock(effectiveBranchId),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (detailsResult.error) throw detailsResult.error;
      if (offersResult.error) throw offersResult.error;

      const productMap = new Map<number, string>(
        (productsResult.data || []).map((row: any) => [
          Number(row.id),
          String(row.name || "منتج"),
        ])
      );

      const branchStockMap = new Map(branchRows.map((row) => [row.productDetailId, row.stock]));
      setMaterials(
        (detailsResult.data || []).map((row: any) => ({
          id: Number(row.id),
          productId: Number(row.product_id || 0),
          productName: productMap.get(Number(row.product_id)) || "منتج",
          detailName: String(row.color || row.name || "خيار"),
          stock: Number(branchStockMap.get(Number(row.id)) || 0),
          sellPrice: Number(row.unit_sell_price || row.sell_price || 0),
        }))
      );

      const scopedOfferRows = effectiveBranchId
        ? (offersResult.data || []).filter((row: any) => String(row.branch_id || "") === effectiveBranchId)
        : (offersResult.data || []);
      setOffers(
        scopedOfferRows.map((row: any) => {
          const detail = Array.isArray(row.product_details)
            ? row.product_details[0]
            : row.product_details;
          const product = Array.isArray(detail?.products)
            ? detail.products[0]
            : detail?.products;
          return {
            id: Number(row.id),
            productDetailId: Number(row.product_detail_id),
            title: String(row.title || "عرض"),
            originalPrice: Number(row.original_price || 0),
            offerPrice: Number(row.offer_price || 0),
            startsAt: String(row.starts_at || "").slice(0, 10),
            endsAt: row.ends_at ? String(row.ends_at).slice(0, 10) : null,
            isActive: Boolean(row.is_active),
            notes: String(row.notes || ""),
            productName: String(product?.name || "منتج"),
            detailName: String(detail?.color || detail?.name || "خيار"),
          };
        })
      );
    } catch (error: any) {
      alert(error?.message || "تعذر تحميل العروض");
    } finally {
      setLoading(false);
    }
  }

  const selectedMaterial = useMemo(
    () => materials.find((item) => item.id === Number(productDetailId)),
    [materials, productDetailId]
  );

  const filteredOffers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((offer) =>
      `${offer.title} ${offer.productName} ${offer.detailName}`
        .toLowerCase()
        .includes(q)
    );
  }, [offers, search]);

  function resetForm() {
    setEditingId(null);
    setProductDetailId("");
    setTitle("");
    setOfferPrice("");
    setStartsAt(todayInput());
    setEndsAt("");
    setNotes("");
  }

  function editOffer(offer: Offer) {
    setEditingId(offer.id);
    setProductDetailId(String(offer.productDetailId));
    setTitle(offer.title);
    setOfferPrice(String(offer.offerPrice));
    setStartsAt(offer.startsAt || todayInput());
    setEndsAt(offer.endsAt || "");
    setNotes(offer.notes);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveOffer() {
    if (!effectiveBranchId) return alert("اختر فرعًا محددًا قبل حفظ العرض");
    if (!selectedMaterial) return alert("اختار المنتج");
    const price = Number(offerPrice);
    if (!(price > 0)) return alert("اكتب سعر عرض صحيح");
    if (endsAt && endsAt < startsAt) return alert("تاريخ النهاية يجب أن يكون بعد البداية");

    setSaving(true);
    try {
      const payload = {
        product_detail_id: selectedMaterial.id,
        title: title.trim() || `عرض ${selectedMaterial.productName}`,
        original_price: selectedMaterial.sellPrice,
        offer_price: price,
        starts_at: startsAt,
        ends_at: endsAt || null,
        notes: notes.trim() || null,
        is_active: true,
        branch_id: effectiveBranchId,
      };

      if (editingId) {
        const { error } = await supabase.from("offers").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("offers").insert(payload);
        if (error) throw error;
      }

      await logActivity({
        action: editingId ? "update_offer" : "create_offer",
        entityType: "offers",
        entityId: String(editingId || selectedMaterial.id),
        entityLabel: editingId ? "تعديل عرض" : "إضافة عرض",
        description: `${payload.title} — ${payload.offer_price} د.ل`,
        notifyOwner: true,
      });

      resetForm();
      await loadAll();
    } catch (error: any) {
      alert(error?.message || "تعذر حفظ العرض");
    } finally {
      setSaving(false);
    }
  }

  async function toggleOffer(offer: Offer) {
    const { error } = await supabase
      .from("offers")
      .update({ is_active: !offer.isActive })
      .eq("id", offer.id);
    if (error) return alert(error.message);
    await logActivity({
      action: !offer.isActive ? "activate_offer" : "deactivate_offer",
      entityType: "offers",
      entityId: String(offer.id),
      entityLabel: !offer.isActive ? "تفعيل عرض" : "إيقاف عرض",
      description: offer.title,
      notifyOwner: true,
    });
    await loadAll();
  }

  async function deleteOffer(offer: Offer) {
    if (!confirm(`حذف العرض: ${offer.title}؟`)) return;
    const { error } = await supabase.from("offers").delete().eq("id", offer.id);
    if (error) return alert(error.message);
    await logActivity({
      action: "delete_offer",
      entityType: "offers",
      entityId: String(offer.id),
      entityLabel: "حذف عرض",
      description: offer.title,
      notifyOwner: true,
    });
    await loadAll();
  }

  if (loading) return <div className="p-8" dir="rtl">جاري تحميل العروض...</div>;

  return (
    <div className="space-y-6 p-4 md:p-8" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold">العروض</h1>
        <p className="mt-2 text-gray-500">السعر الفعّال يظهر تلقائيًا في طلب جديد أثناء مدة العرض.</p>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow">
        <h2 className="mb-4 text-xl font-bold">{editingId ? "تعديل العرض" : "إضافة عرض جديد"}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="font-semibold">المنتج</span>
            <select value={productDetailId} onChange={(e) => setProductDetailId(e.target.value)} className="w-full rounded-xl border p-3">
              <option value="">اختار المنتج</option>
              {materials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.productName} — {item.detailName} | السعر {item.sellPrice} | المخزون {item.stock}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2"><span className="font-semibold">اسم العرض</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border p-3" placeholder="مثال: عرض نهاية الأسبوع" /></label>
          <label className="space-y-2"><span className="font-semibold">سعر العرض</span><input type="number" min="0" step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} className="w-full rounded-xl border p-3" /></label>
          <label className="space-y-2"><span className="font-semibold">بداية العرض</span><input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-xl border p-3" /></label>
          <label className="space-y-2"><span className="font-semibold">نهاية العرض (اختياري)</span><input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="w-full rounded-xl border p-3" /></label>
          <label className="space-y-2"><span className="font-semibold">ملاحظات</span><input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-xl border p-3" /></label>
        </div>
        {selectedMaterial && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm">
            السعر الأصلي: <b>{selectedMaterial.sellPrice.toFixed(2)} د.ل</b> — الخصم: <b>{Math.max(0, selectedMaterial.sellPrice - Number(offerPrice || 0)).toFixed(2)} د.ل</b>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button onClick={() => void saveOffer()} disabled={saving} className="rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white disabled:opacity-50">{saving ? "جاري الحفظ..." : editingId ? "حفظ التعديل" : "إضافة العرض"}</button>
          {editingId && <button onClick={resetForm} className="rounded-xl bg-gray-100 px-6 py-3 font-bold">إلغاء</button>}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold">قائمة العروض ({offers.length})</h2>
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border p-3" placeholder="بحث في العروض" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="border-b bg-gray-50"><th className="p-3 text-right">العرض</th><th className="p-3 text-right">المنتج</th><th className="p-3">الأصلي</th><th className="p-3">العرض</th><th className="p-3">الفترة</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr></thead>
            <tbody>
              {filteredOffers.map((offer) => (
                <tr key={offer.id} className="border-b">
                  <td className="p-3 font-bold">{offer.title}</td>
                  <td className="p-3">{offer.productName} — {offer.detailName}</td>
                  <td className="p-3 text-center">{offer.originalPrice.toFixed(2)}</td>
                  <td className="p-3 text-center font-bold text-emerald-700">{offer.offerPrice.toFixed(2)}</td>
                  <td className="p-3 text-center">{offer.startsAt} → {offer.endsAt || "مفتوح"}</td>
                  <td className="p-3 text-center"><span className={`rounded-full px-3 py-1 font-bold ${offer.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{offer.isActive ? "فعال" : "متوقف"}</span></td>
                  <td className="p-3"><div className="flex flex-wrap justify-center gap-2"><button onClick={() => editOffer(offer)} className="rounded-lg bg-blue-100 px-3 py-2 text-blue-700">تعديل</button><button onClick={() => void toggleOffer(offer)} className="rounded-lg bg-amber-100 px-3 py-2 text-amber-700">{offer.isActive ? "إيقاف" : "تفعيل"}</button><button onClick={() => void deleteOffer(offer)} className="rounded-lg bg-red-100 px-3 py-2 text-red-700">حذف</button></div></td>
                </tr>
              ))}
              {filteredOffers.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-500">لا توجد عروض.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
