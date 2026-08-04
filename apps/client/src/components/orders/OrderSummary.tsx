type Props = {
  itemsTotal: number;
  deliveryFee: number;
  discount: number;
  paidAmount: number;
};

export default function OrderSummary({
  itemsTotal,
  deliveryFee,
  discount,
  paidAmount,
}: Props) {
  const total = itemsTotal + deliveryFee - discount;
  const remaining = total - paidAmount;

  return (
    <div className="rounded-2xl bg-white p-6 shadow" dir="rtl">
      <h2 className="mb-6 text-2xl font-bold">ملخص الطلب</h2>

      <div className="space-y-4 text-lg">

        <div className="flex justify-between">
          <span>إجمالي المنتجات</span>
          <span>{itemsTotal.toFixed(2)} د.ل</span>
        </div>

        <div className="flex justify-between">
          <span>التوصيل</span>
          <span>{deliveryFee.toFixed(2)} د.ل</span>
        </div>

        <div className="flex justify-between">
          <span>الخصم</span>
          <span>- {discount.toFixed(2)} د.ل</span>
        </div>

        <hr />

        <div className="flex justify-between text-2xl font-bold text-emerald-700">
          <span>الإجمالي</span>
          <span>{total.toFixed(2)} د.ل</span>
        </div>

        <div className="flex justify-between">
          <span>المدفوع</span>
          <span>{paidAmount.toFixed(2)} د.ل</span>
        </div>

        <div className="flex justify-between text-xl font-bold text-red-600">
          <span>المتبقي</span>
          <span>{remaining.toFixed(2)} د.ل</span>
        </div>

      </div>
    </div>
  );
}