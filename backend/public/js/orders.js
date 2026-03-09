const ordersList = document.getElementById("ordersList");
async function loadOrders() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (!user || !user.id) {
      window.location.href = "login.html";
      return;
    }

    const res = await fetch(`/orders/${user.id}`);
    const orders = await res.json();

    ordersList.innerHTML = "";

    orders.forEach(order => {
      const card = document.createElement("div");
      card.className = "order-item";

      card.innerHTML = `
  <div class="order-left">
    <h3>${order.medicine}</h3>
    <p>Quantity: ${order.quantity}</p>
    <p>Daily Usage: ${order.dailyUsage || 1}</p>
    <p class="date">${new Date(order.time || order.orderDate).toLocaleString()}</p>
    ${order.refillDate ? `<p>Refill On: ${new Date(order.refillDate).toLocaleDateString()}</p>` : ""}
  </div>

  <div class="order-right">
    <span class="status ${order.status.toLowerCase()}">
      ${order.status}
    </span>
    ${order.subscription ? `<br><br><span style="background:#ff9800; color:#fff; padding:3px 8px; border-radius:12px; font-size:11px;">🔄 Subscribed</span>` : ""}
  </div>
`;
      ordersList.appendChild(card);
    });

  } catch (error) {
    console.error("Error loading orders:", error);
  }
}

loadOrders();