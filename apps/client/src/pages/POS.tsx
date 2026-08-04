type POSProps = {
  setPage: (page: string) => void;
};

export default function POS({ setPage }: POSProps) {
  return (
    <div className="p-8" dir="rtl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold">واجهة الموظف</h1>
        <p className="mt-1 text-gray-500">كل ما يحتاجه الموظف في شاشة واحدة</p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <button
          onClick={() => setPage("new-order")}
          className="col-span-2 rounded-2xl bg-emerald-700 p-8 text-3xl font-bold text-white hover:bg-emerald-800"
        >
          ➕ طلب جديد
        </button>

        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-gray-500">طلبات اليوم</p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-700">0</h2>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-gray-500">مبيعات اليوم</p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-700">0 د.ل</h2>
        </div>
      </div>
    </div>
  );
}