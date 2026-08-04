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
        <input
          value={value.customerName}
          onChange={(e) => update("customerName", e.target.value)}
          className="rounded-xl border p-3"
          placeholder="اسم العميل"
        />

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