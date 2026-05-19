(async () => {
  const imageExtensions = [".apng", ".avif", ".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"];
  const videoExtensions = [".avi", ".m4v", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm"];
  const audioExtensions = [".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".wav"];
  const documentExtensions = [".csv", ".doc", ".docx", ".odp", ".ods", ".odt", ".pdf", ".ppt", ".pptx", ".rtf", ".txt", ".xls", ".xlsx"];
  const archiveExtensions = [".7z", ".br", ".dmg", ".gz", ".rar", ".tar", ".tgz", ".zip"];
  const downloadExtensions = [...documentExtensions, ...archiveExtensions, ".apk", ".exe", ".iso", ".msi"];
  const trackingParams = [
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "msclkid",
    "ref",
    "spm",
    "utm_campaign",
    "utm_content",
    "utm_medium",
    "utm_source",
    "utm_term"
  ];
  const affiliateParams = ["aff", "affiliate", "camp", "clickbank", "hop", "partner", "ref", "tag"];
  const affiliateDomains = ["amazon.", "amzn.to", "bit.ly", "clickbank.", "impact.com", "linksynergy.", "shareasale."];
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

  const extractionMeta = {
    sourceTitle: document.title || "Untitled page",
    sourceUrl: location.href,
    sourceDomain: location.hostname,
    extractedAt: new Date().toISOString()
  };

  const normalizeUrl = (url) => {
    try {
      return new URL(url, document.baseURI).href;
    } catch {
      return "";
    }
  };

  const isUsableLink = (url) => {
    const value = String(url || "").trim();
    return value && !value.toLowerCase().startsWith("javascript:");
  };

  const getParsedUrl = (url) => {
    try {
      return new URL(url, document.baseURI);
    } catch {
      return null;
    }
  };

  const getRootDomain = (hostname) => {
    const parts = String(hostname || "").replace(/^www\./, "").split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
  };

  const getCleanDomain = (url) => {
    const parsed = getParsedUrl(url);

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
  };

  const getExtension = (url) => {
    const parsed = getParsedUrl(url);
    if (!parsed) {
      return "";
    }

    const match = parsed.pathname.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
    return match ? `.${match[1]}` : "";
  };

  const hasPathExtension = (url, extensions) => extensions.includes(getExtension(url));

  const isSocialLink = (domain) => socialDomains.some((socialDomain) => {
    return domain === socialDomain || domain.endsWith(`.${socialDomain}`);
  });

  const getType = (url) => {
    const parsed = getParsedUrl(url);
    const domain = getCleanDomain(url);

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

    if (isSocialLink(domain)) {
      return "Social";
    }

    if (hasPathExtension(url, downloadExtensions)) {
      return "Download";
    }

    return "Web";
  };

  const getScope = (url) => {
    const parsed = getParsedUrl(url);

    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) {
      return "Other";
    }

    if (parsed.origin === location.origin) {
      return "Internal";
    }

    if (getRootDomain(parsed.hostname) === getRootDomain(location.hostname)) {
      return "Subdomain";
    }

    return "External";
  };

  const getElementText = (element, fallback) => {
    return (
      element.innerText ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      fallback
    ).trim();
  };

  const getRelTokens = (element) => {
    return String(element?.getAttribute?.("rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  };

  const isHiddenElement = (element) => {
    if (!element || !window.getComputedStyle) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return (
      element.hidden ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      element.getAttribute("aria-hidden") === "true"
    );
  };

  const getCategoryFlags = ({ url, domain, type, rel }) => {
    const parsed = getParsedUrl(url);
    const params = parsed ? Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase()) : [];
    const lowerUrl = url.toLowerCase();
    const categories = [];

    if (["Image", "Video", "Audio"].includes(type)) {
      categories.push("Media");
    }

    if (["PDF", "Download"].includes(type) || hasPathExtension(url, downloadExtensions)) {
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

    if (isSocialLink(domain)) {
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

    return categories;
  };

  const linksByUrl = new Map();
  let totalDiscovered = 0;

  const addLink = ({ url, text, source, element, rel = [], hreflang = "" }) => {
    const normalizedUrl = normalizeUrl(url);

    if (!isUsableLink(normalizedUrl)) {
      return;
    }

    totalDiscovered += 1;

    const domain = getCleanDomain(normalizedUrl);
    const type = getType(normalizedUrl);
    const parsed = getParsedUrl(normalizedUrl);
    const categories = getCategoryFlags({ url: normalizedUrl, domain, type, rel });
    const existingRecord = linksByUrl.get(normalizedUrl);

    if (existingRecord) {
      existingRecord.occurrences += 1;
      existingRecord.sources = Array.from(new Set([...existingRecord.sources, source]));
      existingRecord.categories = Array.from(new Set([...existingRecord.categories, ...categories]));
      existingRecord.rel = Array.from(new Set([...existingRecord.rel, ...rel]));
      if (hreflang && !existingRecord.hreflangs.includes(hreflang)) {
        existingRecord.hreflangs.push(hreflang);
      }
      if (!existingRecord.text && text) {
        existingRecord.text = text;
      }
      return;
    }

    linksByUrl.set(normalizedUrl, {
      url: normalizedUrl,
      text: text || normalizedUrl,
      domain,
      rootDomain: parsed ? getRootDomain(parsed.hostname) : domain,
      type,
      scope: getScope(normalizedUrl),
      source,
      sources: [source],
      rel,
      categories,
      extension: getExtension(normalizedUrl),
      hasQuery: Boolean(parsed?.search),
      queryParamCount: parsed ? Array.from(parsed.searchParams.keys()).length : 0,
      urlLength: normalizedUrl.length,
      isHidden: isHiddenElement(element),
      isEmptyAnchor: source === "anchor" && !String(text || "").trim(),
      hreflangs: hreflang ? [hreflang] : [],
      occurrences: 1
    });
  };

  Array.from(document.querySelectorAll("a[href]")).forEach((anchor) => {
    const url = normalizeUrl(anchor.getAttribute("href"));
    addLink({
      url,
      text: getElementText(anchor, ""),
      source: "anchor",
      element: anchor,
      rel: getRelTokens(anchor)
    });
  });

  Array.from(document.querySelectorAll("img[src], image[href]")).forEach((element) => {
    const url = normalizeUrl(element.getAttribute("src") || element.getAttribute("href"));
    addLink({
      url,
      text: getElementText(element, "Image"),
      source: "image",
      element
    });
  });

  Array.from(document.querySelectorAll("video[src], video[poster], audio[src], source[src], track[src]")).forEach((element) => {
    const url = normalizeUrl(element.getAttribute("src") || element.getAttribute("poster"));
    addLink({
      url,
      text: getElementText(element, "Media"),
      source: "media",
      element
    });
  });

  Array.from(document.querySelectorAll("embed[src], iframe[src], object[data]")).forEach((element) => {
    const url = normalizeUrl(element.getAttribute("src") || element.getAttribute("data"));
    addLink({
      url,
      text: getElementText(element, element.tagName === "IFRAME" ? "Iframe" : "Embedded resource"),
      source: element.tagName === "IFRAME" ? "iframe" : "embedded-resource",
      element
    });
  });

  Array.from(document.querySelectorAll("link[href]")).forEach((element) => {
    const rel = getRelTokens(element);
    const hreflang = element.getAttribute("hreflang") || "";

    if (rel.includes("canonical") || rel.includes("alternate") || rel.includes("preload") || rel.includes("prefetch")) {
      addLink({
        url: element.getAttribute("href"),
        text: rel.includes("canonical") ? "Canonical URL" : hreflang ? `Hreflang ${hreflang}` : `Link ${rel.join(" ")}`,
        source: rel.includes("canonical") ? "canonical" : hreflang ? "hreflang" : "resource-link",
        element,
        rel,
        hreflang
      });
    }
  });

  Array.from(document.querySelectorAll("script[src]")).forEach((element) => {
    addLink({
      url: element.getAttribute("src"),
      text: "Script source",
      source: "script-src",
      element
    });
  });

  Array.from(document.querySelectorAll("script:not([src])")).forEach((script) => {
    const matches = String(script.textContent || "").match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
    matches.forEach((url) => {
      addLink({
        url,
        text: "Inline script URL",
        source: "inline-script",
        element: script
      });
    });
  });

  const extractedLinks = Array.from(linksByUrl.values());
  extractionMeta.totalDiscovered = totalDiscovered;
  extractionMeta.uniqueCount = extractedLinks.length;
  extractionMeta.duplicatesRemoved = Math.max(totalDiscovered - extractedLinks.length, 0);
  extractionMeta.hiddenCount = extractedLinks.filter((link) => link.isHidden).length;
  extractionMeta.trackingCount = extractedLinks.filter((link) => link.categories.includes("Tracking")).length;
  extractionMeta.affiliateCount = extractedLinks.filter((link) => link.categories.includes("Affiliate")).length;

  const makeHistoryId = () => {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const historyData = await chrome.storage.local.get("linkHistory");
  const linkHistory = Array.isArray(historyData.linkHistory) ? historyData.linkHistory : [];
  const historyEntry = {
    id: makeHistoryId(),
    name: extractionMeta.sourceTitle || extractionMeta.sourceDomain || "Saved links",
    timestamp: extractionMeta.extractedAt,
    sourceTitle: extractionMeta.sourceTitle,
    sourceUrl: extractionMeta.sourceUrl,
    extractionMeta,
    links: extractedLinks
  };

  linkHistory.push(historyEntry);

  await chrome.storage.local.set({
    extractedLinks,
    extractionMeta,
    linkHistory
  });

  return {
    extractedCount: extractedLinks.length,
    sourceTitle: extractionMeta.sourceTitle
  };
})();
