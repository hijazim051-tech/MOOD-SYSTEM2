import type { Product } from "../../data/products";

type Props = {
  products: Product[];
  onSelect: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (productId: number) => void;
};

export default function ProductCards({ products, onSelect, onEdit, onDelete }: Props) {
  const totalStock = (product: Product) =>
    product.details.reduce((sum, item) => sum + item.stock, 0);

  return (
    <div className="grid grid-cols-3 gap-6">
      {products.map((product) => (
        <div key={product.id} className="rounded-2xl bg-white p-6 shadow">
          <button onClick={() => onSelect(product)} className="w-full text-right">
            <div className="mb-4 text-6xl">{product.icon}</div>
            <h2 className="text-2xl font-bold">{product.name}</h2>
            <div className="mt-4 space-y-2 text-gray-600">
              <p>🎨 عدد الألوان: {product.details.length}</p>
              <p>📦 إجمالي المخزون: {totalStock(product)}</p>
            </div>
          </button>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button onClick={() => onSelect(product)} className="rounded-xl bg-emerald-100 px-3 py-2 font-semibold text-emerald-700">
              فتح
            </button>
            <button onClick={() => onEdit(product)} className="rounded-xl bg-blue-100 px-3 py-2 font-semibold text-blue-700">
              تعديل
            </button>
            <button onClick={() => onDelete(product.id)} className="rounded-xl bg-red-100 px-3 py-2 font-semibold text-red-700">
              حذف
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}