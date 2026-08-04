import type { Product, ProductDetail } from "../../data/products";

type Props = {
  product: Product;
  onEditDetail: (detail: ProductDetail) => void;
  onDeleteDetail: (detailId: number) => void;
};

export default function ProductDetails({ product, onEditDetail, onDeleteDetail }: Props) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {product.details.map((detail) => (
        <div key={detail.id} className="rounded-2xl bg-white p-6 shadow">
          <h3 className="text-2xl font-bold">{detail.name}</h3>

          <div className="mt-4 space-y-2 text-gray-600">
            <p>💰 سعر الشراء: {detail.buyPrice} د.ل</p>
            <p>💵 سعر البيع: {detail.sellPrice} د.ل</p>
            <p>📦 الكمية: {detail.stock}</p>
            <p>⚠️ حد التنبيه: {detail.alertLimit}</p>
            <p>⭐ مهم: {detail.isImportant ? "نعم" : "لا"}</p>
          </div>

          <div
            className={`mt-5 rounded-xl px-4 py-2 text-center font-semibold ${
              detail.isImportant && detail.stock <= detail.alertLimit
                ? "bg-red-100 text-red-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            {detail.isImportant && detail.stock <= detail.alertLimit
              ? "قارب على النفاد"
              : "متوفر"}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => onEditDetail(detail)} className="rounded-xl bg-blue-100 px-4 py-2 font-semibold text-blue-700">
              تعديل
            </button>
            <button onClick={() => onDeleteDetail(detail.id)} className="rounded-xl bg-red-100 px-4 py-2 font-semibold text-red-700">
              حذف
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}