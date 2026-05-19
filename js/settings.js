const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "teal",
  language: "system",
  autoOpenResults: false,
  autoCaptureTabs: false,
  defaultGroupByDomain: true,
  compactRows: false,
  showOccurrences: true,
  showTooltips: true,
  defaultCopyScope: "visible",
  defaultCopyFormat: "plain",
  defaultExportScope: "all"
};

const themeOptions = document.getElementById("themeOptions");
const accentOptions = document.getElementById("accentOptions");
const settingsControls = {
  autoOpenResults: document.getElementById("autoOpenResults"),
  autoCaptureTabs: document.getElementById("autoCaptureTabs"),
  defaultGroupByDomain: document.getElementById("defaultGroupByDomain"),
  compactRows: document.getElementById("compactRows"),
  showOccurrences: document.getElementById("showOccurrences"),
  showTooltips: document.getElementById("showTooltips"),
  language: document.getElementById("language"),
  defaultCopyScope: document.getElementById("defaultCopyScope"),
  defaultCopyFormat: document.getElementById("defaultCopyFormat"),
  defaultExportScope: document.getElementById("defaultExportScope")
};

let currentSettings = { ...DEFAULT_SETTINGS };

function notify(message) {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }

  const toast = document.createElement("div");
  toast.className = "toast-message";
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function confirmDialog({ title, message, confirmLabel = "Confirm" }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const card = document.createElement("div");
    card.className = "dialog-card";

    const heading = document.createElement("h2");
    heading.textContent = title;

    const body = document.createElement("p");
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.className = "btn btn-outline-secondary";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      backdrop.remove();
      resolve(false);
    });

    const confirmButton = document.createElement("button");
    confirmButton.className = "btn btn-secondary";
    confirmButton.textContent = confirmLabel;
    confirmButton.addEventListener("click", () => {
      backdrop.remove();
      resolve(true);
    });

    actions.append(cancelButton, confirmButton);
    card.append(heading, body, actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  });
}

function resolveTheme(theme) {
  if (theme === "system") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applySettings(settings) {
  currentSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  document.documentElement.dataset.theme = resolveTheme(currentSettings.theme);
  document.documentElement.dataset.accent = currentSettings.accent;
  renderControls();
}

function renderControls() {
  themeOptions.querySelectorAll("[data-theme-value]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeValue === currentSettings.theme);
  });

  accentOptions.querySelectorAll("[data-accent-value]").forEach((button) => {
    button.classList.toggle("active", button.dataset.accentValue === currentSettings.accent);
  });

  Object.entries(settingsControls).forEach(([key, control]) => {
    if (control.type === "checkbox") {
      control.checked = currentSettings[key];
    } else {
      control.value = currentSettings[key];
    }
  });
}

function saveSettings(nextSettings) {
  currentSettings = { ...DEFAULT_SETTINGS, ...currentSettings, ...nextSettings };
  chrome.storage.local.set({ extensionSettings: currentSettings }, () => {
    applySettings(currentSettings);
  });
}

function loadSettings() {
  chrome.storage.local.get(["extensionSettings", "darkMode"], (data) => {
    const legacyTheme = data.extensionSettings ? null : data.darkMode ? "dark" : null;
    applySettings({
      ...(legacyTheme ? { theme: legacyTheme } : {}),
      ...(data.extensionSettings || {})
    });
  });
}

themeOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-value]");
  if (button) {
    saveSettings({ theme: button.dataset.themeValue });
  }
});

accentOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-accent-value]");
  if (button) {
    saveSettings({ accent: button.dataset.accentValue });
  }
});

Object.entries(settingsControls).forEach(([key, control]) => {
  control.addEventListener("change", () => {
    saveSettings({
      [key]: control.type === "checkbox" ? control.checked : control.value
    });
  });
});

document.getElementById("resetSettings").addEventListener("click", async () => {
  const shouldReset = await confirmDialog({
    title: "Reset Settings",
    message: "Theme, accent, copy/export defaults, and behavior preferences will return to defaults.",
    confirmLabel: "Reset"
  });

  if (shouldReset) {
    chrome.storage.local.set({ extensionSettings: DEFAULT_SETTINGS }, () => {
      applySettings(DEFAULT_SETTINGS);
      notify("Settings reset.");
    });
  }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentSettings.theme === "system") {
    applySettings(currentSettings);
  }
});

loadSettings();
