
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "openResultPage") {
    chrome.tabs.create({ url: chrome.runtime.getURL("result.html") });
  }
});
