const DEFAULT_SETTINGS = {
  theme: "system",
  accent: "teal",
  language: "system",
  autoOpenResults: false,
  defaultGroupByDomain: true,
  compactRows: false,
  showOccurrences: true,
  showTooltips: true,
  defaultCopyScope: "visible",
  defaultCopyFormat: "plain",
  defaultExportScope: "all"
};

const historySearch = document.getElementById("historySearch");
const historyContainer = document.getElementById("historyContainer");
const emptyHistory = document.getElementById("emptyHistory");
const historySessionCount = document.getElementById("historySessionCount");
const historyLinkCount = document.getElementById("historyLinkCount");
const historyLastCapture = document.getElementById("historyLastCapture");

let currentSettings = { ...DEFAULT_SETTINGS };
let currentHealth = {};
let historySearchTimer = null;

function t(value) {
  return window.AllLinksI18n?.t?.(value) || value;
}

function formatLinkCount(count) {
  return `${count} ${t(count === 1 ? "link" : "links")}`;
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

function closeDialog(backdrop, value, resolve) {
  backdrop.remove();
  resolve(value);
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
    cancelButton.addEventListener("click", () => closeDialog(backdrop, false, resolve));

    const confirmButton = document.createElement("button");
    confirmButton.className = "btn btn-secondary";
    confirmButton.textContent = confirmLabel;
    confirmButton.addEventListener("click", () => closeDialog(backdrop, true, resolve));

    actions.append(cancelButton, confirmButton);
    card.append(heading, body, actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  });
}

function promptDialog({ title, message, defaultValue = "", confirmLabel = "Save" }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop";

    const card = document.createElement("div");
    card.className = "dialog-card";

    const heading = document.createElement("h2");
    heading.textContent = title;

    const body = document.createElement("p");
    body.textContent = message;

    const input = document.createElement("input");
    input.className = "form-control";
    input.type = "text";
    input.value = defaultValue;

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const cancelButton = document.createElement("button");
    cancelButton.className = "btn btn-outline-secondary";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => closeDialog(backdrop, null, resolve));

    const confirmButton = document.createElement("button");
    confirmButton.className = "btn btn-secondary";
    confirmButton.textContent = confirmLabel;
    confirmButton.addEventListener("click", () => closeDialog(backdrop, input.value, resolve));

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        closeDialog(backdrop, input.value, resolve);
      }
      if (event.key === "Escape") {
        closeDialog(backdrop, null, resolve);
      }
    });

    actions.append(cancelButton, confirmButton);
    card.append(heading, body, input, actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    input.focus();
    input.select();
  });
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
    return value;
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

function sanitizeFileName(value, extension) {
  const baseName = String(value || "saved-links")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "saved-links";

  return baseName.endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`;
}

function htmlEscape(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getExportRows(entry) {
  return normalizeLinks(entry.links).map((link) => {
    if (typeof link === "string") {
      return {
        text: link,
        url: link,
        domain: "",
        type: "",
        scope: "",
        occurrences: ""
      };
    }

    return {
      text: link.text || link.url,
      url: link.url,
      domain: link.domain || "",
      type: link.type || "",
      scope: link.scope || "",
      extension: link.extension || "",
      rel: Array.isArray(link.rel) ? link.rel.join(" ") : "",
      categories: Array.isArray(link.categories) ? link.categories.join(", ") : "",
      queryParamCount: link.queryParamCount || "",
      urlLength: link.urlLength || String(link.url || "").length,
      occurrences: link.occurrences || "",
      sources: Array.isArray(link.sources) ? link.sources.join(", ") : link.source || "",
      health: currentHealth[link.url]?.category || "unchecked",
      status: currentHealth[link.url]?.status || "",
      finalUrl: currentHealth[link.url]?.finalUrl || "",
      responseTime: currentHealth[link.url]?.responseTime || "",
      error: currentHealth[link.url]?.error || ""
    };
  });
}

function rowsToCsv(rows) {
  const csvRows = [["Text", "URL", "Domain", "Type", "Scope", "Extension", "Rel", "Categories", "Query Params", "URL Length", "Occurrences", "Sources", "Health", "Status", "Final URL", "Response Time", "Error"]];
  rows.forEach((row) => {
    csvRows.push([
      row.text,
      row.url,
      row.domain,
      row.type,
      row.scope,
      row.extension,
      row.rel,
      row.categories,
      String(row.queryParamCount),
      String(row.urlLength),
      String(row.occurrences),
      row.sources,
      row.health,
      String(row.status),
      row.finalUrl,
      String(row.responseTime),
      row.error
    ]);
  });

  return csvRows.map((row) => {
    return row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(",");
  }).join("\n");
}

function rowsToMarkdown(entry, rows) {
  const heading = `# ${entry.name || entry.sourceTitle || "Saved Links"}`;
  const source = entry.sourceUrl ? `Source: ${entry.sourceUrl}` : "";
  const links = rows.map((row) => `- [${row.text || row.url}](${row.url})`).join("\n");
  return [heading, source, links].filter(Boolean).join("\n\n");
}

function rowsToHtml(entry, rows) {
  const title = htmlEscape(entry.name || entry.sourceTitle || "Saved Links");
  const source = entry.sourceUrl ? `<p>Source: ${htmlEscape(entry.sourceUrl)}</p>` : "";
  const links = rows
    .map((row) => `<li><a href="${htmlEscape(row.url)}">${htmlEscape(row.text || row.url)}</a></li>`)
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body>
<h1>${title}</h1>
${source}
<ul>
${links}
</ul>
</body>
</html>`;
}

function rowsToExcel(entry, rows) {
  const title = htmlEscape(entry.name || entry.sourceTitle || "Saved Links");
  const headings = ["Text", "URL", "Domain", "Type", "Scope", "Extension", "Rel", "Categories", "Query Params", "URL Length", "Occurrences", "Sources", "Health", "Status", "Final URL", "Response Time", "Error"];
  const dataRows = rows.map((row) => [
    row.text,
    row.url,
    row.domain,
    row.type,
    row.scope,
    row.extension,
    row.rel,
    row.categories,
    String(row.queryParamCount),
    String(row.urlLength),
    String(row.occurrences),
    row.sources,
    row.health,
    String(row.status),
    row.finalUrl,
    String(row.responseTime),
    row.error
  ]);

  const tableRows = [headings, ...dataRows].map((row, rowIndex) => {
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${row.map((cell) => `<${tag}>${htmlEscape(cell)}</${tag}>`).join("")}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #e8f5f3; font-weight: bold; }
    th, td { border: 1px solid #b7c7d3; padding: 6px 8px; vertical-align: top; }
  </style>
</head>
<body>
  <table>${tableRows}</table>
</body>
</html>`;
}

function buildExport(entry, format) {
  const rows = getExportRows(entry);

  if (format === "txt") {
    return {
      content: rows.map((row) => row.url).join("\n"),
      type: "text/plain",
      extension: "txt"
    };
  }

  if (format === "csv") {
    return {
      content: rowsToCsv(rows),
      type: "text/csv;charset=utf-8",
      extension: "csv"
    };
  }

  if (format === "excel") {
    return {
      content: rowsToExcel(entry, rows),
      type: "application/vnd.ms-excel;charset=utf-8",
      extension: "xls"
    };
  }

  if (format === "markdown") {
    return {
      content: rowsToMarkdown(entry, rows),
      type: "text/markdown",
      extension: "md"
    };
  }

  if (format === "html") {
    return {
      content: rowsToHtml(entry, rows),
      type: "text/html",
      extension: "html"
    };
  }

  if (format === "domains") {
    return {
      content: Array.from(new Set(rows.map((row) => row.domain).filter(Boolean))).join("\n"),
      type: "text/plain",
      extension: "txt"
    };
  }

  return {
    content: JSON.stringify({
      name: entry.name,
      savedAt: entry.timestamp,
      sourceTitle: entry.sourceTitle,
      sourceUrl: entry.sourceUrl,
      links: entry.links
    }, null, 2),
    type: "application/json",
    extension: "json"
  };
}

function exportHistoryEntry(entry, format = "txt") {
  const exportData = buildExport(entry, format);
  const blob = new Blob([exportData.content], { type: exportData.type });
  const url = URL.createObjectURL(blob);
  const filename = sanitizeFileName(entry.name || entry.sourceTitle || "saved-links", exportData.extension);

  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function loadHistory() {
  const query = historySearch.value.trim().toLowerCase();
  historyContainer.replaceChildren();

  chrome.storage.local.get("linkHistory", (data) => {
    const history = Array.isArray(data.linkHistory) ? data.linkHistory : [];
    const totalLinks = history.reduce((sum, item) => sum + normalizeLinks(item.links).length, 0);
    const latest = history.slice().sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
    document.getElementById("clearHistory").disabled = history.length === 0;
    historySessionCount.textContent = history.length;
    historyLinkCount.textContent = totalLinks;
    historyLastCapture.textContent = formatShortDate(latest?.timestamp);

    const filteredHistory = history.filter((item) => {
      const haystack = [
        item.name,
        item.timestamp,
        item.sourceTitle,
        item.sourceUrl
      ].join(" ").toLowerCase();
      return !query || haystack.includes(query);
    });

    emptyHistory.classList.toggle("d-none", filteredHistory.length > 0);

    filteredHistory.slice().reverse().forEach((item) => {
      const div = document.createElement("article");
      div.className = "history-page-card";

      const cardTop = document.createElement("div");
      cardTop.className = "history-card-top";

      const icon = document.createElement("div");
      icon.className = "history-card-icon";
      icon.textContent = "L";

      const titleWrap = document.createElement("div");
      titleWrap.className = "history-title-wrap";

      const title = document.createElement("h2");
      title.textContent = item.name || item.sourceTitle || "Saved links";

      const detail = document.createElement("p");
      const linkTotal = normalizeLinks(item.links).length;
      detail.className = "history-page-meta";
      detail.textContent = `${formatLinkCount(linkTotal)} | ${formatDate(item.timestamp)}`;

      titleWrap.append(title, detail);
      cardTop.append(icon, titleWrap);

      const source = document.createElement("p");
      source.className = "history-page-source";
      source.textContent = item.sourceUrl || item.sourceTitle || "No source URL stored.";

      const actions = document.createElement("div");
      actions.className = "history-page-actions";

      const viewButton = document.createElement("button");
      viewButton.className = "btn btn-secondary";
      viewButton.textContent = "View";
      viewButton.title = "Load this saved session into the audit page.";
      viewButton.addEventListener("click", () => {
        chrome.storage.local.set({
          extractedLinks: normalizeLinks(item.links),
          extractionMeta: item.extractionMeta || {
            sourceTitle: item.sourceTitle,
            sourceUrl: item.sourceUrl,
            extractedAt: item.timestamp,
            uniqueCount: linkTotal
          }
        }, () => {
          chrome.runtime.sendMessage({ action: "openResultPage" });
        });
      });

      const renameButton = document.createElement("button");
      renameButton.className = "btn btn-outline-secondary";
      renameButton.textContent = "Rename";
      renameButton.title = "Rename this saved session.";
      renameButton.addEventListener("click", async () => {
        const nextName = await promptDialog({
          title: "Rename Session",
          message: "Choose a clear name for this saved extraction.",
          defaultValue: item.name || "Saved links",
          confirmLabel: "Rename"
        });
        if (nextName === null) {
          return;
        }

        const nextHistory = history.map((historyItem) => {
          const sameItem = historyItem.id ? historyItem.id === item.id : historyItem === item;
          return sameItem ? { ...historyItem, name: nextName.trim() || "Saved links" } : historyItem;
        });
        chrome.storage.local.set({ linkHistory: nextHistory }, loadHistory);
      });

      const exportButton = document.createElement("button");
      exportButton.className = "btn btn-outline-primary";
      exportButton.textContent = "Export";
      exportButton.title = "Download this saved session in the selected format.";

      const exportFormat = document.createElement("select");
      exportFormat.className = "form-select form-select-sm history-export-format";
      exportFormat.title = "Choose the file format for this history export.";
      [
        ["txt", "Text"],
        ["csv", "CSV"],
        ["excel", "Excel"],
        ["markdown", "Markdown"],
        ["html", "HTML"],
        ["domains", "Domains"],
        ["json", "JSON"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        exportFormat.appendChild(option);
      });

      exportButton.addEventListener("click", () => {
        exportHistoryEntry(item, exportFormat.value);
        notify(`Exporting ${exportFormat.options[exportFormat.selectedIndex].text}.`);
      });

      const deleteButton = document.createElement("button");
      deleteButton.className = "btn btn-outline-danger";
      deleteButton.textContent = "Delete";
      deleteButton.title = "Delete only this saved session.";
      deleteButton.addEventListener("click", async () => {
        const shouldDelete = await confirmDialog({
          title: "Delete Session",
          message: "This saved extraction will be removed from history.",
          confirmLabel: "Delete"
        });
        if (!shouldDelete) {
          return;
        }

        const nextHistory = history.filter((historyItem) => {
          return item.id ? historyItem.id !== item.id : historyItem !== item;
        });
        chrome.storage.local.set({ linkHistory: nextHistory }, loadHistory);
      });

      actions.append(viewButton, renameButton, exportFormat, exportButton, deleteButton);
      div.append(cardTop, source, actions);
      historyContainer.appendChild(div);
    });
  });
}

function debounceHistorySearch() {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(loadHistory, 90);
}

document.getElementById("clearHistory").addEventListener("click", async () => {
  const shouldClear = await confirmDialog({
    title: "Clear History",
    message: "All saved extraction sessions will be removed.",
    confirmLabel: "Clear All"
  });

  if (shouldClear) {
    chrome.storage.local.remove("linkHistory", () => {
      loadHistory();
      notify("History cleared.");
    });
  }
});

historySearch.addEventListener("input", debounceHistorySearch);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.linkHistory) {
    loadHistory();
  }

  if (changes.linkHealth) {
    currentHealth = changes.linkHealth.newValue || {};
    loadHistory();
  }

  if (changes.extensionSettings) {
    applySettings(changes.extensionSettings.newValue || DEFAULT_SETTINGS);
    loadHistory();
  }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentSettings.theme === "system") {
    applySettings(currentSettings);
  }
});

loadSettings();
chrome.storage.local.get("linkHealth", (data) => {
  currentHealth = data.linkHealth || {};
  loadHistory();
});
