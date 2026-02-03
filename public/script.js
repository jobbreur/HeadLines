const list = document.getElementById("headline-list");
const updated = document.getElementById("last-updated");
const refreshButton = document.getElementById("refresh");

const renderHeadlines = (items) => {
  list.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No headlines yet. Please refresh shortly.";
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    link.target = "_blank";
    link.rel = "noopener";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `Discovered at ${new Date(
      item.discoveredAt
    ).toLocaleString()}`;

    li.appendChild(link);
    li.appendChild(meta);
    list.appendChild(li);
  });
};

const refresh = async () => {
  updated.textContent = "Refreshing...";
  const response = await fetch("/api/headlines");
  const data = await response.json();
  renderHeadlines(data.items);
  updated.textContent = `Last updated ${new Date(
    data.lastUpdated
  ).toLocaleTimeString()}`;
};

refreshButton.addEventListener("click", refresh);

refresh();
setInterval(refresh, 120000);
