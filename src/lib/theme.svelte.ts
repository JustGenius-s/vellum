export function createTheme() {
  let theme = $state<"light" | "dark">("light");

  function applyTheme(t: "light" | "dark") {
    theme = t;
    localStorage.setItem("vellum-theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }

  function init() {
    const saved = localStorage.getItem("vellum-theme");
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
    }
  }

  return {
    get theme() { return theme; },
    applyTheme,
    init,
  };
}

export type Theme = ReturnType<typeof createTheme>;
