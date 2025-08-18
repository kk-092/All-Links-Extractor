(async () => {
  const links = [...document.querySelectorAll("a[href]")].map(a => a.href);
  const pdfLinks = Array.from(document.querySelectorAll("embed[src$='.pdf'], iframe[src$='.pdf']")).map(e => e.src);
  const allLinks = links.concat(pdfLinks);
  chrome.storage.local.set({ extractedLinks: allLinks }, () => {
    alert(`Extracted ${allLinks.length} links`);
  });
})();
