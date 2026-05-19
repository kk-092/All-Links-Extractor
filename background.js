const CHECK_TIMEOUT_MS = 10000;
const CHECK_CONCURRENCY = 6;
const BULK_OPEN_LIMIT = 30;
const PREVIEW_TIMEOUT_MS = 8000;
const AUTO_CAPTURE_COOLDOWN_MS = 120000;
const WORKSPACE_PAGES = ["result.html", "history.html", "settings.html", "privacy.html", "feedback.html"];
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

const autoCaptureRuns = new Map();

function canInjectIntoUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function makeAutoCaptureKey(tab) {
  return `${tab?.id || "tab"}:${tab?.url || ""}`;
}

function rememberAutoCapture(tab) {
  autoCaptureRuns.set(makeAutoCaptureKey(tab), Date.now());
  if (autoCaptureRuns.size > 250) {
    const oldestKeys = Array.from(autoCaptureRuns.keys()).slice(0, 80);
    oldestKeys.forEach((key) => autoCaptureRuns.delete(key));
  }
}

function wasRecentlyAutoCaptured(tab) {
  const lastRunAt = autoCaptureRuns.get(makeAutoCaptureKey(tab));
  return Boolean(lastRunAt && Date.now() - lastRunAt < AUTO_CAPTURE_COOLDOWN_MS);
}

async function getExtensionSettings() {
  const data = await chrome.storage.local.get("extensionSettings");
  return { ...DEFAULT_SETTINGS, ...(data.extensionSettings || {}) };
}

function makeHistoryId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isWorkspacePageUrl(url) {
  if (!url) {
    return false;
  }

  return WORKSPACE_PAGES.some((page) => url === chrome.runtime.getURL(page));
}

async function openWorkspacePage(page) {
  const targetUrl = chrome.runtime.getURL(page);
  const tabs = await chrome.tabs.query({});
  const existingWorkspaceTab = tabs.find((tab) => isWorkspacePageUrl(tab.url));

  if (existingWorkspaceTab?.id) {
    await chrome.tabs.update(existingWorkspaceTab.id, {
      active: true,
      url: targetUrl
    });

    if (existingWorkspaceTab.windowId !== undefined) {
      await chrome.windows.update(existingWorkspaceTab.windowId, { focused: true });
    }

    return existingWorkspaceTab.id;
  }

  const tab = await chrome.tabs.create({ url: targetUrl });
  return tab.id;
}

function isHttpUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function getHealthCategory(result) {
  if (result.skipped) {
    return "skipped";
  }

  if (result.error) {
    return "error";
  }

  if (result.status >= 200 && result.status < 300 && !result.redirected) {
    return "healthy";
  }

  if (result.status >= 200 && result.status < 400 && result.redirected) {
    return "redirect";
  }

  if (result.status >= 300 && result.status < 400) {
    return "redirect";
  }

  return "broken";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkLink(url) {
  const startedAt = performance.now();

  if (!isHttpUrl(url)) {
    return {
      url,
      skipped: true,
      category: "skipped",
      message: "Non-HTTP link",
      checkedAt: new Date().toISOString()
    };
  }

  try {
    let response;
    try {
      response = await fetchWithTimeout(url, { method: "HEAD" });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetchWithTimeout(url, { method: "GET" });
      }
    } catch {
      response = await fetchWithTimeout(url, { method: "GET" });
    }

    const result = {
      url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      redirected: response.redirected,
      finalUrl: response.url,
      responseTime: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString()
    };

    return {
      ...result,
      category: getHealthCategory(result)
    };
  } catch (error) {
    const result = {
      url,
      error: error.name === "AbortError" ? "Timeout" : error.message || "Request failed",
      responseTime: Math.round(performance.now() - startedAt),
      checkedAt: new Date().toISOString()
    };

    return {
      ...result,
      category: getHealthCategory(result)
    };
  }
}

async function runHealthChecks(urls) {
  const queue = [...new Set(urls)];
  const results = [];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      results.push(await checkLink(url));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CHECK_CONCURRENCY, queue.length) }, worker));
  return results;
}

function mergeRecords(records) {
  const byUrl = new Map();

  records.forEach((record) => {
    const url = typeof record === "string" ? record : record?.url;
    if (!url) {
      return;
    }

    if (!byUrl.has(url)) {
      byUrl.set(url, typeof record === "string" ? { url, text: url, occurrences: 1 } : { ...record });
      return;
    }

    const existing = byUrl.get(url);
    const next = typeof record === "string" ? { occurrences: 1, sources: ["tab"] } : record;
    existing.occurrences = (existing.occurrences || 1) + (next.occurrences || 1);
    existing.sources = Array.from(new Set([...(existing.sources || []), ...(next.sources || [next.source]).filter(Boolean)]));
    existing.categories = Array.from(new Set([...(existing.categories || []), ...(next.categories || [])]));
    existing.rel = Array.from(new Set([...(existing.rel || []), ...(next.rel || [])]));
  });

  return Array.from(byUrl.values());
}

function getDomainFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mailto:") {
      const email = parsed.pathname.split("?")[0];
      return email.includes("@") ? email.split("@").pop().toLowerCase() : "email";
    }

    if (parsed.protocol === "tel:") {
      return "phone";
    }

    return parsed.hostname.replace(/^www\./, "").toLowerCase() || parsed.protocol.replace(":", "");
  } catch {
    return "unknown";
  }
}

function getExtensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
    return match ? `.${match[1]}` : "";
  } catch {
    return "";
  }
}

function getRootDomain(hostname) {
  const parts = String(hostname || "").replace(/^www\./, "").split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
}

function inferTextRecordScope(url, baseUrl = "") {
  try {
    const parsed = new URL(url);
    const base = baseUrl ? new URL(baseUrl) : null;

    if (!["http:", "https:"].includes(parsed.protocol) || !base) {
      return "Other";
    }

    if (parsed.origin === base.origin) {
      return "Internal";
    }

    if (getRootDomain(parsed.hostname) === getRootDomain(base.hostname)) {
      return "Subdomain";
    }

    return "External";
  } catch {
    return "Other";
  }
}

function inferRecordType(url) {
  const lowerUrl = String(url || "").toLowerCase();
  const extension = getExtensionFromUrl(url);
  const domain = getDomainFromUrl(url);

  if (lowerUrl.startsWith("mailto:")) {
    return "Email";
  }

  if (lowerUrl.startsWith("tel:")) {
    return "Phone";
  }

  if (extension === ".pdf") {
    return "PDF";
  }

  if ([".apng", ".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"].includes(extension)) {
    return "Image";
  }

  if ([".avi", ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm"].includes(extension)) {
    return "Video";
  }

  if ([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".wav"].includes(extension)) {
    return "Audio";
  }

  if (["facebook.com", "instagram.com", "linkedin.com", "pinterest.com", "reddit.com", "tiktok.com", "twitter.com", "x.com", "youtube.com"].some((socialDomain) => domain === socialDomain || domain.endsWith(`.${socialDomain}`))) {
    return "Social";
  }

  if ([".7z", ".br", ".csv", ".dmg", ".doc", ".docx", ".gz", ".iso", ".msi", ".ppt", ".pptx", ".rar", ".tar", ".tgz", ".txt", ".xls", ".xlsx", ".zip"].includes(extension)) {
    return "Download";
  }

  return "Web";
}

function inferTextRecordCategories(url, rel = []) {
  const categories = [];
  const type = inferRecordType(url);
  const extension = getExtensionFromUrl(url);
  const lowerUrl = String(url || "").toLowerCase();

  try {
    const parsed = new URL(url);
    const params = Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase());

    if (params.some((param) => param.startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid", "msclkid", "spm"].includes(param))) {
      categories.push("Tracking");
    }

    if (params.some((param) => ["aff", "affiliate", "camp", "clickbank", "hop", "partner", "ref", "tag"].includes(param))) {
      categories.push("Affiliate");
    }
  } catch {
    // Non-URL protocols are still useful records, just without query metadata.
  }

  if (["Image", "Video", "Audio"].includes(type)) {
    categories.push("Media");
  }

  if (["PDF", "Download"].includes(type) || [".7z", ".csv", ".doc", ".docx", ".pdf", ".txt", ".xls", ".xlsx", ".zip"].includes(extension)) {
    categories.push("Download");
  }

  if (rel.includes("nofollow")) {
    categories.push("Nofollow");
  }

  if (rel.includes("sponsored")) {
    categories.push("Sponsored");
  }

  if (rel.includes("ugc")) {
    categories.push("UGC");
  }

  if (["amazon.", "amzn.to", "clickbank.", "impact.com", "linksynergy.", "shareasale."].some((domain) => lowerUrl.includes(domain))) {
    categories.push("Affiliate");
  }

  return Array.from(new Set(categories));
}

function normalizeTextUrl(value, baseUrl = "") {
  const rawValue = String(value || "").trim().replace(/[),.;\]\s]+$/g, "");
  if (!rawValue) {
    return "";
  }

  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(rawValue)) {
    return `mailto:${rawValue}`;
  }

  if (/^\+?[0-9][0-9()\-\s.]{6,}$/.test(rawValue)) {
    return `tel:${rawValue.replace(/[\s().-]/g, "")}`;
  }

  try {
    if (/^www\./i.test(rawValue)) {
      return new URL(`https://${rawValue}`).href;
    }

    return new URL(rawValue, baseUrl || undefined).href;
  } catch {
    return "";
  }
}

function extractRecordsFromText(text, { baseUrl = "", source = "text" } = {}) {
  const input = String(text || "");
  const candidates = new Set();
  const patterns = [
    /https?:\/\/[^\s"'<>]+/gi,
    /www\.[^\s"'<>]+/gi,
    /mailto:[^\s"'<>]+/gi,
    /tel:[^\s"'<>]+/gi,
    /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi
  ];

  patterns.forEach((pattern) => {
    const matches = input.match(pattern) || [];
    matches.forEach((match) => candidates.add(match));
  });

  return Array.from(candidates)
    .map((candidate) => normalizeTextUrl(candidate, baseUrl))
    .filter(Boolean)
    .map((url) => {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        parsed = null;
      }

      const rel = [];
      const type = inferRecordType(url);
      return {
        url,
        text: url,
        domain: getDomainFromUrl(url),
        type,
        scope: inferTextRecordScope(url, baseUrl),
        source,
        sources: [source],
        rel,
        categories: inferTextRecordCategories(url, rel),
        extension: getExtensionFromUrl(url),
        hasQuery: Boolean(parsed?.search),
        queryParamCount: parsed ? Array.from(parsed.searchParams.keys()).length : 0,
        urlLength: url.length,
        occurrences: 1
      };
    });
}

async function saveExtractedSession({ records, sourceTitle, sourceUrl, sourceDomain, openResultPage = true }) {
  const extractedLinks = mergeRecords(records);
  const extractedAt = new Date().toISOString();
  const extractionMeta = {
    sourceTitle,
    sourceUrl,
    sourceDomain,
    extractedAt,
    uniqueCount: extractedLinks.length,
    totalDiscovered: records.length,
    duplicatesRemoved: Math.max(records.length - extractedLinks.length, 0)
  };

  const historyData = await chrome.storage.local.get("linkHistory");
  const linkHistory = Array.isArray(historyData.linkHistory) ? historyData.linkHistory : [];
  linkHistory.push({
    id: makeHistoryId(),
    name: sourceTitle || sourceDomain || "Saved links",
    timestamp: extractedAt,
    sourceTitle,
    sourceUrl,
    extractionMeta,
    links: extractedLinks
  });

  await chrome.storage.local.set({ extractedLinks, extractionMeta, linkHistory });

  if (openResultPage) {
    await openWorkspacePage("result.html");
  }

  return { ok: true, extractedCount: extractedLinks.length, extractionMeta };
}

async function extractTextToAudit({ text, sourceTitle, sourceUrl, sourceDomain, baseUrl, openResultPage = true }) {
  const records = extractRecordsFromText(text, { baseUrl, source: "selected-text" });
  if (records.length === 0) {
    return { ok: false, error: "No links found in the selected text." };
  }

  return saveExtractedSession({
    records,
    sourceTitle,
    sourceUrl,
    sourceDomain,
    openResultPage
  });
}

async function getSelectedTextFromTab(tabId) {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => String(window.getSelection?.().toString() || "").trim()
  });
  return execution?.result || "";
}

async function extractSelectedTextFromTab(tabId, openResultPage = true) {
  const tab = await chrome.tabs.get(tabId);
  const selectedText = await getSelectedTextFromTab(tabId);
  return extractTextToAudit({
    text: selectedText,
    sourceTitle: `Selected text - ${tab.title || "Current page"}`,
    sourceUrl: tab.url,
    sourceDomain: tab.url ? getDomainFromUrl(tab.url) : "selected-text",
    baseUrl: tab.url,
    openResultPage
  });
}

async function extractSingleLinkFromContext(info, tab) {
  if (!info.linkUrl) {
    return { ok: false, error: "No link URL found." };
  }

  const records = extractRecordsFromText(info.linkUrl, {
    baseUrl: tab?.url || "",
    source: "context-link"
  });

  if (records.length === 0) {
    return { ok: false, error: "This link could not be read." };
  }

  records[0].text = info.linkText || info.linkUrl;
  records[0].source = "context-link";
  records[0].sources = ["context-link"];

  return saveExtractedSession({
    records,
    sourceTitle: `Right-click link - ${tab?.title || "Current page"}`,
    sourceUrl: tab?.url || info.pageUrl || info.linkUrl,
    sourceDomain: tab?.url ? getDomainFromUrl(tab.url) : getDomainFromUrl(info.linkUrl),
    openResultPage: true
  });
}

async function attachSourceTabToLatestHistory(extractionMeta) {
  if (!extractionMeta?.sourceUrl) {
    return;
  }

  const historyData = await chrome.storage.local.get("linkHistory");
  const linkHistory = Array.isArray(historyData.linkHistory) ? historyData.linkHistory : [];
  const latestIndex = linkHistory.map((entry, index) => ({ entry, index })).reverse().find(({ entry }) => {
    return entry.sourceUrl === extractionMeta.sourceUrl || entry.extractionMeta?.sourceUrl === extractionMeta.sourceUrl;
  })?.index;

  if (latestIndex === undefined) {
    return;
  }

  const nextHistory = linkHistory.slice();
  nextHistory[latestIndex] = {
    ...nextHistory[latestIndex],
    extractionMeta: {
      ...(nextHistory[latestIndex].extractionMeta || {}),
      ...extractionMeta
    }
  };
  await chrome.storage.local.set({ linkHistory: nextHistory });
}

async function extractTab(tabId, openResultPage = true) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tabId || tab?.id;
  const targetTab = tabId ? await chrome.tabs.get(tabId) : tab;
  const targetUrl = targetTab?.url;

  if (!targetTabId || !canInjectIntoUrl(targetUrl)) {
    return { ok: false, error: "This page cannot be extracted." };
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    files: ["content.js"]
  });

  const data = await chrome.storage.local.get("extractionMeta");
  const extractionMeta = {
    ...(data.extractionMeta || {}),
    sourceTabId: targetTabId,
    sourceWindowId: targetTab?.windowId
  };
  await chrome.storage.local.set({ extractionMeta });
  await attachSourceTabToLatestHistory(extractionMeta);

  if (openResultPage) {
    await openWorkspacePage("result.html");
  }

  const extractedCount = execution?.result?.extractedCount || 0;
  chrome.action.setBadgeText({ tabId: targetTabId, text: extractedCount ? String(Math.min(extractedCount, 999)) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#0f766e" });
  return { ok: true, extractedCount };
}

async function autoCaptureTab(tab) {
  if (!tab?.id || !canInjectIntoUrl(tab.url) || wasRecentlyAutoCaptured(tab)) {
    return;
  }

  const settings = await getExtensionSettings();
  if (!settings.autoCaptureTabs) {
    return;
  }

  rememberAutoCapture(tab);

  try {
    await extractTab(tab.id, false);
  } catch {
    autoCaptureRuns.delete(makeAutoCaptureKey(tab));
  }
}

async function extractAllOpenTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const extractableTabs = tabs.filter((tab) => canInjectIntoUrl(tab.url));
  const aggregateRecords = [];
  const tabSummaries = [];
  const initialHistoryData = await chrome.storage.local.get("linkHistory");
  const initialHistory = Array.isArray(initialHistoryData.linkHistory) ? initialHistoryData.linkHistory : [];

  if (extractableTabs.length === 0) {
    return { ok: false, error: "No extractable HTTP or HTTPS tabs found." };
  }

  for (const tab of extractableTabs) {
    try {
      await extractTab(tab.id, false);
      const data = await chrome.storage.local.get(["extractedLinks", "extractionMeta"]);
      const records = Array.isArray(data.extractedLinks) ? data.extractedLinks : [];
      aggregateRecords.push(...records.map((record) => ({
        ...(typeof record === "string" ? { url: record, text: record } : record),
        discoveredOn: data.extractionMeta?.sourceUrl || tab.url,
        sourceTabTitle: data.extractionMeta?.sourceTitle || tab.title || ""
      })));
      tabSummaries.push({
        title: data.extractionMeta?.sourceTitle || tab.title || "Untitled page",
        url: data.extractionMeta?.sourceUrl || tab.url,
        count: records.length
      });
    } catch {
      tabSummaries.push({
        title: tab.title || "Untitled page",
        url: tab.url,
        count: 0,
        failed: true
      });
    }
  }

  if (aggregateRecords.length === 0) {
    return { ok: false, error: "No links could be extracted from the open tabs." };
  }

  const extractedLinks = mergeRecords(aggregateRecords);
  const extractionMeta = {
    sourceTitle: "All Open Tabs",
    sourceUrl: "chrome-tabs://current-window",
    sourceDomain: "all-open-tabs",
    extractedAt: new Date().toISOString(),
    uniqueCount: extractedLinks.length,
    totalDiscovered: aggregateRecords.reduce((sum, record) => sum + (record.occurrences || 1), 0),
    duplicatesRemoved: Math.max(aggregateRecords.length - extractedLinks.length, 0),
    tabCount: extractableTabs.length,
    tabSummaries
  };

  const linkHistory = initialHistory.slice();
  linkHistory.push({
    id: makeHistoryId(),
    name: "All Open Tabs",
    timestamp: extractionMeta.extractedAt,
    sourceTitle: extractionMeta.sourceTitle,
    sourceUrl: extractionMeta.sourceUrl,
    extractionMeta,
    links: extractedLinks
  });

  await chrome.storage.local.set({ extractedLinks, extractionMeta, linkHistory });
  await openWorkspacePage("result.html");
  return { ok: true, tabCount: extractableTabs.length, linkCount: extractedLinks.length };
}

async function highlightLinksOnTab(tabId, highlights) {
  if (!tabId || !Array.isArray(highlights) || highlights.length === 0) {
    return { ok: false, error: "No source tab or links available." };
  }

  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (items) => {
      const palette = {
        healthy: "#10b981",
        redirect: "#f59e0b",
        broken: "#ef4444",
        error: "#ef4444",
        skipped: "#94a3b8",
        unchecked: "#6366f1"
      };

      const normalize = (value) => {
        try {
          return new URL(value, location.href).href;
        } catch {
          return String(value || "");
        }
      };

      document.querySelectorAll("[data-ale-highlighted]").forEach((element) => {
        element.style.outline = "";
        element.style.boxShadow = "";
        element.style.borderRadius = "";
        element.removeAttribute("data-ale-highlighted");
      });

      const previousStyle = document.getElementById("ale-highlight-style");
      if (previousStyle) {
        previousStyle.remove();
      }

      const previousSummary = document.getElementById("ale-highlight-summary");
      if (previousSummary) {
        previousSummary.remove();
      }

      const style = document.createElement("style");
      style.id = "ale-highlight-style";
      style.textContent = [
        "[data-ale-highlighted] { transition: outline-color 160ms ease, box-shadow 160ms ease; }",
        "#ale-highlight-summary { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; max-width: min(320px, calc(100vw - 36px)); padding: 12px 14px; border-radius: 14px; background: #101827; color: #f8fafc; font: 600 13px/1.45 Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; box-shadow: 0 18px 50px rgba(15, 23, 42, .26); border: 1px solid rgba(255, 255, 255, .14); }",
        "#ale-highlight-summary button { margin-left: 10px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, .14); color: #f8fafc; padding: 4px 9px; cursor: pointer; font: inherit; }"
      ].join("\n");
      document.documentElement.appendChild(style);

      const byUrl = new Map();
      items.forEach((item) => {
        const url = normalize(item.url);
        if (url) {
          byUrl.set(url, item.category || "unchecked");
        }
      });

      let count = 0;
      document.querySelectorAll("a[href]").forEach((anchor) => {
        const category = byUrl.get(normalize(anchor.getAttribute("href")));
        if (!category) {
          return;
        }

        const color = palette[category] || palette.unchecked;
        anchor.dataset.aleHighlighted = category;
        anchor.style.outline = `2px solid ${color}`;
        anchor.style.boxShadow = `0 0 0 5px color-mix(in srgb, ${color} 22%, transparent)`;
        anchor.style.borderRadius = "6px";
        count += 1;
      });

      if (count > 0) {
        const summary = document.createElement("div");
        summary.id = "ale-highlight-summary";
        const message = document.createElement("span");
        message.textContent = `All Links Extractor highlighted ${count} links on this page.`;
        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Hide";
        close.addEventListener("click", () => summary.remove());
        summary.append(message, close);
        document.body.appendChild(summary);
      }

      return count;
    },
    args: [highlights]
  });

  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  return { ok: true, count: execution?.result || 0 };
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function getMetaContent(html, name) {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i");
  const alternatePattern = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  return decodeEntities((html.match(pattern) || html.match(alternatePattern) || [])[1] || "");
}

async function fetchPreview(url) {
  if (!isHttpUrl(url)) {
    return { url, ok: false, error: "Preview only supports HTTP links." };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const description = getMetaContent(html, "description") || getMetaContent(html, "og:description");
    const image = getMetaContent(html, "og:image");

    return {
      url,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      title: title.trim(),
      description: description.trim(),
      image,
      responseTime: Math.round(performance.now() - startedAt),
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error.name === "AbortError" ? "Timeout" : error.message || "Preview failed",
      responseTime: Math.round(performance.now() - startedAt),
      fetchedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPreviews(urls) {
  const queue = [...new Set(urls)].filter(isHttpUrl);
  const results = [];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      results.push(await fetchPreview(url));
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return results;
}

async function openUrls(urls) {
  const uniqueUrls = [...new Set(urls)].filter(isHttpUrl).slice(0, BULK_OPEN_LIMIT);
  if (uniqueUrls.length === 0) {
    return { ok: false, error: "No HTTP or HTTPS links available to open." };
  }

  for (const url of uniqueUrls) {
    await chrome.tabs.create({ url, active: false });
  }
  return { ok: true, opened: uniqueUrls.length, capped: urls.length > BULK_OPEN_LIMIT };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "extract-links-current-page",
      title: "Extract links from this page",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "extract-links-selection",
      title: "Extract links from selected text",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: "extract-this-link",
      title: "Audit this link",
      contexts: ["link"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extract-links-current-page" && tab?.id) {
    extractTab(tab.id, true).catch(() => {});
  }

  if (info.menuItemId === "extract-links-selection" && tab?.id) {
    extractSelectedTextFromTab(tab.id, true)
      .catch(() => extractTextToAudit({
        text: info.selectionText || "",
        sourceTitle: `Selected text - ${tab.title || "Current page"}`,
        sourceUrl: tab.url,
        sourceDomain: tab.url ? getDomainFromUrl(tab.url) : "selected-text",
        baseUrl: tab.url,
        openResultPage: true
      }).catch(() => {}));
  }

  if (info.menuItemId === "extract-this-link") {
    extractSingleLinkFromContext(info, tab).catch(() => {});
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "extract-current-tab") {
    extractTab(null, true).catch(() => {});
  }

  if (command === "open-link-audit") {
    openWorkspacePage("result.html").catch(() => {});
  }

  if (command === "extract-selected-text") {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => (tab?.id && canInjectIntoUrl(tab.url) ? extractSelectedTextFromTab(tab.id, true) : null))
      .catch(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    autoCaptureTab(tab).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then((tab) => {
      if (tab.status === "complete") {
        return autoCaptureTab(tab);
      }
      return null;
    })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "openResultPage") {
    openWorkspacePage("result.html").catch(() => {});
  }

  if (msg.action === "openHistoryPage") {
    openWorkspacePage("history.html").catch(() => {});
  }

  if (msg.action === "openSettingsPage") {
    openWorkspacePage("settings.html").catch(() => {});
  }

  if (msg.action === "openPrivacyPage") {
    openWorkspacePage("privacy.html").catch(() => {});
  }

  if (msg.action === "openFeedbackPage") {
    openWorkspacePage("feedback.html").catch(() => {});
  }

  if (msg.action === "extractCurrentTab") {
    extractTab(null, Boolean(msg.openResultPage))
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not extract current tab" }));
    return true;
  }

  if (msg.action === "extractSelectedText") {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => {
        if (!tab?.id || !canInjectIntoUrl(tab.url)) {
          return { ok: false, error: "Open an HTTP or HTTPS page and select text that contains links." };
        }

        return extractSelectedTextFromTab(tab.id, Boolean(msg.openResultPage));
      })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not extract selected text" }));
    return true;
  }

  if (msg.action === "extractText") {
    extractTextToAudit({
      text: msg.text || "",
      sourceTitle: msg.sourceTitle || "Text links",
      sourceUrl: msg.sourceUrl || "text://manual-input",
      sourceDomain: msg.sourceDomain || "manual-input",
      baseUrl: msg.baseUrl || "",
      openResultPage: Boolean(msg.openResultPage)
    })
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not extract text links" }));
    return true;
  }

  if (msg.action === "checkLinks") {
    runHealthChecks(Array.isArray(msg.urls) ? msg.urls : [])
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Health check failed" }));
    return true;
  }

  if (msg.action === "fetchPreviews") {
    runPreviews(Array.isArray(msg.urls) ? msg.urls : [])
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Preview fetch failed" }));
    return true;
  }

  if (msg.action === "highlightLinks") {
    highlightLinksOnTab(msg.tabId, Array.isArray(msg.highlights) ? msg.highlights : [])
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not highlight source page" }));
    return true;
  }

  if (msg.action === "openUrls") {
    openUrls(Array.isArray(msg.urls) ? msg.urls : [])
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not open links" }));
    return true;
  }

  if (msg.action === "extractAllOpenTabs") {
    extractAllOpenTabs()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Could not extract open tabs" }));
    return true;
  }
});
