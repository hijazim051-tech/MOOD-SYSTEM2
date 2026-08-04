import type { Category } from "../../data/products";

type CategoryCardsProps = {
  categories: Category[];
  onSelect: (category: Category) => void;
};

export default function CategoryCards({
  categories,
  onSelect,
}: CategoryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onSelect(category)}
          className="rounded-2xl bg-white p-6 text-right shadow transition hover:-translate-y-1 hover:ring-2 hover:ring-emerald-600"
        >
          <div className="mb-4 text-6xl">{category.icon}</div>
          <h2 className="text-2xl font-bold">{category.name}</h2>
          <p className="mt-2 text-gray-500">{category.description}</p>
        </button>
      ))}
    </div>
  );
}