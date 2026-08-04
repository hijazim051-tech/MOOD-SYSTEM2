import { categories as defaultCategories } from "./products";
import type { Category } from "./products";

const CATEGORIES_KEY = "mood_categories";
const PURCHASES_KEY = "mood_purchases";
const SALES_KEY = "mood_sales";

export type Purchase = {
  id: number;
  supplier: string;
  invoiceNo: string;
  date: string;
  categoryName: string;
  productName: string;
  detailName: string;
  quantity: number;
  buyPrice: number;
  total: number;
  notes: string;
};

export type SaleItem = {
  categoryId: string;
  productId: number;
  detailId: number;
  categoryName: string;
  productName: string;
  detailName: string;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  total: number;
  profit: number;
};

export type Sale = {
  id: number;
  customer: string;
  phone: string;
  date: string;
  items: SaleItem[];
  total: number;
  profit: number;
  notes: string;
};

export function loadCategories(): Category[] {
  const saved = localStorage.getItem(CATEGORIES_KEY);
  if (saved) return JSON.parse(saved);
  return structuredClone(defaultCategories);
}

export function saveCategories(categories: Category[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export function loadPurchases(): Purchase[] {
  const saved = localStorage.getItem(PURCHASES_KEY);
  if (saved) return JSON.parse(saved);
  return [];
}

export function savePurchases(purchases: Purchase[]) {
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
}

export function loadSales(): Sale[] {
  const saved = localStorage.getItem(SALES_KEY);
  if (saved) return JSON.parse(saved);
  return [];
}

export function saveSales(sales: Sale[]) {
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}