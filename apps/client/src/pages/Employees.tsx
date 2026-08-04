import { useState } from "react";

type Employee = {
  id: number;
  name: string;
  role: string;
  phone: string;
  salary: number;
  active: boolean;
};

const EMPLOYEES_KEY = "mood_employees";

function loadEmployees(): Employee[] {
  const saved = localStorage.getItem(EMPLOYEES_KEY);
  if (saved) return JSON.parse(saved);
  return [];
}

function saveEmployees(employees: Employee[]) {
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>(loadEmployees());

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [salary, setSalary] = useState("");

  function addEmployee() {
    if (!name || !role) return alert("اكتب اسم الموظف والدور");

    const newEmployee: Employee = {
      id: Date.now(),
      name,
      role,
      phone,
      salary: Number(salary || 0),
      active: true,
    };

    const updated = [...employees, newEmployee];
    setEmployees(updated);
    saveEmployees(updated);

    setName("");
    setRole("");
    setPhone("");
    setSalary("");
  }

  function toggleActive(id: number) {
    const updated = employees.map((employee) =>
      employee.id === id
        ? { ...employee, active: !employee.active }
        : employee
    );

    setEmployees(updated);
    saveEmployees(updated);
  }

  function deleteEmployee(id: number) {
    if (!confirm("هل تريد حذف الموظف؟")) return;

    const updated = employees.filter((employee) => employee.id !== id);
    setEmployees(updated);
    saveEmployees(updated);
  }

  const totalSalaries = employees.reduce(
    (sum, employee) => sum + Number(employee.salary || 0),
    0
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">👨‍💼 الموظفين</h1>

        <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-bold">
          العدد: {employees.length}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card title="عدد الموظفين" value={employees.length} />
        <Card
          title="النشطين"
          value={employees.filter((e) => e.active).length}
        />
        <Card
          title="غير النشطين"
          value={employees.filter((e) => !e.active).length}
        />
        <Card title="إجمالي الرواتب" value={`${totalSalaries} د.ل`} />
      </div>

      <div className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h2 className="text-xl font-bold">إضافة موظف</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            className="border rounded-xl p-3"
            placeholder="اسم الموظف"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="border rounded-xl p-3"
            placeholder="الدور / الوظيفة"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />

          <input
            className="border rounded-xl p-3"
            placeholder="رقم الهاتف"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            className="border rounded-xl p-3"
            placeholder="الراتب"
            type="number"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
          />
        </div>

        <button
          onClick={addEmployee}
          className="bg-emerald-700 text-white px-5 py-3 rounded-xl"
        >
          إضافة موظف
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4">الاسم</th>
              <th className="p-4">الدور</th>
              <th className="p-4">الهاتف</th>
              <th className="p-4">الراتب</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">إجراءات</th>
            </tr>
          </thead>

          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">
                  لا يوجد موظفين
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id} className="border-t">
                  <td className="p-4 font-bold">{employee.name}</td>
                  <td className="p-4">{employee.role}</td>
                  <td className="p-4">{employee.phone || "-"}</td>
                  <td className="p-4">{employee.salary} د.ل</td>
                  <td className="p-4">
                    {employee.active ? "نشط" : "غير نشط"}
                  </td>
                  <td className="p-4 flex gap-2">
                    <button
                      onClick={() => toggleActive(employee.id)}
                      className="bg-blue-600 text-white px-3 py-2 rounded-lg"
                    >
                      تغيير الحالة
                    </button>

                    <button
                      onClick={() => deleteEmployee(employee.id)}
                      className="bg-red-600 text-white px-3 py-2 rounded-lg"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <p className="text-gray-500 mb-2">{title}</p>
      <h2 className="text-3xl font-bold text-emerald-700">{value}</h2>
    </div>
  );
}