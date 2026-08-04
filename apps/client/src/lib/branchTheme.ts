export type BranchTheme = {
  name: string;
  logo: string;
  primary: string;
  secondary: string;
  sidebar: string;
  sidebarHover: string;
  sidebarActive: string;
  gradient: string;
};

const themes: Record<string, BranchTheme> = {
  mood: {
    name: "MOOD",
    logo: "🌹",
    primary: "#047857",
    secondary: "#10b981",
    sidebar: "bg-emerald-900",
    sidebarHover: "hover:bg-emerald-800",
    sidebarActive: "bg-emerald-700",
    gradient: "from-emerald-900 via-emerald-800 to-emerald-700",
  },

  alpha: {
    name: "Alpha",
    logo: "🅰️",
    primary: "#1d4ed8",
    secondary: "#3b82f6",
    sidebar: "bg-blue-900",
    sidebarHover: "hover:bg-blue-800",
    sidebarActive: "bg-blue-700",
    gradient: "from-blue-900 via-blue-800 to-blue-700",
  },
};

export function getBranchTheme(code?: string | null) {
  if (!code) return themes.mood;

  const key = code.toLowerCase();

  return themes[key] ?? themes.mood;
}