window.pendingMedicine = null;
window.pendingQuantity = null;
let pendingMessage = null;   // stores the original order message when bot asks daily usage
// Toggle Profile Dropdown
function toggleDropdown() {
  const dropdown = document.getElementById("profileDropdown");
  dropdown.style.display =
    dropdown.style.display === "flex" ? "none" : "flex";
}
// Close dropdown when clicking outside
window.onclick = function (event) {
  if (!event.target.matches('.profile-icon')) {
    document.getElementById("profileDropdown").style.display = "none";
  }
};


// Dynamic Dashboard Data
// Dynamic Dashboard Data Fetching
document.addEventListener("DOMContentLoaded", async function () {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user || !user.id) return;

  try {
    const res = await fetch(`/prescriptions/${user.id}`);
    const rxList = await res.json();

    document.getElementById("prescriptions").innerText = rxList.length || 0;

    const countElement = document.getElementById("prescriptionList");
    if (countElement) {
      if (rxList.length === 0) {
        countElement.innerHTML = "<p>No prescriptions found.</p>";
      } else {
        countElement.innerHTML = rxList.map(rx => `
           <div style="background:#f4f6f9; padding: 10px; margin-bottom:10px; border-radius:8px;">
             <strong>Dr. ${rx.doctorName}</strong> prescribed <strong>${rx.medicine}</strong><br>
             Qty: ${rx.quantity}, Usage: ${rx.dailyUsage}/day<br>
             <em style="color:#555;font-size:12px;">Notes: ${rx.notes}</em><br>
             <button onclick="sendRxToChat('${rx.id}', '${rx.medicine}', ${rx.quantity}, ${rx.dailyUsage})" 
                     style="margin-top:8px; background:#2a7de1; color:white; padding:5px 10px; border-radius:4px; font-size:12px; cursor:pointer; border:none;">
               Send to AI Chat to Order
             </button>
           </div>
         `).join("");
      }
    }
  } catch (e) {
    console.error("Failed to load prescriptions", e);
  }
});

window.sendRxToChat = async function (id, medicine, qty, daily) {
  const input = document.getElementById("aiInput");
  if (input) {
    input.value = `I have a prescription for ${medicine}. Please order ${qty} units for me.`;
    window.sendAIMessage();
  }

  // Use and delete the prescription
  try {
    const res = await fetch(`/prescriptions/${id}`, {
      method: "DELETE"
    });
    const data = await res.json();

    // Refresh page slightly delayed to allow chat processing
    if (data.success) {
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  } catch (err) {
    console.error("Error clearing prescription:", err);
  }
};
// ===============================
// VOICE INPUT
// ===============================
function startVoice() {
  const micBtn = document.getElementById("micBtn");
  if (!('webkitSpeechRecognition' in window)) {
    alert("Voice input not supported. Use Chrome.");
    return;
  }
  const recognition = new webkitSpeechRecognition();
  // 🎙️ Automatically adapt to the language dropdown, fallback to system language
  const userSelectedLang = document.getElementById("langSelect")?.value;
  recognition.lang = userSelectedLang || navigator.language || "en-US";

  recognition.onstart = function () {
    if (micBtn) micBtn.classList.add("listening");
  };

  recognition.onend = function () {
    if (micBtn) micBtn.classList.remove("listening");
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    document.getElementById("aiInput").value = transcript;
    if (micBtn) micBtn.classList.remove("listening");
  };

  recognition.start();
}



// ===============================
// TRACE PANEL
// ===============================
function toggleTrace() {
  const trace = document.getElementById("traceContent");
  trace.style.display =
    trace.style.display === "block" ? "none" : "block";
}
// ===============================
// FULLSCREEN CHAT
// ===============================
function expandChat() {
  document.querySelector(".ai-panel").classList.add("fullscreen");
}
function closeChat() {
  document.querySelector(".ai-panel").classList.remove("fullscreen");
}
// ===============================
// INVENTORY WARNING
// ===============================
function showInventoryWarning() {
  const lowStock = true; // simulate
  if (lowStock) {
    const chatBox = document.getElementById("aiChatBox");
    const warning = document.createElement("div");
    warning.className = "ai-message bot";
    warning.style.background = "#FEE2E2";
    warning.style.color = "#B91C1C";
    warning.innerText = "⚠ Low Stock Alert: Only 5 units remaining.";
    chatBox.appendChild(warning);
  }
}
// ===============================
// REFILL POPUP
// ===============================
function checkRefillSuggestion() {
  const shouldRefill = true; // simulate
  if (shouldRefill) {
    document.getElementById("refillPopup").style.display = "block";
  }
}
function closeRefill() {
  document.getElementById("refillPopup").style.display = "none";
}
// ===============================
// PRESCRIPTION UPLOAD
// ==============================
// ===============================
// ✅ REAL OCR: Prescription Upload (Tesseract.js)
// ==============================
async function uploadPrescription() {
  const fileInput = document.getElementById("prescriptionFile");
  const chatBox = document.getElementById("aiChatBox");

  if (!fileInput.files.length) {
    alert("Please select a prescription image first.");
    return;
  }

  const file = fileInput.files[0];

  // Show scanning indicator as a bot message
  const scanMsg = document.createElement("div");
  scanMsg.className = "ai-message bot";
  scanMsg.innerHTML = `⚙️ <b>AI Vision:</b> Scanning your prescription securely... <span class="spinner-border spinner-border-sm"></span>`;
  chatBox.appendChild(scanMsg);
  chatBox.scrollTop = chatBox.scrollHeight;

  const formData = new FormData();
  formData.append("prescription", file);

  const userData = JSON.parse(localStorage.getItem("user") || "null");
  const userId = userData?.id || "anonymous";
  if (userData && userData.id) {
    formData.append("userId", userData.id);
  }

  try {
    const res = await fetch("/scan-prescription", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      scanMsg.innerHTML = `❌ <b>AI Error:</b> ${data.error || "Could not process image."}`;
      return;
    }

    const extractedText = data.text.trim();

    // Update scanning bubble with short success status
    scanMsg.innerHTML = `✅ <b>Prescription scanned!</b> Checking stock and availability...`;

    // Show a SHORT user bubble — NOT the full OCR dump
    const userBubble = document.createElement("div");
    userBubble.className = "ai-message user";
    userBubble.innerText = "📄 Prescription uploaded — please check stock and requirements.";
    chatBox.appendChild(userBubble);

    // Bot thinking placeholder
    const botMsg = document.createElement("div");
    botMsg.className = "ai-message bot";
    botMsg.innerText = "AI is thinking...";
    chatBox.appendChild(botMsg);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Silently send full OCR text to backend without touching the input field
    const fullPrompt = "I am uploading a scanned prescription. Please analyze this text, identify the medicines, and tell me if you have them in stock matching my exact daily dose and quantities: " + extractedText;

    const chatRes = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, message: fullPrompt })
    });

    const chatData = await chatRes.json();
    botMsg.innerText = chatData.reply || "No reply from AI.";
    chatBox.scrollTop = chatBox.scrollHeight;

    // Reset file input
    fileInput.value = "";

  } catch (err) {
    console.error("OCR Error:", err);
    scanMsg.innerText = "⚠️ Network Error: Failed to process this prescription file.";
  }
}
/* Proactive Refill Popup  */
function checkRefillSuggestion() {
  const shouldRefill = true; // simulate
  if (shouldRefill) {
    document.getElementById("refillPopup").style.display = "block";
  }
}
function closeRefill() {
  document.getElementById("refillPopup").style.display = "none";
}
window.addEventListener("DOMContentLoaded", async () => {

  const userData = JSON.parse(localStorage.getItem("user") || "null");

  const userId = userData.id;   // ✅ CORRECT

  const chatBox = document.getElementById("aiChatBox");

  try {
    const res = await fetch(`/chat-history/${userId}`)
    const history = await res.json();

    chatBox.innerHTML = "";

    history.forEach(msg => {
      const div = document.createElement("div");
      div.className = msg.role ===
        "user"
        ? "ai-message user"
        : "ai-message bot";
      div.innerText = msg.message;
      chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;

  } catch (err) {
    console.error("Error loading chat history", err);
  }

});

// Unified Refill Alerts Logic
async function loadRefillAlerts(userId) {
  const uid = userId || JSON.parse(localStorage.getItem("user") || "null")?.id;
  if (!uid) return;

  try {
    const res = await fetch(`/refill-alerts/${uid}`);
    const data = await res.json();

    const refillsEl = document.getElementById("refills");
    if (refillsEl) {
      refillsEl.innerText = (data.alerts && data.alerts.length) ? data.alerts.length : 0;
    }

    if (!data.alerts || data.alerts.length === 0) return;

    const a = data.alerts[0]; // show closest alert
    const box = document.getElementById("refillPopup");
    if (!box) return;

    let message = "";
    if (a.inDays <= 0) {
      message = `🚨 Your ${a.medicine} refill is overdue!`;
    } else {
      message = `⚠ Your ${a.medicine} will run out in ${a.inDays} day(s).`;
    }

    box.innerHTML = `
      <div class="refill-alert">
        <p>${message}</p>
        <p style="font-size: 11px; margin-bottom: 8px;">Refill Date: ${new Date(a.refillDate).toLocaleDateString()}</p>
        <button onclick="orderRefill('${a.medicine}')" style="background:#2a7de1; color:white; padding:5px 10px; border:none; border-radius:4px; font-size:12px; cursor:pointer;">Order Now</button>
        <button onclick="closeRefill()" style="background:#ccc; color:white; padding:5px 10px; border:none; border-radius:4px; font-size:12px; cursor:pointer; margin-left: 5px;">Dismiss</button>
      </div>
    `;
    box.style.display = "block";
  } catch (err) {
    console.error("Error fetching refill alerts:", err);
  }
}

function orderRefill(medicine) {
  const input = document.getElementById("aiInput");
  if (!input) return;

  input.value = `I want to reorder ${medicine}`;
  document.getElementById("refillPopup").style.display = "none";
  if (typeof window.sendAIMessage === 'function') {
    window.sendAIMessage();
  }
}

const currentUser = JSON.parse(localStorage.getItem("user") || "null");

document.addEventListener("DOMContentLoaded", async () => {
  if (!currentUser || !currentUser.id) return;
  await loadOrders(currentUser.id);
  await loadRefillAlerts(currentUser.id);

  // Calculate Health Score dynamically
  const healthEl = document.getElementById("healthScore");
  if (healthEl) {
    let score = 80; // Default base score
    if (currentUser.height && currentUser.weight) {
      let h = parseFloat(currentUser.height);
      if (h > 3) h = h / 100; // Assume cm instead of m, convert it
      const w = parseFloat(currentUser.weight);
      if (h > 0 && w > 0) {
        const bmi = w / (h * h);
        if (bmi >= 18.5 && bmi <= 24.9) {
          score += 10; // Healthy BMI
        } else {
          score -= 5; // Under/Overweight
        }
      }
    }
    // Boost for complete profile
    if (currentUser.dob) score += 5;

    // Slight penalty if they have allergies, bonus if none
    if (currentUser.allergies && currentUser.allergies.trim().toLowerCase() !== "none") {
      score -= 5;
    } else {
      score += 5;
    }

    // Deduct points for recent diseases (dynamically pulled from user profile)
    const recentDiseases = currentUser.recentDiseases || [];
    if (recentDiseases.length > 0) {
      score -= (recentDiseases.length * 10);
      const diseaseInfo = document.getElementById("diseaseInfo");
      if (diseaseInfo) {
        diseaseInfo.innerText = `Recent: ${recentDiseases.join(", ")}`;
      }
    } else {
      const diseaseInfo = document.getElementById("diseaseInfo");
      if (diseaseInfo) {
        diseaseInfo.innerText = "No recent ailments";
      }
    }

    healthEl.innerText = Math.max(0, Math.min(100, score)) + "/100";
  }
});

async function loadOrders(userId) {
  try {
    const res = await fetch(`/orders/${userId}`);
    const orders = await res.json();
    console.log("Orders:", orders);

    const activeEl = document.getElementById("activeOrders");
    if (activeEl) {
      const activeCount = Array.isArray(orders) ? orders.filter(o => o.status === "Pending").length : 0;
      activeEl.innerText = activeCount;
    }
  } catch (err) {
    console.error("Error fetching orders:", err);
  }
}



document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendBtn");
  const micBtn = document.getElementById("micBtn");
  const input = document.getElementById("aiInput");

  if (sendBtn) sendBtn.addEventListener("click", (e) => sendAIMessage(e));
  if (micBtn) micBtn.addEventListener("click", startVoice);

  // Auto-resize textarea as user types
  if (input) {
    input.addEventListener("input", function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    // Enter = send, Shift+Enter = new line
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendAIMessage(e);
        input.style.height = 'auto'; // reset height after send
      }
    });
  }
});

window.sendAIMessage = async function (e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById("aiInput");
  const chatBox = document.getElementById("aiChatBox");
  if (!input || !chatBox) return;

  const text = input.value.trim();
  if (!text) return;

  const userData = JSON.parse(localStorage.getItem("user") || "null");
  const userId = userData?.id || "anonymous";

  // show user message
  const userMsg = document.createElement("div");
  userMsg.className = "ai-message user";
  userMsg.innerText = text;
  chatBox.appendChild(userMsg);
  input.value = "";

  // bot placeholder
  const botMsg = document.createElement("div");
  botMsg.className = "ai-message bot";
  botMsg.innerText = "AI is thinking...";
  chatBox.appendChild(botMsg);
  chatBox.scrollTop = chatBox.scrollHeight;

  const payload = { userId, message: text };

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    botMsg.innerText = data.reply || "No reply";

    // Refresh dashboard stats dynamically
    if (userId && userId !== "anonymous") {
      if (typeof loadOrders === "function") loadOrders(userId);
      if (typeof loadRefillAlerts === "function") loadRefillAlerts(userId);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
  } catch (err) {
    console.error(err);
    botMsg.innerText = "⚠ Error connecting to server.";
  }
};

