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

const linkCount = document.getElementById("linkCount");
const sourceInfo = document.getElementById("sourceInfo");
const sourceDomainValue = document.getElementById("sourceDomainValue");
const lastExtractedValue = document.getElementById("lastExtractedValue");
const statusPill = document.getElementById("statusPill");
const extractLinksButton = document.getElementById("extractLinks");
const extractAllTabsButton = document.getElementById("extractAllTabs");
const extractSelectionButton = document.getElementById("extractSelection");

let currentSettings = { ...DEFAULT_SETTINGS };

function t(value) {
  return window.AllLinksI18n?.t?.(value) || value;
}

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

function setPopupLoading(isLoading, label, button) {
  statusPill.classList.toggle("is-loading", isLoading);
  statusPill.textContent = label;

  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }

  button.classList.toggle("is-busy", isLoading);
  button.disabled = isLoading;
  button.textContent = isLoading ? label : button.dataset.defaultText;
}

function getLinkUrl(link) {
  return typeof link === "string" ? link : link?.url;
}

function normalizeLinks(links) {
  const seen = new Set();
  return (Array.isArray(links) ? links : []).filter((link) => {
    const url = getLinkUrl(link);
    if (!url || seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

function getDateLocale() {
  if (!currentSettings.language || currentSettings.language === "system") {
    return undefined;
  }
  return currentSettings.language.replace("_", "-");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(getDateLocale());
}

function formatShortDate(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Stored";
  }

  return date.toLocaleDateString(getDateLocale(), { month: "short", day: "numeric" });
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
  window.AllLinksI18n?.apply?.(currentSettings.language || "system");
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

function updateLinkCount() {
  chrome.storage.local.get(["extractedLinks", "extractionMeta"], (data) => {
    const links = normalizeLinks(data.extractedLinks);
    const meta = data.extractionMeta || {};
    linkCount.textContent = links.length;
    sourceDomainValue.textContent = meta.sourceDomain || "None";
    lastExtractedValue.textContent = formatShortDate(meta.extractedAt);

    if (meta.sourceTitle || meta.sourceUrl) {
      const extractedAt = meta.extractedAt ? `${t("Extracted")} ${formatDate(meta.extractedAt)}` : "";
      sourceInfo.textContent = [meta.sourceTitle, meta.sourceUrl, extractedAt].filter(Boolean).join(" | ");
      if (!statusPill.classList.contains("is-loading")) {
        statusPill.textContent = links.length > 0 ? "Captured" : "Ready";
      }
    } else {
      sourceInfo.textContent = "No page extracted yet.";
      if (!statusPill.classList.contains("is-loading")) {
        statusPill.textContent = "Ready";
      }
    }
  });
}

extractLinksButton.addEventListener("click", async () => {
  setPopupLoading(true, "Scanning", extractLinksButton);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "extractCurrentTab",
      openResultPage: currentSettings.autoOpenResults
    });

    if (!response?.ok) {
      statusPill.textContent = "Blocked";
      notify(response?.error || "This page cannot be scanned. Open an HTTP or HTTPS page.");
      return;
    }

    updateLinkCount();
    notify(`Extracted and saved ${response.extractedCount ?? 0} unique links.`);
  } catch {
    statusPill.textContent = "Blocked";
    notify("Unable to extract links from this page.");
  } finally {
    statusPill.classList.remove("is-loading");
    extractLinksButton.classList.remove("is-busy");
    extractLinksButton.disabled = false;
    extractLinksButton.textContent = extractLinksButton.dataset.defaultText || "Extract";
  }
});

document.getElementById("openResults").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openResultPage" });
});

extractAllTabsButton.addEventListener("click", async () => {
  setPopupLoading(true, "Scanning Tabs", extractAllTabsButton);

  try {
    const response = await chrome.runtime.sendMessage({ action: "extractAllOpenTabs" });
    if (!response?.ok) {
      statusPill.textContent = "Blocked";
      notify(response?.error || "Unable to extract open tabs.");
      return;
    }

    updateLinkCount();
    notify(`Extracted ${response.linkCount} links from ${response.tabCount} tabs.`);
  } catch {
    statusPill.textContent = "Blocked";
    notify("Unable to extract open tabs.");
  } finally {
    statusPill.classList.remove("is-loading");
    extractAllTabsButton.classList.remove("is-busy");
    extractAllTabsButton.disabled = false;
    extractAllTabsButton.textContent = extractAllTabsButton.dataset.defaultText || "All Tabs";
  }
});

extractSelectionButton.addEventListener("click", async () => {
  setPopupLoading(true, "Selection", extractSelectionButton);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "extractSelectedText",
      openResultPage: currentSettings.autoOpenResults
    });

    if (!response?.ok) {
      statusPill.textContent = "No Links";
      notify(response?.error || "Select text that contains links, then try again.");
      return;
    }

    updateLinkCount();
    notify(`Extracted and saved ${response.extractedCount ?? 0} links from selected text.`);
  } catch {
    statusPill.textContent = "Blocked";
    notify("Unable to extract selected text on this page.");
  } finally {
    statusPill.classList.remove("is-loading");
    extractSelectionButton.classList.remove("is-busy");
    extractSelectionButton.disabled = false;
    extractSelectionButton.textContent = extractSelectionButton.dataset.defaultText || "Selection";
  }
});

document.getElementById("openHistory").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openHistoryPage" });
});

document.getElementById("openSettings").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openSettingsPage" });
});

document.getElementById("openPrivacy").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openPrivacyPage" });
});

document.getElementById("openFeedback").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openFeedbackPage" });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.extractedLinks || changes.extractionMeta) {
    updateLinkCount();
  }

  if (changes.extensionSettings) {
    applySettings(changes.extensionSettings.newValue || DEFAULT_SETTINGS);
  }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentSettings.theme === "system") {
    applySettings(currentSettings);
  }
});

loadSettings();
updateLinkCount();
