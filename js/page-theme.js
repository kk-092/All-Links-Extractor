const PAGE_THEME_DEFAULTS = {
  theme: "system",
  accent: "teal",
  language: "system"
};

function resolvePageTheme(theme) {
  if (theme === "system") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyPageTheme(settings) {
  const currentSettings = { ...PAGE_THEME_DEFAULTS, ...(settings || {}) };
  document.documentElement.dataset.theme = resolvePageTheme(currentSettings.theme);
  document.documentElement.dataset.accent = currentSettings.accent;
}

function loadPageTheme() {
  chrome.storage.local.get(["extensionSettings", "darkMode"], (data) => {
    const legacyTheme = data.extensionSettings ? null : data.darkMode ? "dark" : null;
    applyPageTheme({
      ...(legacyTheme ? { theme: legacyTheme } : {}),
      ...(data.extensionSettings || {})
    });
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.extensionSettings) {
    applyPageTheme(changes.extensionSettings.newValue || PAGE_THEME_DEFAULTS);
  }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  chrome.storage.local.get("extensionSettings", (data) => {
    if ((data.extensionSettings || PAGE_THEME_DEFAULTS).theme === "system") {
      applyPageTheme(data.extensionSettings || PAGE_THEME_DEFAULTS);
    }
  });
});

loadPageTheme();
