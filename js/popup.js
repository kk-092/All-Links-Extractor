document.getElementById("extractLinks").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});

document.getElementById("openResults").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "openResultPage" });
});

document.getElementById("saveHistory").addEventListener("click", () => {
  chrome.storage.local.get(["extractedLinks", "linkHistory"], (data) => {
    const currentLinks = data.extractedLinks || [];
    const history = Array.isArray(data.linkHistory) ? data.linkHistory : [];

    if (currentLinks.length === 0) {
      alert("No links to save.");
      return;
    }

    const timestamp = new Date().toLocaleString();
    history.push({ timestamp, links: currentLinks });

    chrome.storage.local.set({ linkHistory: history }, () => {
      loadHistory();
      alert("Links saved to history.");
    });
  });
});

document.getElementById("clearHistory").addEventListener("click", () => {
  if (confirm("Are you sure you want to clear all history?")) {
    chrome.storage.local.remove("linkHistory", () => {
      loadHistory();
      alert("History cleared.");
    });
  }
});

function loadHistory() {
  const container = document.getElementById("historyContainer");
  container.innerHTML = "";

  chrome.storage.local.get("linkHistory", (data) => {
    const history = Array.isArray(data.linkHistory) ? data.linkHistory : [];

    if (history.length === 0) {
      container.innerHTML = "<p class='text-muted small'>No history found.</p>";
      return;
    }

    history.slice().reverse().forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "history-entry border p-2 rounded bg-white";
      div.innerHTML = `
        <strong>${item.timestamp}</strong><br/>
        <span class="text-muted">${item.links.length} links</span>
        <button class="btn btn-sm btn-outline-primary mt-1 w-100" data-index="${history.length - 1 - index}">
          View
        </button>
      `;
      container.appendChild(div);
    });

    container.querySelectorAll("button[data-index]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.target.dataset.index);
        const selectedLinks = history[idx].links;
        chrome.storage.local.set({ extractedLinks: selectedLinks }, () => {
          chrome.runtime.sendMessage({ action: "openResultPage" });
        });
      });
    });
  });
}

chrome.storage.local.get("extractedLinks", (data) => {
  document.getElementById("linkCount").textContent = data.extractedLinks?.length || 0;
});

function applyDarkMode(isDark) {
  if (isDark) {
    document.body.classList.add("dark-mode");
    document.getElementById("darkModeToggle").checked = true;
  } else {
    document.body.classList.remove("dark-mode");
    document.getElementById("darkModeToggle").checked = false;
  }
}

chrome.storage.local.get("darkMode", (data) => {
  applyDarkMode(data.darkMode);
});

document.getElementById("darkModeToggle").addEventListener("change", () => {
  const isDark = document.getElementById("darkModeToggle").checked;
  chrome.storage.local.set({ darkMode: isDark });
  applyDarkMode(isDark);
});

// ✅ Load history when popup opens
loadHistory();
