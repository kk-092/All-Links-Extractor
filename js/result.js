const linkGroups = document.getElementById("linkGroups");
const resultSummary = document.getElementById("resultSummary");
const sourceSummary = document.getElementById("sourceSummary");
const emptyState = document.getElementById("emptyState");
const pageLoader = document.getElementById("pageLoader");
const pageLoaderText = document.getElementById("pageLoaderText");
const searchInput = document.getElementById("searchInput");
const scopeFilter = document.getElementById("scopeFilter");
const groupByDomain = document.getElementById("groupByDomain");
const domainFilter = document.getElementById("domainFilter");
const extensionFilter = document.getElementById("extensionFilter");
const relFilter = document.getElementById("relFilter");
const categoryFilter = document.getElementById("categoryFilter");
const queryFilter = document.getElementById("queryFilter");
const urlLengthFilter = document.getElementById("urlLengthFilter");
const regexFilter = document.getElementById("regexFilter");
const sortBy = document.getElementById("sortBy");
const healthFilter = document.getElementById("healthFilter");
const healthProgress = document.getElementById("healthProgress");
const crawlDepth = document.getElementById("crawlDepth");
const crawlLimit = document.getElementById("crawlLimit");
const crawlSameDomain = document.getElementById("crawlSameDomain");
const crawlSitemap = document.getElementById("crawlSitemap");
const crawlProgress = document.getElementById("crawlProgress");
const scopeDonut = document.getElementById("scopeDonut");
const scopeDonutTotal = document.getElementById("scopeDonutTotal");
const scopeDonutLabel = document.getElementById("scopeDonutLabel");
const scopeLegend = document.getElementById("scopeLegend");
const topDomains = document.getElementById("topDomains");
const typeBreakdown = document.getElementById("typeBreakdown");
const healthBreakdown = document.getElementById("healthBreakdown");
const siteMap = document.getElementById("siteMap");
const copyScope = document.getElementById("copyScope");
const copyFormat = document.getElementById("copyFormat");
const exportScope = document.getElementById("exportScope");
const fileNameInput = document.getElementById("fileName");
const typeFilters = document.getElementById("typeFilters");
const selectedUrls = new Set();
const backToTopButton = document.getElementById("backToTop");

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

const REVIEW_PROMPT_THRESHOLD = 5;
const REVIEW_PROMPT_COOLDOWN_DAYS = 14;
let renderDebounceTimer = null;

function t(value) {
  return window.AllLinksI18n?.t?.(value) || value;
}

const state = {
  links: [],
  meta: {},
  health: {},
  previews: {},
  crawl: {
    running: false,
    stopRequested: false
  },
  activeType: "all",
  settings: { ...DEFAULT_SETTINGS }
};

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

function setPageLoading(isLoading, message = "Loading workspace...") {
  pageLoaderText.textContent = message;
  pageLoader.classList.toggle("d-none", !isLoading);
}

function setInlineLoading(element, isLoading, message) {
  if (message !== undefined) {
    element.textContent = message;
  }
  element.classList.toggle("loading-status", isLoading);
}

function setButtonLoading(button, isLoading, busyLabel) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }

  button.classList.toggle("is-busy", isLoading);
  button.disabled = isLoading;
  button.textContent = isLoading && busyLabel ? busyLabel : button.dataset.defaultText;
}

function debounceRender() {
  clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(render, 90);
}

function trackSuccessfulAction(actionName) {
  chrome.storage.local.get("usageStats", (data) => {
    const usageStats = {
      successfulActions: 0,
      reviewPromptDismissed: false,
      ...(data.usageStats || {})
    };

    chrome.storage.local.set({
      usageStats: {
        ...usageStats,
        successfulActions: (usageStats.successfulActions || 0) + 1,
        lastAction: actionName,
        lastActionAt: new Date().toISOString()
      }
    });
  });
}

function showReviewPrompt() {
  const backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";

  const card = document.createElement("div");
  card.className = "dialog-card";

  const heading = document.createElement("h2");
  heading.textContent = "Is All Links Extractor helping?";

  const body = document.createElement("p");
  body.textContent = "A Chrome Web Store review helps more people find the extension. If something feels off, send feedback instead.";

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const laterButton = document.createElement("button");
  laterButton.className = "btn btn-outline-secondary";
  laterButton.textContent = "Later";
  laterButton.addEventListener("click", () => {
    chrome.storage.local.get("usageStats", (data) => {
      chrome.storage.local.set({
        usageStats: {
          ...(data.usageStats || {}),
          lastReviewPromptAt: new Date().toISOString()
        }
      });
    });
    backdrop.remove();
  });

  const feedbackLink = document.createElement("a");
  feedbackLink.className = "btn btn-outline-secondary";
  feedbackLink.href = "/feedback.html";
  feedbackLink.textContent = "Send Feedback";

  const doneButton = document.createElement("button");
  doneButton.className = "btn btn-secondary";
  doneButton.textContent = "I will review";
  doneButton.addEventListener("click", () => {
    chrome.storage.local.get("usageStats", (data) => {
      chrome.storage.local.set({
        usageStats: {
          ...(data.usageStats || {}),
          reviewPromptDismissed: true,
          lastReviewPromptAt: new Date().toISOString()
        }
      });
    });
    backdrop.remove();
    notify("Thank you. Your review helps a lot.");
  });

  actions.append(laterButton, feedbackLink, doneButton);
  card.append(heading, body, actions);
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);
}

function maybeShowReviewPrompt() {
  chrome.storage.local.get("usageStats", (data) => {
    const usageStats = data.usageStats || {};
    if (usageStats.reviewPromptDismissed || (usageStats.successfulActions || 0) < REVIEW_PROMPT_THRESHOLD) {
      return;
    }

    const lastPrompt = usageStats.lastReviewPromptAt ? new Date(usageStats.lastReviewPromptAt) : null;
    const cooldownMs = REVIEW_PROMPT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (lastPrompt && Date.now() - lastPrompt.getTime() < cooldownMs) {
      return;
    }

    showReviewPrompt();
  });
}

const imageExtensions = [".apng", ".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"];
const videoExtensions = [".avi", ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm"];
const audioExtensions = [".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".wav"];
const fileExtensions = [".7z", ".br", ".csv", ".dmg", ".doc", ".docx", ".gz", ".iso", ".msi", ".pdf", ".ppt", ".pptx", ".rar", ".tar", ".tgz", ".txt", ".xls", ".xlsx", ".zip"];
const trackingParams = [
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "ref_src",
  "spm",
  "utm_campaign",
  "utm_content",
  "utm_id",
  "utm_medium",
  "utm_source",
  "utm_term"
];
const affiliateParams = ["aff", "affiliate", "camp", "clickbank", "hop", "partner", "ref", "tag"];
const affiliateDomains = ["amazon.", "amzn.to", "clickbank.", "impact.com", "linksynergy.", "shareasale."];
const socialDomains = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com"
];

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function getDomain(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "unknown";
  }

  if (parsed.protocol === "mailto:") {
    const email = parsed.pathname.split("?")[0];
    return email.includes("@") ? email.split("@").pop().toLowerCase() : "email";
  }

  if (parsed.protocol === "tel:") {
    return "phone";
  }

  return parsed.hostname.replace(/^www\./, "").toLowerCase() || parsed.protocol.replace(":", "");
}

function getExtension(url) {
  const parsed = parseUrl(url);
  if (!parsed) {
    return "";
  }

  const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match ? `.${match[1]}` : "";
}

function hasPathExtension(url, extensions) {
  return extensions.includes(getExtension(url));
}

function isSocialDomain(domain) {
  return socialDomains.some((socialDomain) => domain === socialDomain || domain.endsWith(`.${socialDomain}`));
}

function getRootDomain(hostname) {
  const parts = String(hostname || "").replace(/^www\./, "").split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
}

function inferType(url) {
  const parsed = parseUrl(url);
  const domain = getDomain(url);

  if (!parsed) {
    return "Unknown";
  }

  if (parsed.protocol === "mailto:") {
    return "Email";
  }

  if (parsed.protocol === "tel:") {
    return "Phone";
  }

  if (hasPathExtension(url, [".pdf"])) {
    return "PDF";
  }

  if (hasPathExtension(url, imageExtensions)) {
    return "Image";
  }

  if (hasPathExtension(url, videoExtensions)) {
    return "Video";
  }

  if (hasPathExtension(url, audioExtensions)) {
    return "Audio";
  }

  if (isSocialDomain(domain)) {
    return "Social";
  }

  if (hasPathExtension(url, fileExtensions)) {
    return "Download";
  }

  return "Web";
}

function inferScope(url, sourceUrl) {
  const parsed = parseUrl(url);
  const source = parseUrl(sourceUrl);

  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return "Other";
  }

  if (source && parsed.origin === source.origin) {
    return "Internal";
  }

  if (source && getRootDomain(parsed.hostname) === getRootDomain(source.hostname)) {
    return "Subdomain";
  }

  return "External";
}

function parseUrlFrom(value, baseUrl) {
  try {
    return new URL(value, baseUrl || state.meta.sourceUrl || window.location.href);
  } catch {
    return null;
  }
}

function normalizeCrawlUrl(value, baseUrl) {
  const parsed = parseUrlFrom(value, baseUrl);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return "";
  }

  parsed.hash = "";
  return parsed.href;
}

function cleanupUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return value;
  }

  parsed.hash = "";
  Array.from(parsed.searchParams.keys()).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (trackingParams.includes(lowerKey) || lowerKey.startsWith("utm_")) {
      parsed.searchParams.delete(key);
    }
  });

  return parsed.href;
}

function getUrlCleanupInfo(value) {
  const parsed = parseUrl(value);
  if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
    return {
      cleanUrl: value,
      removedTrackingParams: [],
      removedFragment: false,
      changed: false
    };
  }

  const removedTrackingParams = [];
  const removedFragment = Boolean(parsed.hash);
  parsed.hash = "";

  Array.from(parsed.searchParams.keys()).forEach((key) => {
    const lowerKey = key.toLowerCase();
    if (trackingParams.includes(lowerKey) || lowerKey.startsWith("utm_")) {
      removedTrackingParams.push(key);
      parsed.searchParams.delete(key);
    }
  });

  const cleanUrl = parsed.href;
  return {
    cleanUrl,
    removedTrackingParams,
    removedFragment,
    changed: cleanUrl !== value
  };
}

function inferCategories(url, rel = []) {
  const parsed = parseUrl(url);
  const domain = getDomain(url);
  const type = inferType(url);
  const params = parsed ? Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase()) : [];
  const lowerUrl = url.toLowerCase();
  const categories = [];

  if (["Image", "Video", "Audio"].includes(type)) {
    categories.push("Media");
  }

  if (["PDF", "Download"].includes(type) || hasPathExtension(url, fileExtensions)) {
    categories.push("Download");
  }

  if (params.some((param) => trackingParams.includes(param) || param.startsWith("utm_"))) {
    categories.push("Tracking");
  }

  if (
    rel.includes("sponsored") ||
    params.some((param) => affiliateParams.includes(param)) ||
    affiliateDomains.some((affiliateDomain) => lowerUrl.includes(affiliateDomain))
  ) {
    categories.push("Affiliate");
  }

  if (isSocialDomain(domain)) {
    categories.push("Social");
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

  return Array.from(new Set(categories));
}

function createRecordFromUrl({ url, text, source = "crawl", sourceUrl = state.meta.sourceUrl, rel = [] }) {
  const safeUrl = normalizeCrawlUrl(url, sourceUrl);
  if (!safeUrl) {
    return null;
  }

  const parsed = parseUrl(safeUrl);
  const domain = getDomain(safeUrl);
  const type = inferType(safeUrl);
  const cleanupInfo = getUrlCleanupInfo(safeUrl);

  return {
    id: `${safeUrl}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url: safeUrl,
    cleanUrl: cleanupInfo.cleanUrl,
    isCleanedUrl: cleanupInfo.changed,
    removedTrackingParams: cleanupInfo.removedTrackingParams,
    removedFragment: cleanupInfo.removedFragment,
    text: String(text || safeUrl).trim() || safeUrl,
    domain,
    rootDomain: parsed ? getRootDomain(parsed.hostname) : domain,
    type,
    scope: inferScope(safeUrl, state.meta.sourceUrl || sourceUrl),
    source,
    sources: [source],
    rel,
    categories: inferCategories(safeUrl, rel),
    extension: getExtension(safeUrl),
    hasQuery: Boolean(parsed?.search),
    queryParamCount: parsed ? Array.from(parsed.searchParams.keys()).length : 0,
    urlLength: safeUrl.length,
    isHidden: false,
    isEmptyAnchor: source === "crawl-anchor" && !String(text || "").trim(),
    hreflangs: [],
    discoveredOn: sourceUrl,
    occurrences: 1
  };
}

function mergeLinkRecord(record) {
  if (!record?.url) {
    return false;
  }

  const existing = state.links.find((link) => link.url === record.url);
  if (!existing) {
    state.links.push(record);
    return true;
  }

  existing.occurrences += record.occurrences || 1;
  existing.sources = Array.from(new Set([...(existing.sources || []), ...(record.sources || [record.source])].filter(Boolean)));
  existing.categories = Array.from(new Set([...(existing.categories || []), ...(record.categories || [])]));
  existing.rel = Array.from(new Set([...(existing.rel || []), ...(record.rel || [])]));
  if (!existing.discoveredOn && record.discoveredOn) {
    existing.discoveredOn = record.discoveredOn;
  }
  if ((!existing.text || existing.text === existing.url) && record.text) {
    existing.text = record.text;
  }
  return false;
}

function extractRecordsFromHtml(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const records = [];
  const addRecord = (url, text, source, rel = []) => {
    const record = createRecordFromUrl({ url, text, source, sourceUrl: pageUrl, rel });
    if (record) {
      records.push(record);
    }
  };
  const getRel = (element) => String(element.getAttribute("rel") || "").toLowerCase().split(/\s+/).filter(Boolean);

  doc.querySelectorAll("a[href]").forEach((element) => {
    addRecord(element.getAttribute("href"), element.textContent, "crawl-anchor", getRel(element));
  });

  doc.querySelectorAll("img[src], image[href]").forEach((element) => {
    addRecord(element.getAttribute("src") || element.getAttribute("href"), element.getAttribute("alt") || "Image", "crawl-image");
  });

  doc.querySelectorAll("video[src], video[poster], audio[src], source[src], track[src]").forEach((element) => {
    addRecord(element.getAttribute("src") || element.getAttribute("poster"), "Media", "crawl-media");
  });

  doc.querySelectorAll("embed[src], iframe[src], object[data]").forEach((element) => {
    addRecord(element.getAttribute("src") || element.getAttribute("data"), element.tagName === "IFRAME" ? "Iframe" : "Embedded resource", "crawl-embed");
  });

  doc.querySelectorAll("link[href]").forEach((element) => {
    const rel = getRel(element);
    if (rel.includes("canonical") || rel.includes("alternate") || rel.includes("preload") || rel.includes("prefetch")) {
      addRecord(element.getAttribute("href"), rel.includes("canonical") ? "Canonical URL" : `Link ${rel.join(" ")}`, "crawl-resource", rel);
    }
  });

  doc.querySelectorAll("script[src]").forEach((element) => {
    addRecord(element.getAttribute("src"), "Script source", "crawl-script");
  });

  doc.querySelectorAll("script:not([src])").forEach((element) => {
    const matches = String(element.textContent || "").match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
    matches.forEach((url) => addRecord(url, "Inline script URL", "crawl-inline-script"));
  });

  return records;
}

function normalizeRecord(record, index, meta) {
  const url = typeof record === "string" ? record : record?.url;
  const safeUrl = String(url || "").trim();
  const parsed = parseUrl(safeUrl);
  const cleanupInfo = typeof record === "object" && record?.cleanUrl
    ? {
      cleanUrl: record.cleanUrl,
      removedTrackingParams: Array.isArray(record.removedTrackingParams) ? record.removedTrackingParams : [],
      removedFragment: Boolean(record.removedFragment),
      changed: Boolean(record.isCleanedUrl || record.cleanUrl !== safeUrl)
    }
    : getUrlCleanupInfo(safeUrl);
  const domain = typeof record === "object" && record?.domain ? record.domain : getDomain(safeUrl);
  const type = typeof record === "object" && record?.type ? record.type : inferType(safeUrl);
  const scope = typeof record === "object" && record?.scope ? record.scope : inferScope(safeUrl, meta.sourceUrl);
  const text = typeof record === "object" && record?.text ? record.text : safeUrl;
  const occurrences = Number.isFinite(record?.occurrences) ? record.occurrences : 1;
  const rel = Array.isArray(record?.rel) ? record.rel : [];
  const categories = Array.isArray(record?.categories) ? record.categories : [];
  const sources = Array.isArray(record?.sources) ? record.sources : record?.source ? [record.source] : ["stored"];

  return {
    id: `${safeUrl}-${index}`,
    url: safeUrl,
    cleanUrl: cleanupInfo.cleanUrl,
    isCleanedUrl: cleanupInfo.changed,
    removedTrackingParams: cleanupInfo.removedTrackingParams,
    removedFragment: cleanupInfo.removedFragment,
    text,
    domain,
    rootDomain: typeof record === "object" && record?.rootDomain ? record.rootDomain : domain,
    type,
    scope,
    source: typeof record === "object" && record?.source ? record.source : "stored",
    sources,
    rel,
    categories,
    extension: typeof record === "object" && record?.extension !== undefined ? record.extension : getExtension(safeUrl),
    hasQuery: typeof record === "object" && record?.hasQuery !== undefined ? record.hasQuery : Boolean(parsed?.search),
    queryParamCount: Number.isFinite(record?.queryParamCount) ? record.queryParamCount : parsed ? Array.from(parsed.searchParams.keys()).length : 0,
    urlLength: Number.isFinite(record?.urlLength) ? record.urlLength : safeUrl.length,
    isHidden: Boolean(record?.isHidden),
    isEmptyAnchor: Boolean(record?.isEmptyAnchor),
    hreflangs: Array.isArray(record?.hreflangs) ? record.hreflangs : [],
    discoveredOn: typeof record === "object" && record?.discoveredOn ? record.discoveredOn : "",
    occurrences
  };
}

function resolveTheme(theme) {
  if (theme === "system") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applySettings(settings) {
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  document.documentElement.dataset.theme = resolveTheme(state.settings.theme);
  document.documentElement.dataset.accent = state.settings.accent;
  document.documentElement.dataset.density = state.settings.compactRows ? "compact" : "comfortable";
  window.AllLinksI18n?.apply?.(state.settings.language || "system");

  groupByDomain.checked = state.settings.defaultGroupByDomain;
  copyScope.value = state.settings.defaultCopyScope;
  copyFormat.value = state.settings.defaultCopyFormat;
  exportScope.value = state.settings.defaultExportScope;
}

function getDateLocale() {
  if (!state.settings?.language || state.settings.language === "system") {
    return undefined;
  }
  return state.settings.language.replace("_", "-");
}

function getVisibleLinks() {
  const query = searchInput.value.trim().toLowerCase();
  const domainQuery = domainFilter.value.trim().toLowerCase();
  const extensionQuery = extensionFilter.value.trim().toLowerCase();
  const regexQuery = regexFilter.value.trim();
  const activeScope = scopeFilter.value;
  const activeRel = relFilter.value;
  const activeCategory = categoryFilter.value;
  const activeQuery = queryFilter.value;
  const activeLength = urlLengthFilter.value;
  const activeHealth = healthFilter.value;
  let regex = null;

  if (regexQuery) {
    try {
      regex = new RegExp(regexQuery, "i");
    } catch {
      regex = null;
    }
  }

  const filteredLinks = state.links.filter((link) => {
    const haystack = [
      link.url,
      link.cleanUrl,
      link.text,
      link.domain,
      link.type,
      link.scope,
      link.extension,
      link.categories.join(" "),
      link.rel.join(" "),
      link.sources.join(" ")
    ].join(" ").toLowerCase();

    const matchesSearch = !query || haystack.includes(query);
    const matchesDomain = !domainQuery || link.domain.toLowerCase().includes(domainQuery);
    const expectedExtension = extensionQuery.startsWith(".") ? extensionQuery : `.${extensionQuery}`;
    const matchesExtension = !extensionQuery || link.extension.toLowerCase() === expectedExtension;
    const matchesType = state.activeType === "all" || link.type.toLowerCase() === state.activeType;
    const matchesScope = activeScope === "all" || link.scope.toLowerCase() === activeScope;
    const matchesRel =
      activeRel === "all" ||
      (activeRel === "dofollow" && !link.rel.includes("nofollow")) ||
      link.rel.includes(activeRel);
    const matchesCategory =
      activeCategory === "all" ||
      (activeCategory === "hidden" && link.isHidden) ||
      (activeCategory === "empty-anchor" && link.isEmptyAnchor) ||
      (activeCategory === "cleanable" && link.isCleanedUrl) ||
      link.categories.map((category) => category.toLowerCase()).includes(activeCategory);
    const matchesQuery =
      activeQuery === "all" ||
      (activeQuery === "with-query" && link.hasQuery) ||
      (activeQuery === "without-query" && !link.hasQuery);
    const matchesLength =
      activeLength === "all" ||
      (activeLength === "short" && link.urlLength < 80) ||
      (activeLength === "medium" && link.urlLength >= 80 && link.urlLength <= 160) ||
      (activeLength === "long" && link.urlLength > 160);
    const linkHealth = state.health[link.url];
    const healthCategory = linkHealth?.category || "unchecked";
    const matchesHealth = activeHealth === "all" || healthCategory === activeHealth;
    const matchesRegex = !regex || regex.test(link.url) || regex.test(link.text);

    return matchesSearch && matchesDomain && matchesExtension && matchesType && matchesScope && matchesRel && matchesCategory && matchesQuery && matchesLength && matchesHealth && matchesRegex;
  });

  return filteredLinks.sort((a, b) => {
    const selectedSort = sortBy.value;
    if (selectedSort === "length") {
      return a.urlLength - b.urlLength;
    }
    if (selectedSort === "occurrences") {
      return b.occurrences - a.occurrences;
    }
    if (selectedSort === "responseTime") {
      return (state.health[a.url]?.responseTime || Number.MAX_SAFE_INTEGER) - (state.health[b.url]?.responseTime || Number.MAX_SAFE_INTEGER);
    }
    if (selectedSort === "health") {
      return (state.health[a.url]?.category || "unchecked").localeCompare(state.health[b.url]?.category || "unchecked");
    }
    if (selectedSort === "anchor") {
      return a.text.localeCompare(b.text);
    }
    return String(a[selectedSort] || a.url).localeCompare(String(b[selectedSort] || b.url));
  });
}

function getLinksByScope(scope) {
  if (scope === "all") {
    return state.links;
  }

  if (scope === "visible") {
    return getVisibleLinks();
  }

  return state.links.filter((link) => selectedUrls.has(link.url));
}

function getStats() {
  const total = state.links.reduce((sum, link) => sum + link.occurrences, 0);
  const unique = state.links.length;
  const duplicates = Math.max(total - unique, 0);

  return {
    total,
    unique,
    duplicates,
    internal: state.links.filter((link) => link.scope === "Internal").length,
    external: state.links.filter((link) => link.scope === "External").length,
    pdf: state.links.filter((link) => link.type === "PDF").length,
    cleanable: state.links.filter((link) => link.isCleanedUrl).length,
    healthy: state.links.filter((link) => state.health[link.url]?.category === "healthy").length,
    redirects: state.links.filter((link) => state.health[link.url]?.category === "redirect").length,
    broken: state.links.filter((link) => ["broken", "error"].includes(state.health[link.url]?.category)).length,
    nofollow: state.links.filter((link) => link.rel.includes("nofollow")).length,
    sponsoredUgc: state.links.filter((link) => link.rel.includes("sponsored") || link.rel.includes("ugc")).length,
    emptyAnchors: state.links.filter((link) => link.isEmptyAnchor).length
  };
}

function updateStats() {
  const stats = getStats();
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statUnique").textContent = stats.unique;
  document.getElementById("statInternal").textContent = stats.internal;
  document.getElementById("statExternal").textContent = stats.external;
  document.getElementById("statPdf").textContent = stats.pdf;
  document.getElementById("statDuplicates").textContent = stats.duplicates;
  document.getElementById("statCleanable").textContent = stats.cleanable;
  document.getElementById("statHealthy").textContent = stats.healthy;
  document.getElementById("statRedirects").textContent = stats.redirects;
  document.getElementById("statBroken").textContent = stats.broken;
  document.getElementById("statNofollow").textContent = stats.nofollow;
  document.getElementById("statSponsoredUgc").textContent = stats.sponsoredUgc;
  document.getElementById("statEmptyAnchors").textContent = stats.emptyAnchors;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(getDateLocale());
}

function updateSourceSummary() {
  const parts = [];
  if (state.meta.sourceTitle) {
    parts.push(state.meta.sourceTitle);
  }
  if (state.meta.sourceUrl) {
    parts.push(state.meta.sourceUrl);
  }
  if (state.meta.extractedAt) {
    parts.push(`${t("Extracted")} ${formatDate(state.meta.extractedAt)}`);
  }
  if (state.meta.crawledPages) {
    parts.push(`${t("Crawled")} ${state.meta.crawledPages} ${t("pages")}`);
  }
  sourceSummary.textContent = parts.length ? parts.join(" | ") : "No source page details available.";
}

function updateSummary() {
  const visibleCount = getVisibleLinks().length;
  const selectedCount = selectedUrls.size;
  const totalCount = state.links.length;
  const previewCount = Object.keys(state.previews).length;
  resultSummary.textContent = `${visibleCount} visible of ${totalCount} links. ${selectedCount} selected. ${previewCount} previews cached.`;
}

function setActionState() {
  const hasLinks = state.links.length > 0;
  document.querySelectorAll(".action-button, #selectVisible, #clearSelection, #openSelectedLinks, #fetchVisiblePreviews, #highlightOnPage").forEach((button) => {
    if (["startCrawl", "stopCrawl"].includes(button.id)) {
      return;
    }
    button.disabled = !hasLinks;
  });
  document.getElementById("startCrawl").disabled = state.crawl.running || !getCrawlStartUrl();
  document.getElementById("stopCrawl").disabled = !state.crawl.running;
}

function updateEmptyState(visibleCount) {
  const title = emptyState.querySelector("strong");
  const message = emptyState.querySelector("span");

  if (state.links.length === 0) {
    title.textContent = "No links loaded yet.";
    message.textContent = "Open any website, click the extension icon, then press Extract. This page will show filters, exports, reports, and health checks.";
    emptyState.classList.remove("d-none");
    return;
  }

  if (visibleCount === 0) {
    title.textContent = "No links match these filters.";
    message.textContent = "Clear search or loosen filters to bring results back.";
    emptyState.classList.remove("d-none");
    return;
  }

  emptyState.classList.add("d-none");
}

function createBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = `badge-soft ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item) || "Unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function getTopEntries(counts, limit = 5) {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function createEmptyAnalytics(message) {
  const empty = document.createElement("p");
  empty.className = "analytics-empty";
  empty.textContent = message;
  return empty;
}

function renderAnalyticsList(container, entries, total, emptyMessage) {
  container.replaceChildren();

  if (entries.length === 0) {
    container.appendChild(createEmptyAnalytics(emptyMessage));
    return;
  }

  entries.forEach(([name, count]) => {
    const row = document.createElement("div");
    row.className = "analytics-row";

    const top = document.createElement("div");
    top.className = "analytics-row-top";

    const label = document.createElement("span");
    label.className = "analytics-name";
    label.title = name;
    label.textContent = name;

    const value = document.createElement("span");
    value.className = "analytics-count";
    value.textContent = String(count);

    const bar = document.createElement("div");
    bar.className = "analytics-bar";

    const fill = document.createElement("span");
    fill.className = "analytics-bar-fill";
    fill.style.width = `${Math.max(3, Math.round((count / Math.max(total, 1)) * 100))}%`;

    top.append(label, value);
    bar.appendChild(fill);
    row.append(top, bar);
    container.appendChild(row);
  });
}

function renderScopeDonut(links) {
  const counts = {
    internal: links.filter((link) => link.scope === "Internal").length,
    subdomain: links.filter((link) => link.scope === "Subdomain").length,
    external: links.filter((link) => link.scope === "External").length,
    other: links.filter((link) => link.scope === "Other").length
  };
  const total = links.length || 1;
  const internalEnd = (counts.internal / total) * 100;
  const subdomainEnd = internalEnd + (counts.subdomain / total) * 100;
  const externalEnd = subdomainEnd + (counts.external / total) * 100;
  const otherEnd = externalEnd + (counts.other / total) * 100;

  scopeDonut.style.background = `conic-gradient(var(--accent) 0 ${internalEnd}%, #4f46e5 ${internalEnd}% ${subdomainEnd}%, #e11d48 ${subdomainEnd}% ${externalEnd}%, #64748b ${externalEnd}% ${otherEnd}%, var(--surface-solid) ${otherEnd}% 100%)`;
  scopeDonutTotal.textContent = String(links.length || 0);
  scopeDonutLabel.textContent = links.length ? t("Link reach overview") : t("No links yet");
  scopeLegend.replaceChildren();

  [
    { label: "Internal", count: counts.internal, color: "var(--accent)" },
    { label: "Subdomain", count: counts.subdomain, color: "#4f46e5" },
    { label: "External", count: counts.external, color: "#e11d48" },
    { label: "Other", count: counts.other, color: "#64748b" }
  ].forEach((item) => {
    const row = document.createElement("div");
    row.className = "scope-legend-item";
    row.style.setProperty("--scope-color", item.color);

    const dot = document.createElement("span");
    dot.className = "scope-legend-dot";

    const name = document.createElement("span");
    name.className = "scope-legend-name";
    name.textContent = t(item.label);

    const value = document.createElement("strong");
    value.textContent = `${item.count} (${Math.round((item.count / total) * 100)}%)`;

    row.append(dot, name, value);
    scopeLegend.appendChild(row);
  });
}

function renderSiteMap(links) {
  siteMap.replaceChildren();
  const sourceUrl = state.meta.sourceUrl || "Current page";
  const internalLinks = links.filter((link) => ["Internal", "Subdomain"].includes(link.scope));
  const groups = internalLinks.reduce((map, link) => {
    const page = link.discoveredOn || sourceUrl;
    if (!map.has(page)) {
      map.set(page, []);
    }
    map.get(page).push(link);
    return map;
  }, new Map());

  if (groups.size === 0) {
    siteMap.appendChild(createEmptyAnalytics("No internal crawl map available yet."));
    return;
  }

  Array.from(groups.entries()).slice(0, 8).forEach(([page, pageLinks]) => {
    const pageBlock = document.createElement("div");
    pageBlock.className = "map-page";

    const title = document.createElement("div");
    title.className = "map-page-title";
    title.textContent = page;

    const list = document.createElement("ul");
    list.className = "map-links";
    pageLinks.slice(0, 8).forEach((link) => {
      const item = document.createElement("li");
      item.textContent = link.text && link.text !== link.url ? `${link.text} | ${link.url}` : link.url;
      list.appendChild(item);
    });

    if (pageLinks.length > 8) {
      const more = document.createElement("li");
      more.textContent = `${pageLinks.length - 8} more links`;
      list.appendChild(more);
    }

    pageBlock.append(title, list);
    siteMap.appendChild(pageBlock);
  });
}

function renderAnalytics() {
  const links = state.links;
  const healthEntries = links.map((link) => state.health[link.url]?.category || "unchecked");

  renderScopeDonut(links);
  renderAnalyticsList(topDomains, getTopEntries(countBy(links, (link) => link.domain), 6), links.length, "No domains yet.");
  renderAnalyticsList(typeBreakdown, getTopEntries(countBy(links, (link) => link.type), 6), links.length, "No link types yet.");
  renderAnalyticsList(healthBreakdown, getTopEntries(countBy(healthEntries, (value) => value), 6), links.length, "No health data yet.");
  renderSiteMap(links);
}

function getHealthLabel(health) {
  if (!health) {
    return "Unchecked";
  }

  if (health.category === "healthy") {
    return `${health.status} OK${health.responseTime ? ` | ${health.responseTime}ms` : ""}`;
  }

  if (health.category === "redirect") {
    return `${health.status || "Redirect"} Redirect${health.responseTime ? ` | ${health.responseTime}ms` : ""}`;
  }

  if (health.category === "skipped") {
    return "Skipped";
  }

  if (health.error) {
    return health.error;
  }

  return `${health.status || "Broken"} ${health.statusText || ""}`.trim();
}

function createLinkRow(link) {
  const item = document.createElement("li");
  item.className = "link-item";

  const row = document.createElement("div");
  row.className = "link-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "form-check-input link-checkbox";
  checkbox.checked = selectedUrls.has(link.url);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      selectedUrls.add(link.url);
    } else {
      selectedUrls.delete(link.url);
    }
    updateSummary();
  });

  const main = document.createElement("div");
  main.className = "link-main";

  const title = document.createElement("span");
  title.className = "link-title";
  title.textContent = link.text || link.url;

  const url = document.createElement("a");
  url.className = "link-url";
  url.href = link.url;
  url.target = "_blank";
  url.rel = "noopener noreferrer";
  url.textContent = link.url;

  const cleanUrl = document.createElement("a");
  cleanUrl.className = "link-url link-clean-url";
  cleanUrl.href = link.cleanUrl || link.url;
  cleanUrl.target = "_blank";
  cleanUrl.rel = "noopener noreferrer";
  cleanUrl.textContent = link.isCleanedUrl ? `Clean: ${link.cleanUrl}` : "";
  cleanUrl.hidden = !link.isCleanedUrl;

  const meta = document.createElement("div");
  meta.className = "link-meta";
  const health = state.health[link.url];
  const healthCategory = health?.category || "unchecked";
  meta.append(
    createBadge(link.type, "badge-type"),
    createBadge(link.scope),
    createBadge(link.domain),
    createBadge(getHealthLabel(health), `badge-health-${healthCategory}`)
  );

  if (state.settings.showOccurrences && link.occurrences > 1) {
    meta.appendChild(createBadge(`${link.occurrences} occurrences`, "badge-duplicate"));
  }

  if (link.extension) {
    meta.appendChild(createBadge(link.extension));
  }

  if (link.isCleanedUrl) {
    meta.appendChild(createBadge("Clean URL available", "badge-clean"));
  }

  if (link.removedTrackingParams?.length) {
    meta.appendChild(createBadge(`removed: ${link.removedTrackingParams.join(", ")}`, "badge-clean"));
  }

  if (link.removedFragment) {
    meta.appendChild(createBadge("fragment removed", "badge-clean"));
  }

  if (link.rel.length > 0) {
    meta.appendChild(createBadge(`rel: ${link.rel.join(" ")}`));
  }

  link.categories.forEach((category) => {
    meta.appendChild(createBadge(category));
  });

  if (link.isHidden) {
    meta.appendChild(createBadge("Hidden"));
  }

  if (link.isEmptyAnchor) {
    meta.appendChild(createBadge("Empty anchor"));
  }

  if (health?.finalUrl && health.finalUrl !== link.url) {
    meta.appendChild(createBadge(`Final: ${health.finalUrl}`));
  }

  const preview = state.previews[link.url];
  if (preview?.title || preview?.description || preview?.error) {
    const previewCard = document.createElement("div");
    previewCard.className = "link-preview";

    const previewTitle = document.createElement("strong");
    previewTitle.textContent = preview.title || preview.error || "No preview title";

    const previewDescription = document.createElement("span");
    previewDescription.textContent = preview.description || preview.finalUrl || "";

    previewCard.append(previewTitle);
    if (previewDescription.textContent) {
      previewCard.appendChild(previewDescription);
    }
    main.append(title, url, cleanUrl, meta, previewCard);
  } else {
    main.append(title, url, cleanUrl, meta);
  }

  const actions = document.createElement("div");
  actions.className = "row-actions";

  const copyButton = document.createElement("button");
  copyButton.className = "btn btn-sm btn-outline-primary";
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(link.url)
      .then(() => notify("Link copied."))
      .catch(() => notify("Could not copy link."));
  });

  const copyCleanButton = document.createElement("button");
  copyCleanButton.className = "btn btn-sm btn-outline-primary";
  copyCleanButton.type = "button";
  copyCleanButton.textContent = "Copy Clean";
  copyCleanButton.hidden = !link.isCleanedUrl;
  copyCleanButton.addEventListener("click", () => {
    navigator.clipboard.writeText(link.cleanUrl || link.url)
      .then(() => notify("Clean link copied."))
      .catch(() => notify("Could not copy clean link."));
  });

  const openButton = document.createElement("a");
  openButton.className = "btn btn-sm btn-outline-secondary";
  openButton.href = link.url;
  openButton.target = "_blank";
  openButton.rel = "noopener noreferrer";
  openButton.textContent = "Open";

  const removeButton = document.createElement("button");
  removeButton.className = "btn btn-sm btn-outline-danger";
  removeButton.type = "button";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", () => {
    state.links = state.links.filter((itemLink) => itemLink.url !== link.url);
    selectedUrls.delete(link.url);
    saveCurrentLinks(true);
    render();
  });

  actions.append(copyButton, copyCleanButton, openButton, removeButton);
  row.append(checkbox, main, actions);
  item.appendChild(row);
  return item;
}

function groupLinksByDomain(links) {
  return links.reduce((groups, link) => {
    const domain = link.domain || "unknown";
    if (!groups.has(domain)) {
      groups.set(domain, []);
    }
    groups.get(domain).push(link);
    return groups;
  }, new Map());
}

function renderFlatLinks(links) {
  const list = document.createElement("ul");
  list.className = "link-list";
  links.forEach((link) => {
    list.appendChild(createLinkRow(link));
  });
  linkGroups.appendChild(list);
}

function renderGroupedLinks(links) {
  const groups = groupLinksByDomain(links);
  groups.forEach((domainLinks, domain) => {
    const section = document.createElement("section");
    section.className = "domain-section";

    const heading = document.createElement("h2");
    heading.className = "domain-heading";
    heading.textContent = domain;

    const count = document.createElement("span");
    count.className = "domain-count";
    count.textContent = domainLinks.length;
    heading.appendChild(count);

    const list = document.createElement("ul");
    list.className = "link-list";
    domainLinks.forEach((link) => {
      list.appendChild(createLinkRow(link));
    });

    section.append(heading, list);
    linkGroups.appendChild(section);
  });
}

function render() {
  const visibleLinks = getVisibleLinks();
  linkGroups.replaceChildren();
  updateEmptyState(visibleLinks.length);

  if (visibleLinks.length > 0) {
    if (groupByDomain.checked) {
      renderGroupedLinks(visibleLinks);
    } else {
      renderFlatLinks(visibleLinks);
    }
  }

  updateStats();
  updateSourceSummary();
  updateSummary();
  renderAnalytics();
  setActionState();
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatLinks(links, format) {
  if (format === "clean") {
    return links.map((link) => getOutputUrl(link, true)).join("\n");
  }

  if (format === "markdown") {
    return links.map((link) => `[${link.text || link.url}](${link.url})`).join("\n");
  }

  if (format === "markdown-clean") {
    return links.map((link) => `[${link.text || getOutputUrl(link, true)}](${getOutputUrl(link, true)})`).join("\n");
  }

  if (format === "html") {
    return links
      .map((link) => `<a href="${htmlEscape(link.url)}">${htmlEscape(link.text || link.url)}</a>`)
      .join("\n");
  }

  if (format === "domains") {
    return Array.from(new Set(links.map((link) => link.domain))).join("\n");
  }

  if (groupByDomain.checked) {
    return Array.from(groupLinksByDomain(links).entries())
      .map(([domain, domainLinks]) => {
        return [`# ${domain}`, ...domainLinks.map((link) => getOutputUrl(link, false))].join("\n");
      })
      .join("\n\n");
  }

  return links.map((link) => link.url).join("\n");
}

function getRequestedLinks(scope) {
  const links = getLinksByScope(scope);
  if (links.length === 0) {
    const scopeLabel = scope === "selected" ? "selected" : scope === "visible" ? "visible" : "";
    notify(scopeLabel ? `No ${scopeLabel} links available for that action.` : "No links available for that action.");
  }
  return links;
}

function sanitizeFileName(value, extension) {
  const baseName = String(value || "links")
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "links";

  return baseName.toLowerCase().endsWith(`.${extension}`) ? baseName : `${baseName}.${extension}`;
}

function downloadBlob(content, type, extension) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const filename = sanitizeFileName(fileNameInput.value, extension);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function getOutputUrl(link, preferClean = false) {
  return preferClean ? link.cleanUrl || link.url : link.url;
}

function linksToCsv(links) {
  const rows = [["Text", "URL", "Clean URL", "Cleaned", "Removed Tracking Params", "Domain", "Type", "Scope", "Extension", "Rel", "Categories", "Query Params", "URL Length", "Occurrences", "Sources", "Discovered On", "Preview Title", "Preview Description", "Health", "Status", "Final URL", "Response Time", "Error"]];
  links.forEach((link) => {
    const health = state.health[link.url] || {};
    const preview = state.previews[link.url] || {};
    rows.push([
      link.text,
      link.url,
      link.cleanUrl || link.url,
      link.isCleanedUrl ? "yes" : "no",
      (link.removedTrackingParams || []).join(", "),
      link.domain,
      link.type,
      link.scope,
      link.extension,
      link.rel.join(" "),
      link.categories.join(", "),
      String(link.queryParamCount),
      String(link.urlLength),
      String(link.occurrences),
      link.sources.join(", "),
      link.discoveredOn || "",
      preview.title || "",
      preview.description || "",
      health.category || "unchecked",
      health.status || "",
      health.finalUrl || "",
      health.responseTime || "",
      health.error || ""
    ]);
  });

  return rows.map((row) => {
    return row.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(",");
  }).join("\n");
}

function linksToJson(links) {
  if (!groupByDomain.checked) {
    return JSON.stringify({ meta: state.meta, links }, null, 2);
  }

  const groupedByDomain = {};
  groupLinksByDomain(links).forEach((domainLinks, domain) => {
    groupedByDomain[domain] = domainLinks;
  });
  return JSON.stringify({ meta: state.meta, groupedByDomain }, null, 2);
}

function linksToExcel(links) {
  const rows = linksToCsv(links)
    .split("\n")
    .map((line) => {
      const cells = [];
      let current = "";
      let quoted = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && quoted && next === '"') {
          current += '"';
          index += 1;
          continue;
        }

        if (char === '"') {
          quoted = !quoted;
          continue;
        }

        if (char === "," && !quoted) {
          cells.push(current);
          current = "";
          continue;
        }

        current += char;
      }

      cells.push(current);
      return cells;
    });

  const tableRows = rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${row.map((cell) => `<${tag}>${htmlEscape(cell)}</${tag}>`).join("")}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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

function linksToMarkdown(links) {
  const stats = getStats();
  const rows = [
    "# Link Audit Report",
    "",
    `Source: ${state.meta.sourceTitle || state.meta.sourceUrl || "Unknown source"}`,
    `Generated: ${new Date().toLocaleString(getDateLocale())}`,
    "",
    "## Summary",
    "",
    `- Total found: ${stats.total}`,
    `- Unique links: ${stats.unique}`,
    `- Internal: ${stats.internal}`,
    `- External: ${stats.external}`,
    `- Cleanable URLs: ${stats.cleanable}`,
    `- Broken/errors: ${stats.broken}`,
    "",
    "## Links",
    "",
    "| Text | URL | Clean URL | Type | Scope | Health | Signals |",
    "| --- | --- | --- | --- | --- | --- | --- |"
  ];

  links.forEach((link) => {
    const health = state.health[link.url]?.category || "unchecked";
    const signals = [
      ...(link.isCleanedUrl ? ["cleanable"] : []),
      ...(link.removedTrackingParams?.length ? [`removed ${link.removedTrackingParams.join(", ")}`] : []),
      ...(link.isEmptyAnchor ? ["empty anchor"] : []),
      ...(link.rel || [])
    ].join(", ") || "clean";
    rows.push([
      markdownCell(link.text || link.url),
      markdownCell(link.url),
      markdownCell(link.cleanUrl || link.url),
      markdownCell(link.type),
      markdownCell(link.scope),
      markdownCell(health),
      markdownCell(signals)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  });

  return rows.join("\n");
}

function markdownCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function getReportRows(links) {
  return links.map((link) => {
    const health = state.health[link.url] || {};
    const preview = state.previews[link.url] || {};
    return {
      text: link.text || link.url,
      url: link.url,
      cleanUrl: link.cleanUrl || link.url,
      isCleanedUrl: link.isCleanedUrl,
      removedTrackingParams: (link.removedTrackingParams || []).join(", "),
      previewTitle: preview.title || "",
      previewDescription: preview.description || "",
      domain: link.domain,
      type: link.type,
      scope: link.scope,
      health: health.category || "unchecked",
      status: health.status || "",
      finalUrl: health.finalUrl || "",
      responseTime: health.responseTime || "",
      source: link.discoveredOn || state.meta.sourceUrl || "",
      categories: link.categories.join(", ")
    };
  });
}

function linksToHtmlReport(links, title = "Link Audit Report") {
  const stats = getStats();
  const rows = getReportRows(links);
  const domainRows = getTopEntries(countBy(links, (link) => link.domain), 12)
    .map(([domain, count]) => `<tr><td>${htmlEscape(domain)}</td><td>${count}</td></tr>`)
    .join("");
  const linkRows = rows
    .map((row) => {
      return `<tr>
        <td>${htmlEscape(row.text)}</td>
        <td><a href="${htmlEscape(row.url)}">${htmlEscape(row.url)}</a></td>
        <td><a href="${htmlEscape(row.cleanUrl)}">${htmlEscape(row.cleanUrl)}</a></td>
        <td>${htmlEscape(row.isCleanedUrl ? "yes" : "no")}</td>
        <td>${htmlEscape(row.previewTitle || "")}</td>
        <td>${htmlEscape(row.domain)}</td>
        <td>${htmlEscape(row.type)}</td>
        <td>${htmlEscape(row.scope)}</td>
        <td>${htmlEscape(row.health)}</td>
        <td>${htmlEscape(row.status)}</td>
        <td>${htmlEscape(row.responseTime)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${htmlEscape(title)}</title>
  <style>
    body { color: #17202a; font-family: Inter, Arial, sans-serif; margin: 32px; }
    h1 { margin: 0 0 8px; }
    .muted { color: #667085; }
    .stats { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin: 22px 0; }
    .stat { border: 1px solid #d7dee8; border-radius: 12px; padding: 12px; }
    .stat span { color: #667085; display: block; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .stat strong { display: block; font-size: 26px; margin-top: 6px; }
    table { border-collapse: collapse; margin-top: 16px; width: 100%; }
    th, td { border: 1px solid #d7dee8; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f6fa; }
    a { color: #0f766e; word-break: break-all; }
  </style>
</head>
<body>
  <h1>${htmlEscape(title)}</h1>
  <p class="muted">${htmlEscape(state.meta.sourceTitle || "")} ${state.meta.sourceUrl ? `| ${htmlEscape(state.meta.sourceUrl)}` : ""}</p>
  <div class="stats">
    <div class="stat"><span>Total</span><strong>${stats.total}</strong></div>
    <div class="stat"><span>Unique</span><strong>${stats.unique}</strong></div>
    <div class="stat"><span>Internal</span><strong>${stats.internal}</strong></div>
    <div class="stat"><span>External</span><strong>${stats.external}</strong></div>
    <div class="stat"><span>Cleanable</span><strong>${stats.cleanable}</strong></div>
    <div class="stat"><span>Broken</span><strong>${stats.broken}</strong></div>
    <div class="stat"><span>Redirects</span><strong>${stats.redirects}</strong></div>
  </div>
  <h2>Top Domains</h2>
  <table><thead><tr><th>Domain</th><th>Links</th></tr></thead><tbody>${domainRows}</tbody></table>
  <h2>Links</h2>
  <table>
    <thead><tr><th>Text</th><th>URL</th><th>Clean URL</th><th>Cleaned</th><th>Preview Title</th><th>Domain</th><th>Type</th><th>Scope</th><th>Health</th><th>Status</th><th>Response Time</th></tr></thead>
    <tbody>${linkRows}</tbody>
  </table>
</body>
</html>`;
}

function exportBrokenReport() {
  const brokenLinks = state.links.filter((link) => ["broken", "error"].includes(state.health[link.url]?.category));
  if (brokenLinks.length === 0) {
    notify("No broken links found. Run health check first if needed.");
    return;
  }

  downloadBlob(linksToHtmlReport(brokenLinks, "Broken Link Report"), "text/html", "html");
  trackSuccessfulAction("export-broken-report");
  maybeShowReviewPrompt();
}

function updateLatestHistoryEntry() {
  if (!state.meta.sourceUrl) {
    return;
  }

  chrome.storage.local.get("linkHistory", (data) => {
    const history = Array.isArray(data.linkHistory) ? data.linkHistory : [];
    const latestIndex = history.map((entry, index) => ({ entry, index })).reverse().find(({ entry }) => {
      return entry.sourceUrl === state.meta.sourceUrl || entry.extractionMeta?.sourceUrl === state.meta.sourceUrl;
    })?.index;

    if (latestIndex === undefined) {
      return;
    }

    const nextHistory = history.slice();
    nextHistory[latestIndex] = {
      ...nextHistory[latestIndex],
      timestamp: state.meta.crawlUpdatedAt || state.meta.extractedAt || new Date().toISOString(),
      extractionMeta: state.meta,
      links: state.links
    };
    chrome.storage.local.set({ linkHistory: nextHistory });
  });
}

function saveCurrentLinks(updateHistory = false) {
  const totalDiscovered = state.links.reduce((sum, link) => sum + link.occurrences, 0);
  state.meta = {
    ...state.meta,
    uniqueCount: state.links.length,
    totalDiscovered,
    duplicatesRemoved: Math.max(totalDiscovered - state.links.length, 0)
  };

  chrome.storage.local.set({
    extractedLinks: state.links,
    extractionMeta: state.meta
  }, () => {
    if (updateHistory) {
      updateLatestHistoryEntry();
    }
  });
}

function persistHealth() {
  chrome.storage.local.set({ linkHealth: state.health });
}

function persistPreviews() {
  chrome.storage.local.set({ linkPreviews: state.previews });
}

function getCheckableLinks(scope) {
  return getRequestedLinks(scope).filter((link) => {
    try {
      return ["http:", "https:"].includes(new URL(link.url).protocol);
    } catch {
      return false;
    }
  });
}

async function checkLinks(scope) {
  const links = getCheckableLinks(scope);
  const triggerButton = document.getElementById(scope === "selected" ? "checkSelectedLinks" : "checkVisibleLinks");

  if (links.length === 0) {
    notify("No HTTP links available for health checking.");
    return;
  }

  setButtonLoading(triggerButton, true, "Checking");
  setInlineLoading(healthProgress, true, `Checking ${links.length} links...`);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "checkLinks",
      urls: links.map((link) => link.url)
    });

    if (!response?.ok) {
      setInlineLoading(healthProgress, false, "Health check failed.");
      notify(response?.error || "Health check failed.");
      return;
    }

    response.results.forEach((result) => {
      state.health[result.url] = result;
    });

    persistHealth();
    render();
    setInlineLoading(healthProgress, false, `Checked ${response.results.length} links.`);
    trackSuccessfulAction("health-check");
    maybeShowReviewPrompt();
    notify("Health check complete.");
  } catch {
    setInlineLoading(healthProgress, false, "Health check failed.");
    notify("Health check failed.");
  } finally {
    setButtonLoading(triggerButton, false);
  }
}

function getPreviewableLinks(scope) {
  return getRequestedLinks(scope).filter((link) => {
    try {
      return ["http:", "https:"].includes(new URL(link.url).protocol);
    } catch {
      return false;
    }
  });
}

async function fetchPreviews(scope) {
  const links = getPreviewableLinks(scope).filter((link) => !state.previews[link.url]);
  const triggerButton = document.getElementById("fetchVisiblePreviews");

  if (links.length === 0) {
    notify("No uncached HTTP links available for preview.");
    return;
  }

  setButtonLoading(triggerButton, true, "Fetching");
  setInlineLoading(resultSummary, true, `Fetching previews for ${links.length} links...`);

  try {
    const response = await chrome.runtime.sendMessage({
      action: "fetchPreviews",
      urls: links.map((link) => link.url)
    });

    if (!response?.ok) {
      notify(response?.error || "Preview fetch failed.");
      render();
      return;
    }

    response.results.forEach((preview) => {
      state.previews[preview.url] = preview;
    });

    persistPreviews();
    render();
    trackSuccessfulAction("preview-fetch");
    maybeShowReviewPrompt();
    notify(`Fetched ${response.results.length} previews.`);
  } catch {
    notify("Preview fetch failed.");
    render();
  } finally {
    setButtonLoading(triggerButton, false);
    resultSummary.classList.remove("loading-status");
  }
}

async function highlightOnSourcePage(scope) {
  const links = getRequestedLinks(scope);
  const triggerButton = document.getElementById("highlightOnPage");
  const sourceTabId = state.meta.sourceTabId;

  if (!sourceTabId) {
    notify("Source tab is not available for highlighting.");
    return;
  }

  if (links.length === 0) {
    return;
  }

  setButtonLoading(triggerButton, true, "Highlighting");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "highlightLinks",
      tabId: sourceTabId,
      highlights: links.map((link) => {
        const health = state.health[link.url] || {};
        return {
          url: link.url,
          category: health.category || "unchecked"
        };
      })
    });

    if (!response?.ok) {
      notify(response?.error || "Could not highlight source page.");
      return;
    }

    if (!response.count) {
      notify("No matching links found on the source page.");
      return;
    }

    trackSuccessfulAction("highlight-page");
    maybeShowReviewPrompt();
    notify(`Highlighted ${response.count} links on the source page.`);
  } catch {
    notify("Could not highlight source page.");
  } finally {
    setButtonLoading(triggerButton, false);
  }
}

async function openRequestedLinks(scope) {
  const links = getRequestedLinks(scope).map((link) => link.url);
  const triggerButton = document.getElementById("openSelectedLinks");
  if (links.length === 0) {
    return;
  }

  setButtonLoading(triggerButton, true, "Opening");

  try {
    const response = await chrome.runtime.sendMessage({
      action: "openUrls",
      urls: links
    });

    if (!response?.ok) {
      notify(response?.error || "Could not open links.");
      return;
    }

    trackSuccessfulAction("open-links");
    maybeShowReviewPrompt();
    notify(response.capped ? `Opened first ${response.opened} links.` : `Opened ${response.opened} links.`);
  } finally {
    setButtonLoading(triggerButton, false);
  }
}

async function extractAllOpenTabs() {
  const triggerButton = document.getElementById("extractAllTabs");
  setButtonLoading(triggerButton, true, "Extracting");
  setPageLoading(true, "Extracting links from all open tabs...");

  try {
    const response = await chrome.runtime.sendMessage({ action: "extractAllOpenTabs" });
    if (!response?.ok) {
      notify(response?.error || "Could not extract all open tabs.");
      render();
      return;
    }

    trackSuccessfulAction("extract-all-tabs");
    maybeShowReviewPrompt();
    notify(`Extracted ${response.linkCount} links from ${response.tabCount} tabs.`);
  } catch {
    notify("Could not extract all open tabs.");
    render();
  } finally {
    setPageLoading(false);
    setButtonLoading(triggerButton, false);
  }
}

function getCrawlStartUrl() {
  const source = parseUrl(state.meta.sourceUrl);
  if (source && ["http:", "https:"].includes(source.protocol)) {
    source.hash = "";
    return source.href;
  }

  const internalLink = state.links.find((link) => ["Internal", "Subdomain"].includes(link.scope) && parseUrl(link.url));
  return internalLink?.url || "";
}

function getCrawlOptions() {
  return {
    depth: Math.max(0, Math.min(3, Number(crawlDepth.value) || 0)),
    limit: Math.max(1, Math.min(200, Number(crawlLimit.value) || 25)),
    sameDomainOnly: crawlSameDomain.checked,
    includeSitemap: crawlSitemap.checked
  };
}

function isLikelyHtmlPage(url) {
  const extension = getExtension(url);
  return !extension || [".asp", ".aspx", ".htm", ".html", ".php"].includes(extension);
}

function canCrawlUrl(url, startUrl, options) {
  const parsed = parseUrl(url);
  const start = parseUrl(startUrl);
  if (!parsed || !start || !["http:", "https:"].includes(parsed.protocol) || !isLikelyHtmlPage(url)) {
    return false;
  }

  if (!options.sameDomainOnly) {
    return true;
  }

  return getRootDomain(parsed.hostname) === getRootDomain(start.hostname);
}

async function fetchText(url) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "omit",
    redirect: "follow"
  });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }

  if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml") && !contentType.includes("xml")) {
    return "";
  }

  return response.text();
}

async function getSitemapSeeds(startUrl, options) {
  if (!options.includeSitemap) {
    return [];
  }

  const start = parseUrl(startUrl);
  if (!start) {
    return [];
  }

  const sitemapUrl = `${start.origin}/sitemap.xml`;
  try {
    const xml = await fetchText(sitemapUrl);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    return Array.from(doc.getElementsByTagName("loc"))
      .map((node) => normalizeCrawlUrl(node.textContent, sitemapUrl))
      .filter((url) => canCrawlUrl(url, startUrl, options))
      .slice(0, options.limit);
  } catch {
    return [];
  }
}

function setCrawlRunning(isRunning) {
  state.crawl.running = isRunning;
  document.getElementById("startCrawl").disabled = isRunning;
  document.getElementById("stopCrawl").disabled = !isRunning;
  [crawlDepth, crawlLimit, crawlSameDomain, crawlSitemap].forEach((control) => {
    control.disabled = isRunning;
  });
}

function updateCrawlProgress({ visited, queued, added, current, failed = 0 }) {
  crawlProgress.textContent = `Crawled ${visited} pages, ${queued} queued, ${added} new links added, ${failed} failed.${current ? ` Current: ${current}` : ""}`;
}

async function startCrawler() {
  if (state.crawl.running) {
    return;
  }

  const startButton = document.getElementById("startCrawl");
  const startUrl = getCrawlStartUrl();
  if (!startUrl) {
    notify("No HTTP source URL available for crawling.");
    return;
  }

  setButtonLoading(startButton, true, "Crawling");
  setInlineLoading(crawlProgress, true, "Preparing crawler...");

  const options = getCrawlOptions();
  const queue = [{ url: normalizeCrawlUrl(startUrl), depth: 0 }];
  const seenPages = new Set(queue.map((item) => item.url));
  const sitemapSeeds = await getSitemapSeeds(startUrl, options);
  sitemapSeeds.forEach((url) => {
    if (!seenPages.has(url) && queue.length < options.limit) {
      seenPages.add(url);
      queue.push({ url, depth: 0 });
    }
  });

  let visited = 0;
  let added = 0;
  let failed = 0;
  state.crawl.stopRequested = false;
  setCrawlRunning(true);
  updateCrawlProgress({ visited, queued: queue.length, added, failed, current: startUrl });

  while (queue.length > 0 && visited < options.limit && !state.crawl.stopRequested) {
    const page = queue.shift();
    if (!page?.url || page.depth > options.depth) {
      continue;
    }

    try {
      updateCrawlProgress({ visited, queued: queue.length, added, failed, current: page.url });
      const html = await fetchText(page.url);
      visited += 1;

      if (!html) {
        continue;
      }

      const records = extractRecordsFromHtml(html, page.url);
      records.forEach((record) => {
        if (mergeLinkRecord(record)) {
          added += 1;
        }

        if (page.depth < options.depth && canCrawlUrl(record.url, startUrl, options) && !seenPages.has(record.url) && queue.length + visited < options.limit) {
          seenPages.add(record.url);
          queue.push({ url: record.url, depth: page.depth + 1 });
        }
      });

      state.meta = {
        ...state.meta,
        crawlDepth: options.depth,
        crawledPages: visited,
        crawlUpdatedAt: new Date().toISOString()
      };
      saveCurrentLinks();
      render();
    } catch {
      failed += 1;
    }
  }

  setCrawlRunning(false);
  setButtonLoading(startButton, false);
  saveCurrentLinks(true);
  setInlineLoading(crawlProgress, false);
  updateCrawlProgress({ visited, queued: queue.length, added, failed });
  trackSuccessfulAction("crawl");
  maybeShowReviewPrompt();
  notify(state.crawl.stopRequested ? "Crawl stopped." : "Crawl complete.");
  state.crawl.stopRequested = false;
}

function cleanCurrentUrls() {
  const merged = new Map();
  let changed = 0;

  state.links.forEach((link) => {
    const nextUrl = cleanupUrl(link.url);
    if (nextUrl !== link.url) {
      changed += 1;
    }

    const nextRecord = normalizeRecord({ ...link, url: nextUrl }, merged.size, state.meta);
    const parsed = parseUrl(nextUrl);
    nextRecord.occurrences = link.occurrences;
    nextRecord.sources = link.sources;
    nextRecord.rel = link.rel;
    nextRecord.categories = Array.from(new Set([...link.categories.filter((category) => category !== "Tracking"), ...inferCategories(nextUrl, link.rel)]));
    nextRecord.hasQuery = Boolean(parsed?.search);
    nextRecord.queryParamCount = parsed ? Array.from(parsed.searchParams.keys()).length : 0;
    nextRecord.urlLength = nextUrl.length;

    const existing = merged.get(nextUrl);
    if (!existing) {
      merged.set(nextUrl, nextRecord);
      return;
    }

    existing.occurrences += nextRecord.occurrences;
    existing.sources = Array.from(new Set([...existing.sources, ...nextRecord.sources]));
    existing.categories = Array.from(new Set([...existing.categories, ...nextRecord.categories]));
    existing.rel = Array.from(new Set([...existing.rel, ...nextRecord.rel]));
  });

  state.links = Array.from(merged.values());
  saveCurrentLinks(true);
  render();
  if (changed) {
    trackSuccessfulAction("clean-urls");
    maybeShowReviewPrompt();
  }
  notify(changed ? `Cleaned ${changed} URLs and merged duplicates.` : "No tracking parameters found.");
}

searchInput.addEventListener("input", debounceRender);
scopeFilter.addEventListener("change", render);
groupByDomain.addEventListener("change", render);
domainFilter.addEventListener("input", debounceRender);
extensionFilter.addEventListener("input", debounceRender);
relFilter.addEventListener("change", render);
categoryFilter.addEventListener("change", render);
queryFilter.addEventListener("change", render);
urlLengthFilter.addEventListener("change", render);
regexFilter.addEventListener("input", debounceRender);
sortBy.addEventListener("change", render);
healthFilter.addEventListener("change", render);

typeFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-type]");
  if (!button) {
    return;
  }

  state.activeType = button.dataset.type;
  typeFilters.querySelectorAll("button[data-type]").forEach((filterButton) => {
    filterButton.classList.toggle("active", filterButton === button);
  });
  render();
});

document.getElementById("selectVisible").addEventListener("click", () => {
  getVisibleLinks().forEach((link) => selectedUrls.add(link.url));
  render();
});

document.getElementById("clearSelection").addEventListener("click", () => {
  selectedUrls.clear();
  render();
});

document.getElementById("openSelectedLinks").addEventListener("click", () => {
  openRequestedLinks("selected");
});

document.getElementById("fetchVisiblePreviews").addEventListener("click", () => {
  fetchPreviews("visible");
});

document.getElementById("highlightOnPage").addEventListener("click", () => {
  highlightOnSourcePage(selectedUrls.size > 0 ? "selected" : "visible");
});

document.getElementById("extractAllTabs").addEventListener("click", () => {
  extractAllOpenTabs();
});

document.getElementById("checkVisibleLinks").addEventListener("click", () => {
  checkLinks("visible");
});

document.getElementById("checkSelectedLinks").addEventListener("click", () => {
  checkLinks("selected");
});

document.getElementById("startCrawl").addEventListener("click", () => {
  startCrawler();
});

document.getElementById("stopCrawl").addEventListener("click", () => {
  state.crawl.stopRequested = true;
  crawlProgress.textContent = "Stopping after the current page finishes...";
});

document.getElementById("cleanUrls").addEventListener("click", () => {
  cleanCurrentUrls();
});

document.getElementById("copyLinks").addEventListener("click", () => {
  const links = getRequestedLinks(copyScope.value);
  if (links.length === 0) {
    return;
  }

  navigator.clipboard.writeText(formatLinks(links, copyFormat.value)).then(() => {
    trackSuccessfulAction("copy-links");
    maybeShowReviewPrompt();
    notify("Links copied.");
  }).catch(() => {
    notify("Could not copy links.");
  });
});

document.getElementById("exportTxt").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(formatLinks(links, "plain"), "text/plain", "txt");
    trackSuccessfulAction("export-txt");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(linksToCsv(links), "text/csv;charset=utf-8", "csv");
    trackSuccessfulAction("export-csv");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportExcel").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(linksToExcel(links), "application/vnd.ms-excel;charset=utf-8", "xls");
    trackSuccessfulAction("export-excel");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportMarkdown").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(linksToMarkdown(links), "text/markdown;charset=utf-8", "md");
    trackSuccessfulAction("export-markdown");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportJson").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(linksToJson(links), "application/json", "json");
    trackSuccessfulAction("export-json");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportHtmlReport").addEventListener("click", () => {
  const links = getRequestedLinks(exportScope.value);
  if (links.length > 0) {
    downloadBlob(linksToHtmlReport(links), "text/html", "html");
    trackSuccessfulAction("export-html-report");
    maybeShowReviewPrompt();
  }
});

document.getElementById("exportBrokenReport").addEventListener("click", () => {
  exportBrokenReport();
});

function updateBackToTopVisibility() {
  if (!backToTopButton) {
    return;
  }
  backToTopButton.classList.toggle("is-visible", window.scrollY > 520);
}

backToTopButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
updateBackToTopVisibility();

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.settings.theme === "system") {
    applySettings(state.settings);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.extensionSettings) {
    applySettings(changes.extensionSettings.newValue || DEFAULT_SETTINGS);
    render();
  }

  if (changes.linkPreviews) {
    state.previews = changes.linkPreviews.newValue || {};
    render();
  }
});

setPageLoading(true, "Loading saved audit data...");

chrome.storage.local.get(["extractedLinks", "extractionMeta", "extensionSettings", "darkMode", "linkHealth", "linkPreviews"], (data) => {
  const legacyTheme = data.extensionSettings ? null : data.darkMode ? "dark" : null;
  applySettings({
    ...(legacyTheme ? { theme: legacyTheme } : {}),
    ...(data.extensionSettings || {})
  });

  state.meta = data.extractionMeta || {};
  state.health = data.linkHealth || {};
  state.previews = data.linkPreviews || {};
  state.links = Array.from(new Set((Array.isArray(data.extractedLinks) ? data.extractedLinks : []).map((record) => {
    return typeof record === "string" ? record : record?.url;
  })))
    .map((url, index) => {
      const originalRecord = Array.isArray(data.extractedLinks)
        ? data.extractedLinks.find((record) => (typeof record === "string" ? record : record?.url) === url)
        : url;
      return normalizeRecord(originalRecord, index, state.meta);
    })
    .filter((link) => link.url);

  if (state.meta.sourceDomain && fileNameInput.value === "links") {
    fileNameInput.value = `${state.meta.sourceDomain}-links`;
  }

  render();
  setPageLoading(false);
});
