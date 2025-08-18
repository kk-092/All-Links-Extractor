chrome.storage.local.get("extractedLinks", (data) => {
  const list = document.getElementById("linkList");
  data.extractedLinks?.forEach((link) => {
    const li = document.createElement("li");
    li.innerHTML = `<input type="checkbox" class="linkCheckbox" value="${link}"> ${link}`;
    list.appendChild(li);
  });
});

document.getElementById("selectAll").onclick = () => {
  document.querySelectorAll(".linkCheckbox").forEach(cb => cb.checked = true);
};

document.getElementById("copySelected").onclick = () => {
  const selected = [...document.querySelectorAll(".linkCheckbox:checked")].map(cb => cb.value).join('\n');
  if (selected.length === 0) {
    alert("Please select at least one link to copy.");
    return;
  }
  navigator.clipboard.writeText(selected).then(() => alert("Copied!"));
};

document.getElementById("exportTxt").onclick = () => {
  const selected = [...document.querySelectorAll(".linkCheckbox:checked")].map(cb => cb.value).join('\n');

  if (selected.length === 0) {
    alert("Please select at least one link to export.");
    return;
  }
  const blob = new Blob([selected], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url: url, filename: 'links.txt' });
};

document.getElementById("exportCsv").onclick = () => {
  const selected = [...document.querySelectorAll(".linkCheckbox:checked")];
  if (selected.length === 0) {
    alert("Please select at least one link to export.");
    return;
  }

  const rows = [["Link"]];
  selected.forEach(cb => {
    rows.push([cb.value]);
  });

  const csvContent = rows.map(e => e.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url: url,
    filename: "links.csv",
    saveAs: true
  });
};



document.getElementById("unselectAll").onclick = () => {
  document.querySelectorAll(".linkCheckbox").forEach(cb => cb.checked = false);
};