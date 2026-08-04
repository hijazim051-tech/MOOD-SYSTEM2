;export type ProductDetail = {
  id: number;
  name: string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  alertLimit: number;
  isImportant: boolean;
};

export type Product = {
  id: number;
  name: string;
  icon: string;
  details: ProductDetail[];
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  description: string;
  addButton: string;
  products: Product[];
};

export const categories: Category[] = [
  {
    id: "natural",
    name: "ورد طبيعي",
    icon: "🌹",
    description: "إدارة الورد الطبيعي وألوانه وأسعاره",
    addButton: "➕ إضافة نوع ورد",
    products: [
      {
        id: 1,
        name: "جوري",
        icon: "🌹",
        details: [
          { id: 1, name: "أبيض", buyPrice: 4, sellPrice: 6, stock: 120, alertLimit: 20, isImportant: true },
          { id: 2, name: "أحمر", buyPrice: 5, sellPrice: 7, stock: 90, alertLimit: 20, isImportant: true },
          { id: 3, name: "وردي", buyPrice: 4.5, sellPrice: 6.5, stock: 70, alertLimit: 15, isImportant: true },
        ],
      },
      { id: 2, name: "ليليوم", icon: "🤍", details: [] },
      { id: 3, name: "كريز", icon: "🌼", details: [] },
      { id: 4, name: "جربيرا", icon: "🌸", details: [] },
      { id: 5, name: "بيبي روز", icon: "🌹", details: [] },
      { id: 6, name: "ستاش", icon: "🌿", details: [] },
      { id: 7, name: "قرنفل", icon: "🌺", details: [] },
      { id: 8, name: "دينتوس", icon: "🌼", details: [] },
      { id: 9, name: "ألستروميريا", icon: "🌸", details: [] },
      { id: 10, name: "هيدرنجا", icon: "💙", details: [] },
      { id: 11, name: "عباد الشمس", icon: "🌻", details: [] },
    ],
  },
  { id: "artificial", name: "ورد صناعي", icon: "🌸", description: "إدارة الورد الصناعي", addButton: "➕ إضافة ورد صناعي", products: [] },
  { id: "wrapping", name: "التغليف", icon: "🎀", description: "إدارة ألوان وخامات التغليف", addButton: "➕ إضافة لون تغليف", products: [] },
  { id: "boxes", name: "البوكسات", icon: "📦", description: "إدارة البوكسات والأحجام", addButton: "➕ إضافة بوكس", products: [] },
  { id: "ribbons", name: "الشرائط", icon: "🎗", description: "إدارة الشرائط والألوان", addButton: "➕ إضافة شريط", products: [] },
  { id: "cards", name: "الكروت", icon: "💌", description: "إدارة كروت الهدايا", addButton: "➕ إضافة كرت", products: [] },
  { id: "extras", name: "الإضافات", icon: "✨", description: "دباديب، شوكولاتة، بالونات", addButton: "➕ إضافة منتج إضافي", products: [] },
];