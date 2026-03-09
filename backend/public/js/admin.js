// ================= GLOBAL STATE =================
const API_URL = "";
let allOrders = [];
let currentTab = "Pending";
let inventoryData = [];
let currentPage = 1;
const rowsPerPage = 8;

// ================= TOAST HELPER =================
function toast(msg, type = "success") {
  if (typeof window.showToast === "function") {
    window.showToast(msg, type);
  }
}

// ================= LOAD ORDERS =================
async function loadOrders() {
  try {
    const res = await fetch(`${API_URL}/api/orders`);
    allOrders = await res.json();
    updateCounts();
    renderOrders();
  } catch (err) {
    console.error("Error loading orders:", err);
  }
}

// ================= UPDATE COUNTS =================
function updateCounts() {
  const pending = allOrders.filter(o => o.status === "Pending").length;
  const approved = allOrders.filter(o => o.status === "Approved").length;
  const rejected = allOrders.filter(o => o.status === "Rejected").length;

  document.getElementById("pendingCount").textContent = pending;
  document.getElementById("approvedCount").textContent = approved;
  document.getElementById("rejectedCount").textContent = rejected;
}

// ================= SWITCH TAB =================
function switchTab(tab) {
  currentTab = tab;
  ["Pending", "Approved", "Rejected"].forEach(t => {
    const btn = document.getElementById("tab" + t);
    if (btn) btn.classList.toggle("active", t === tab);
  });
  renderOrders();
}

// ================= RENDER ORDERS =================
function renderOrders() {
  const container = document.getElementById("adminOrders");
  container.innerHTML = "";

  const filtered = allOrders.filter(o => o.status === currentTab);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${currentTab === "Pending" ? "⏳" : currentTab === "Approved" ? "✅" : "❌"}</div>
        <div>No ${currentTab.toLowerCase()} orders.</div>
      </div>`;
    return;
  }

  filtered.forEach(order => {
    const card = document.createElement("div");
    card.className = "order-card";
    card.id = `order-${order.id}`;

    card.innerHTML = `
      <div class="order-top">
        <div>
          <div class="order-name">👤 ${order.name || "—"}</div>
          <div class="order-medicine">💊 ${order.medicine || "—"}</div>
        </div>
        <span class="status-badge ${order.status}">${order.status}</span>
      </div>
      <div class="order-meta">
        ${(order.orderDate || order.time) ? `<span>🕐 ${new Date(order.orderDate || order.time).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ""}
      </div>
      ${order.subscription ? `<div class="subscription-tag">🔄 Auto-Refill Subscription</div>` : ""}
      ${order.status === "Pending" ? `
        <div class="order-actions">
          <button class="approve-btn" onclick="updateStatus('${order.id}', 'Approved')">✅ Approve</button>
          <button class="reject-btn"  onclick="updateStatus('${order.id}', 'Rejected')">❌ Reject</button>
        </div>` : ""}
    `;

    container.appendChild(card);
  });
}

// ================= UPDATE STATUS =================
async function updateStatus(orderId, newStatus) {
  const card = document.getElementById(`order-${orderId}`);
  if (card) card.classList.add("removing");

  try {
    await fetch(`${API_URL}/api/orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });

    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (order) order.status = newStatus;

    updateCounts();
    setTimeout(() => renderOrders(), 380);
    toast(`Order ${newStatus.toLowerCase()} successfully.`, "success");

  } catch (err) {
    console.error("Error updating order:", err);
    if (card) card.classList.remove("removing");
    toast("Failed to update order.", "error");
  }
}

// ================= LOAD INVENTORY =================
async function loadInventory() {
  try {
    const res = await fetch(`${API_URL}/inventory`);
    if (!res.ok) throw new Error("Failed to fetch inventory");
    inventoryData = await res.json();
    renderInventory();
  } catch (err) {
    console.error("Error loading inventory:", err);
    document.getElementById("inventoryBody").innerHTML =
      `<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px;">⚠️ Error loading inventory.</td></tr>`;
  }
}

function renderInventory() {
  const tbody = document.getElementById("inventoryBody");
  const search = (document.getElementById("searchInput").value || "").toLowerCase();

  const filtered = inventoryData.filter(item =>
    item && item["product name"] &&
    item["product name"].toLowerCase().includes(search)
  );

  const start = (currentPage - 1) * rowsPerPage;
  const page = filtered.slice(start, start + rowsPerPage);

  tbody.innerHTML = page.length === 0
    ? `<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:24px;">No medicines found.</td></tr>`
    : page.map(item => {
      const stock = item.Stock;
      let pillClass = stock <= 0 ? "danger" : stock < 10 ? "low" : "ok";
      return `
          <tr>
            <td>${item["product id"]}</td>
            <td>${item["product name"]}</td>
            <td>₹${item["price rec"]}</td>
            <td><span class="stock-pill ${pillClass}">${stock}</span></td>
            <td>
              <button class="restock-btn" onclick="restock('${item["product id"]}')">
                + Restock
              </button>
            </td>
          </tr>`;
    }).join("");

  renderPagination(filtered.length);
}

function renderPagination(total) {
  const controls = document.getElementById("paginationControls");
  const pages = Math.ceil(total / rowsPerPage);
  controls.innerHTML = "";

  for (let i = 1; i <= pages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className = "page-btn" + (i === currentPage ? " active" : "");
    btn.onclick = () => { currentPage = i; renderInventory(); };
    controls.appendChild(btn);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const searchEl = document.getElementById("searchInput");
  if (searchEl) {
    searchEl.addEventListener("input", () => { currentPage = 1; renderInventory(); });
  }
});

// ================= RESTOCK =================
async function restock(id) {
  try {
    const res = await fetch(`${API_URL}/restock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();

    if (data.success) {
      const med = inventoryData.find(item => String(item["product id"]) === String(id));
      if (med) med.Stock += 50;
      renderInventory();
      loadAnalytics();
      loadCharts();
      toast("✅ Restocked! 50 units added.", "success");
    } else {
      toast("❌ Medicine not found.", "error");
    }
  } catch (err) {
    console.error("Restock error:", err);
    toast("Server error during restock.", "error");
  }
}

// ================= LOAD ANALYTICS =================
async function loadAnalytics() {
  try {
    const res = await fetch(`${API_URL}/analytics`);
    const data = await res.json();

    document.getElementById("statMeds").textContent = data.totalMedicines ?? "—";
    document.getElementById("statStock").textContent = data.totalStock ?? "—";
    document.getElementById("statLow").textContent = data.lowStockCount ?? "—";
    document.getElementById("statOut").textContent = data.outOfStockCount ?? "—";
  } catch (err) {
    console.error("Analytics error:", err);
  }
}

// ================= LOAD CHARTS =================
let ordersChartInst = null;
let stockChartInst = null;

const chartDefaults = {
  plugins: { legend: { labels: { color: "#94a3b8", font: { family: "Inter" } } } },
  scales: {
    x: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" } },
    y: { ticks: { color: "#64748b" }, grid: { color: "rgba(255,255,255,0.05)" }, beginAtZero: true }
  }
};

async function loadCharts() {
  try {
    const [orders, inventory] = await Promise.all([
      fetch(`${API_URL}/api/orders`).then(r => r.json()),
      fetch(`${API_URL}/inventory`).then(r => r.json())
    ]);

    const pending = orders.filter(o => o.status?.toLowerCase() === "pending").length;
    const approved = orders.filter(o => o.status?.toLowerCase() === "approved").length;
    const rejected = orders.filter(o => o.status?.toLowerCase() === "rejected").length;

    // Orders Trend – doughnut style via bar
    const ordersCanvas = document.getElementById("ordersChart");
    if (ordersCanvas) {
      if (ordersChartInst) ordersChartInst.destroy();
      ordersChartInst = new Chart(ordersCanvas, {
        type: "bar",
        data: {
          labels: ["Pending", "Approved", "Rejected"],
          datasets: [{
            label: "Orders",
            data: [pending, approved, rejected],
            backgroundColor: [
              "rgba(245,158,11,0.7)",
              "rgba(16,185,129,0.7)",
              "rgba(239,68,68,0.7)"
            ],
            borderColor: ["#f59e0b", "#10b981", "#ef4444"],
            borderWidth: 1,
            borderRadius: 8,
          }]
        },
        options: { ...chartDefaults, responsive: true, maintainAspectRatio: true, aspectRatio: 2.2 }
      });
    }

    // Stock Distribution
    const low = inventory.filter(i => i.Stock > 0 && i.Stock < 10).length;
    const healthy = inventory.filter(i => i.Stock >= 10).length;
    const out = inventory.filter(i => i.Stock <= 0).length;

    const stockCanvas = document.getElementById("stockChart");
    if (stockCanvas) {
      if (stockChartInst) stockChartInst.destroy();
      stockChartInst = new Chart(stockCanvas, {
        type: "doughnut",
        data: {
          labels: ["Healthy", "Low Stock", "Out of Stock"],
          datasets: [{
            data: [healthy, low, out],
            backgroundColor: ["rgba(16,185,129,0.75)", "rgba(245,158,11,0.75)", "rgba(239,68,68,0.75)"],
            borderColor: ["#10b981", "#f59e0b", "#ef4444"],
            borderWidth: 2,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 1.8,
          plugins: {
            legend: { position: "bottom", labels: { color: "#94a3b8", font: { family: "Inter" }, padding: 12, boxWidth: 12 } }
          }
        }
      });
    }

  } catch (err) {
    console.error("Chart error:", err);
  }
}

// ================= INIT =================
loadOrders();
loadInventory();
loadAnalytics();
loadCharts();