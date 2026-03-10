const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcrypt");
const xlsx = require("xlsx");
const { Langfuse } = require("langfuse");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { OpenAI } = require("openai");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 5000;

// =============================
// MONGODB CONNECTION
// =============================
const MONGO_URI = process.env.MONGO_URI;

// =============================
// GLOBAL DATA STORAGE
// =============================
let users = [];
let orders = [];
let prescriptions = [];
let chatHistory = [];
let inventory = []; // Moved here for persistence
const chatHistoryPath = path.join(__dirname, "chatHistory.json");
const orderFile = path.join(__dirname, "orders.json");
const prescriptionsFile = path.join(__dirname, "prescriptions.json");
const inventoryFile = path.join(__dirname, "inventory.xlsx");
let inventoryWorkbook = fs.existsSync(inventoryFile) ? xlsx.readFile(inventoryFile) : null;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
      console.log("🍃 MongoDB Connected!");
      // Initialize data from MongoDB
      syncDataFromDB();
    })
    .catch(err => console.error("❌ MongoDB Connection Error:", err));
} else {
  console.warn("⚠️ MONGO_URI missing, the app is running in local file storage mode.");
}

// =============================
// MONGODB SCHEMAS
// =============================
const UserSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  dob: String,
  height: String,
  weight: String,
  allergies: String,
  address: String,
  language: { type: String, default: 'en' }
});

const OrderSchema = new mongoose.Schema({
  id: String,
  userId: String,
  name: String,
  medicine: String,
  quantity: Number,
  dailyUsage: Number,
  orderDate: { type: Date, default: Date.now },
  refillDate: Date,
  status: { type: String, default: 'Pending' },
  subscription: { type: Boolean, default: false }
});

const PrescriptionSchema = new mongoose.Schema({
  id: String,
  patientId: String,
  doctorName: String,
  medicine: String,
  quantity: Number,
  dailyUsage: Number,
  notes: String,
  date: { type: Date, default: Date.now }
});

const ChatHistorySchema = new mongoose.Schema({
  userId: String,
  role: String,
  message: String,
  time: { type: Date, default: Date.now }
});

const InventorySchema = new mongoose.Schema({
  "product id": { type: String, unique: true },
  "product name": String,
  pzn: String,
  "price rec": Number,
  "package size": String,
  descriptions: String,
  prescriptionRequired: String,
  allergyTriggers: String,
  Stock: Number
});

const UserModel = mongoose.models.User || mongoose.model("User", UserSchema);
const OrderModel = mongoose.models.Order || mongoose.model("Order", OrderSchema);
const PrescriptionModel = mongoose.models.Prescription || mongoose.model("Prescription", PrescriptionSchema);
const ChatHistoryModel = mongoose.models.ChatHistory || mongoose.model("ChatHistory", ChatHistorySchema);
const InventoryModel = mongoose.models.Inventory || mongoose.model("Inventory", InventorySchema);

// Sync in-memory arrays with DB
async function syncDataFromDB() {
  try {
    const dbUsers = await UserModel.find({});
    const dbOrders = await OrderModel.find({});
    const dbPrescriptions = await PrescriptionModel.find({});
    const dbInventory = await InventoryModel.find({});

    if (dbUsers.length > 0) users = dbUsers;
    if (dbOrders.length > 0) orders = dbOrders;
    if (dbPrescriptions.length > 0) prescriptions = dbPrescriptions;
    if (dbInventory.length > 0) {
      inventory = dbInventory.map(i => i.toObject());
      console.log(`📊 Synced: ${dbInventory.length} inventory items from Cloud.`);
    }

    console.log(`📊 Synced: ${dbUsers.length} users, ${dbOrders.length} orders, ${dbPrescriptions.length} prescriptions, ${dbInventory.length} inventory items from Cloud.`);

    // Initial migration from local files if DB is empty
    if (dbUsers.length === 0 && fs.existsSync('./users.json')) {
      const localUsers = JSON.parse(fs.readFileSync('./users.json'));
      if (localUsers.length > 0) {
        await UserModel.insertMany(localUsers);
        console.log("📤 Migrated users to Cloud.");
      }
    }
    if (dbOrders.length === 0 && fs.existsSync('./orders.json')) {
      const localOrders = JSON.parse(fs.readFileSync('./orders.json'));
      if (localOrders.length > 0) {
        await OrderModel.insertMany(localOrders);
        console.log("📤 Migrated orders to Cloud.");
      }
    }
    if (dbPrescriptions.length === 0 && fs.existsSync('./prescriptions.json')) {
      const localPres = JSON.parse(fs.readFileSync('./prescriptions.json'));
      if (localPres.length > 0) {
        await PrescriptionModel.insertMany(localPres);
        console.log("📤 Migrated prescriptions to Cloud.");
      }
    }

    // Initial migration for inventory from Excel if DB is empty
    if (dbInventory.length === 0 && fs.existsSync(inventoryFile)) {
      const workbook = xlsx.readFile(inventoryFile);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const localInventory = xlsx.utils.sheet_to_json(sheet).filter(item => item["product id"] && item["product name"]);
      if (localInventory.length > 0) {
        await InventoryModel.insertMany(localInventory);
        inventory = localInventory;
        console.log(`📤 Migrated ${localInventory.length} valid inventory items to Cloud.`);
      }
    }
  } catch (err) {
    console.error("❌ Sync Error:", err);
  }
}

const upload = multer({ storage: multer.memoryStorage() });


// =============================
// GROQ SETUP (OpenAI Compat)
// =============================
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const openai = new OpenAI({
  apiKey: GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1", // Groq API base URL
});

async function callGroq({ user, message, inventoryPreview = "", chatHistory = [], mode = "chat" }) {
  if (!GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY");

  const allergies = (user?.allergies || "").trim();
  const age = user?.dob ? calculateAge(user.dob) : null;

  const systemInstruction = `
You are SafetyFirst AI, a friendly and professional pharmacy assistant.
CRITICAL LANGUAGE RULE: You MUST reply EXCLUSIVELY in the user's language. Use the provided language context to ensure you do not switch mid-chat.

Goals:
1) 😊 Be friendly + short.
2) 🔍 If user asks symptoms/medicine advice: ask 1-2 quick clarifying questions if needed.
3) ⚠️ ALWAYS respect user allergies. If allergies conflict, warn clearly and suggest safer alternatives.
4) 📄 If medicine needs prescription and user does not have it, warn and suggest doctor/pharmacist.
5) 🚨 If symptoms are severe (chest pain, breathing trouble, fainting, bleeding, very high fever, severe allergic reaction), advise emergency care immediately.
6) 🛒 Do NOT claim you placed an order or changed stock. Ordering is handled by backend.
7) 💡 Give simple guidance, not medical diagnosis.
8) 📜 If user asks about their order history or past medications, list ALL entries from the 'USER FULL ORDER HISTORY' provided. Never cut the list short — include every item with its quantity, status, and date.

- Name: ${user?.name || "User"}
- Age: ${age ?? "unknown"}
- Allergies: ${allergies || "none given"}

Inventory preview (may be partial):
${inventoryPreview}

PROMPT_LANGUAGE_CODE: ${mode === "chat" ? (user?.language || "en") : "en"}
CRITICAL MANDATE: You MUST reply ONLY in the language associated with the code above. If 'en', reply in English.
HANDWRITING RECOVERY MODE: If the input text looks like messy OCR (misspellings, numbers representing letters), use the "FULL MEDICINE LIST" provided to intelligently guess the intended medicine. For example, if you see "Am0xicil1n", match it to "Amoxicillin". ALWAYS ask for user confirmation if you are guessing.
`.trim();

  // ✨ GET LAST 6 MESSAGES FROM HISTORY
  let historySlice = (chatHistory || [])
    .filter(m => String(m.userId) === String(user?.id || "anonymous"))
    .slice(-6)
    .map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.message
    }));

  const messages = [
    { role: "system", content: systemInstruction },
    ...historySlice,
    { role: "user", content: message }
  ];

  const completion = await openai.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: messages,
    temperature: 0.4,
    max_tokens: 600
  });

  const text = completion.choices[0].message.content || "I couldn't generate a reply right now.";

  return text.trim();
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
// Langfuse setup
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
function sendEmail(to, subject, message, html = null) {
  transporter.sendMail({
    from: `"SafetyFirst AI" <${transporter.options.auth.user}>`,
    to: to,
    subject: subject,
    text: message,
    html: html
  }, (err, info) => {
    if (err) {
      console.log("Email error:", err);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

function sendAdminAlert(subject, message) {
  const adminEmail = process.env.EMAIL_USER || "priyanshugundle@gmail.com"; // Admin email
  sendEmail(adminEmail, `🚨 ADMIN ALERT: ${subject}`, message);
}



app.post("/chat", async (req, res) => {
  try {
    const { message, userId, dailyUsage } = req.body;

    // 🌐 STEP 1: Determine Language & Translate to English
    let engMessage = message;
    let detectedLang = "en";

    // ⚡ PRE-RECOGNITION: Check for obvious English (fever, cough, hi, etc.)
    const lowerMsg = message.toLowerCase().trim();
    const commonEng = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|bye|good|fever|cough)$/i;

    if (!commonEng.test(lowerMsg)) {
      try {
        const detectRes = await openai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "Output 'code|translation'. Example: 'es|Hello'. If English: 'en|Original'. Focus: English 'hi' is NOT Hindi 'hi'."
            },
            { role: "user", content: message }
          ],
          temperature: 0, max_tokens: 150
        });
        const fullTxt = detectRes.choices[0].message.content.trim();
        const pipePos = fullTxt.indexOf("|");
        if (pipePos > 0) {
          detectedLang = fullTxt.substring(0, pipePos).trim().toLowerCase();
          engMessage = fullTxt.substring(pipePos + 1).trim();
        }
      } catch (e) { console.error("Detection Error", e); }
    }

    // 1) First try existing agent-order endpoint internally with English text
    const agentRes = await fetch(`http://localhost:${PORT}/agent-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: engMessage, userId, dailyUsage })
    });

    const agentData = await agentRes.json();

    // ✅ If agent-order handled it (order, stock check, or prescription issue)
    const agentReply = agentData.reply || "";
    const isAgentAction = agentData.askDailyUsage ||
      agentData.askQuantity ||
      /\b(order|placed|refill|stock|out of stock|prescription|available|found|sorry|unable|units)\b/i.test(agentReply);

    if (isAgentAction) {
      let finalReply = agentReply;

      // 🌐 TRANSLATE BACK TO USER'S NATIVE LANGUAGE
      if (detectedLang !== "en" && finalReply) {
        try {
          const trRes = await openai.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "system", content: `You are a translator. Translate this pharmaceutical text to the language code: ${detectedLang}. Keep all emojis intact. DO NOT add conversational filler, ONLY output the direct translation.` }, { role: "user", content: finalReply }],
            temperature: 0.1, max_tokens: 300
          });
          agentData.reply = trRes.choices[0].message.content.trim();
        } catch (e) { }
      }

      // Save history for agent responses (Cloud)
      try {
        const userMsg = new ChatHistoryModel({ userId, role: "user", message, time: new Date() });
        const botMsg = new ChatHistoryModel({ userId, role: "bot", message: agentData.reply, time: new Date() });
        await userMsg.save();
        await botMsg.save();
      } catch (e) { console.error("History Save Error:", e); }

      return res.json(agentData);
    }

    // ✅ Fallback to AI chat using ORIGINAL native message (so it replies naturally)
    const aiRes = await fetch(`http://localhost:${PORT}/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message, userId, lang: detectedLang }) // passed detectedLang
    });

    const aiData = await aiRes.json();
    return res.json({ reply: aiData.reply });

  } catch (err) {
    console.error("CHAT ROUTER ERROR:", err);
    res.status(500).json({ reply: "Server error. Try again." });
  }
});



// Data initialization moved to top
/* =====================================================
   Chat History
 ===================================================== */
app.get("/chat-history/:userId", (req, res) => {
  const userId = req.params.userId;

  if (!fs.existsSync(chatHistoryPath)) {
    return res.json([]);
  }

  const chatHistory = JSON.parse(fs.readFileSync(chatHistoryPath));

  const userChats = chatHistory.filter(
    msg => msg.userId == userId
  );

  res.json(userChats);
});
/* =====================================================
   Age-Aware Dosage Alert
 ===================================================== */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
// Data initialization moved to top syncDataFromDB()

/* =====================================================
   🧠 AGENT TRACE STORAGE & PRESCRIPTIONS
 ===================================================== */
let agentLogs = [];
// prescriptions moved to top

app.get("/prescriptions/:userId", (req, res) => {
  const userRx = prescriptions.filter(p => String(p.patientId) === String(req.params.userId));
  res.json(userRx);
});

app.delete("/prescriptions/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await PrescriptionModel.deleteOne({ id: String(id) });
    prescriptions = prescriptions.filter(p => String(p.id) !== String(id));
    fs.writeFileSync(prescriptionsFile, JSON.stringify(prescriptions, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

/* =====================================================
   🧠 FULL AGENT ROUTE (LLM Powered)
 ===================================================== */
let lastAgentDecision = null;

// =============================
// GROQ VISION OCR PRESCRIPTION SCAN (replaces Gemini)
// =============================
app.post("/scan-prescription", upload.single("prescription"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No prescription image was successfully uploaded." });
  }

  try {
    // Use Groq's vision model via the already-configured openai client
    const base64Image = req.file.buffer.toString("base64");
    const mimeType = req.file.mimetype;

    console.log("📸 AI Vision: Processing prescription scan...");
    const visionRes = await openai.chat.completions.create({
      model: "llama-3.2-11b-vision-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            },
            {
              type: "text",
              text: "Analyze this prescription carefully. Extract all medicines, daily dosages, and quantities explicitly in a professional, clear list format. Do not invent any non-existent data."
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 1024
    });

    const text = visionRes.choices[0].message.content || "";

    // 🧠 AUTO-SAVE TO USER PROFILE if userId is provided
    const userId = req.body.userId;
    if (userId) {
      try {
        const structuralRes = await openai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "Extract medicines from prescription text. Output JSON: { \"prescriptions\": [ { \"medicine\": \"name\", \"quantity\": number, \"dailyUsage\": number, \"doctorName\": \"string (or Unknown)\", \"notes\": \"string\" } ] }" },
            { role: "user", content: text }
          ],
          response_format: { type: "json_object" },
          temperature: 0
        });
        const extracted = JSON.parse(structuralRes.choices[0].message.content).prescriptions || [];

        for (const rx of extracted) {
          const newRx = new PrescriptionModel({
            id: (Date.now() + Math.floor(Math.random() * 999)).toString(),
            patientId: userId,
            doctorName: rx.doctorName || "Unknown Doctor",
            medicine: rx.medicine,
            quantity: rx.quantity || 1,
            dailyUsage: rx.dailyUsage || 1,
            notes: rx.notes || "Auto-extracted from scan",
            date: new Date()
          });
          await newRx.save();
          prescriptions.push(newRx.toObject());
        }
        fs.writeFileSync(prescriptionsFile, JSON.stringify(prescriptions, null, 2));
      } catch (e) {
        console.error("Prescription Structural Parse Error:", e);
      }
    }

    res.json({ text });

  } catch (err) {
    console.error("Groq Vision OCR Processing Error:", err);
    res.status(500).json({ error: err.message });
  }
});




app.post("/agent-order", async (req, res) => {
  const trace = langfuse.trace({
    name: "Pharmacy Multi-Agent Flow",
    userId: String(req.body.userId || "anonymous"),
    input: req.body.message,
    metadata: {
      input: req.body.message
    }
  });
  try {
    let logBaseTime = Date.now();
    const { message, chatHistory: incomingHistory } = req.body;
    const userId = String(req.body.userId || "anonymous");

    // ✨ LOAD CHAT FROM DB OR PAYLOAD
    let chatHistory = incomingHistory;
    if (!chatHistory) {
      chatHistory = await ChatHistoryModel.find({ userId }).sort({ time: 1 }).limit(5);
      chatHistory = chatHistory.map(h => h.toObject());
    }
    const historyString = chatHistory.map(m => `${m.role.toUpperCase()}: ${m.message}`).join("\n");
    // 🚀 CONSOLIDATED ORCHESTRATOR AGENT
    const orchestratorSpan = trace.span({ name: "Orchestrator Agent", startTime: new Date(logBaseTime += 5) });
    // Extract pending state from history manually to ensure LLM doesn't drop it
    let pendingContext = "";
    let extractedNames = [];
    let extractedQty = {};

    const lastBotMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;

    if (lastBotMsg && lastBotMsg.role === "bot") {
      if (lastBotMsg.message.includes("How many units would you like to order for each medicine below?")) {
        pendingContext = "CONTEXT: User is answering for QUANTITY.";
        // Ex: Paracetamol 500mg Tablet: 
        const lines = lastBotMsg.message.split("\n");
        for (let line of lines) {
          if (line.includes(":") && !line.includes("Example") && !line.includes("How many") && !line.includes("Please reply")) {
            extractedNames.push(line.split(":")[0].trim());
          }
        }
      } else if (lastBotMsg.message.includes("How many units per day do you take for each medicine below?")) {
        pendingContext = "CONTEXT: User is answering for DAILY DOSE.";
        const lines = lastBotMsg.message.split("\n");
        for (let line of lines) {
          if (line.includes(":") && !line.includes("Example") && !line.includes("How many") && !line.includes("Please reply")) {
            extractedNames.push(line.split(":")[0].trim());
          }
        }

        // We need to look further back to find the qty they provided
        if (chatHistory.length >= 3) {
          // Turn -3: Bot asks for qty
          // Turn -2: User provides qty (e.g. "5")
          // Turn -1: Bot asks for daily dose
          // Turn 0: User provides daily dose
          const priorUserMsg = chatHistory[chatHistory.length - 2];
          if (priorUserMsg && priorUserMsg.role === "user") {
            const qtyLines = priorUserMsg.message.split("\n").filter(l => l.trim().length > 0);
            extractedNames.forEach((name, idx) => {
              if (qtyLines[idx]) {
                // try to extract number
                let match = qtyLines[idx].match(/\d+/);
                if (match) extractedQty[name] = parseInt(match[0]);
              }
            });
          }
        }
      }
    }
    const userHistoryStr = orders.filter(o => String(o.userId) === String(userId)).slice(-5).map(o => o.medicine).join(", ");
    const inventoryList = inventory.map(i => i["product name"]).join(", ");

    const orchestratorRes = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are the SafetyFirst AI Orchestrator. Your goal is to process a pharmacy request.

INVENTORY: [${inventoryList}]
USER PAST ORDERS: [${userHistoryStr}]
${pendingContext}

EXTRACTION RULES:
- Identify medicines, quantities (qty), and daily doses (dailyDose).
- If the user is replying with bare numbers, map them to the medicines currently being discussed.
- If ${extractedNames.length} > 0, the medicines in question are: ${extractedNames.join(", ")}. MUST OUTPUT THESE.

CHECKS TO PERFORM:
1. SAFETY: Check for overdose, self-harm, or dangerous requests.
2. INTENT: Is this an 'order' (buying) or an 'inquiry' (asking price/stock)?
3. SUBSCRIPTION: Does the user want this to be a recurring monthly order?
4. PREDICTIVE: Should we suggest a refill for a past medication?
5. EXTRACTION: Identify medicines, quantities (qty), and daily doses (dailyDose).
6. DURATION: Extract duration in days if mentioned.

RULES:
- If unsafe, set 'safe' to false and provide 'reason'.
- Use 'Chat History' to resolve bare numbers.
- DYNAMIC STATE RECOVERY: If the user is replying with bare numbers (quantities or daily doses) in response to a bot question, you MUST include the EXACT medicine names from the previous turn in the 'items' array. Do NOT output items without a 'name'.
- Furthermore, if the chat history shows the user previously provided a 'quantity', and now they are providing a 'daily dose' (or vice versa), you MUST output BOTH the old 'qty' and the new 'dailyDose' along with the 'name' in your JSON output. Never output null for a value that was established in a previous chat turn.
- Output JSON ONLY.

JSON SCHEMA:
{
  "safe": boolean,
  "reason": "string",
  "intent": "order" | "inquiry",
  "isSubscription": boolean,
  "refillSuggestion": "string",
  "daysMultiplier": number,
  "items": [ { "name": "exact name from inventory", "qty": number | null, "dailyDose": number | null } ]
}`
        },
        { role: "user", content: `Chat History:\n${historyString}\n\nUser Message: ${message}` }
      ],
      response_format: { type: "json_object" },
      temperature: 0
    });

    const output = JSON.parse(orchestratorRes.choices[0].message.content);
    orchestratorSpan.update({ output: JSON.stringify(output) });
    orchestratorSpan.end({ endTime: new Date(logBaseTime += 5) });

    if (!output.safe) {
      trace.update({ output: "Unsafe request blocked" });
      await langfuse.flushAsync();
      return res.json({ reply: "⚠️ Safety Alert: " + output.reason });
    }

    const { intent, isSubscription, daysMultiplier, items } = output;
    let finalItems = items || [];

    // Apply days logic and force manual state injection if LLM forgot qty
    finalItems = finalItems.map(item => {
      const it = { ...item };

      // Inject manually parsed qty if LLM dropped it
      if (extractedQty[it.name] && (it.qty === null || it.qty === undefined)) {
        it.qty = extractedQty[it.name];
      }

      const dose = it.dailyDose || null;
      let qty = it.qty || null;

      // If we have a duration (daysMultiplier) from the text, use it to calculate qty if qty is missing
      if (qty === null && daysMultiplier > 1 && dose !== null) {
        qty = daysMultiplier * dose;
      }

      it.qty = qty;
      it.dailyDose = dose;
      return it;
    });

    // 🛑 If it's just an inquiry, bypass quantity/dose checks and go to the Action Agent
    if (intent === "inquiry") {
      const inquiryResults = [];
      for (const it of finalItems) {
        const medicineMatch = it.name.trim().toLowerCase();
        // Matching Priority: Exact > StartsWith > Includes
        const medicine = inventory.find(m => (m["product name"] || "").toLowerCase() === medicineMatch) ||
          inventory.find(m => (m["product name"] || "").toLowerCase().startsWith(medicineMatch)) ||
          inventory.find(m => (m["product name"] || "").toLowerCase().includes(medicineMatch));

        if (medicine) {
          inquiryResults.push(`ℹ️ INFO: Product: ${medicine["product name"]}, Price: ₹${medicine["price rec"]}, Stock: ${medicine.Stock}, Pack: ${medicine["package size"]}, RX Needed: ${medicine.prescriptionRequired}`);
        } else {
          inquiryResults.push(`❓ NOT FOUND: ${it.name}`);
        }
      }
      const actionRes = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are the Action AI. The user is asking for information about medicines. Use the provided logs to answer their question professionally and helpfully. Output JSON: { \"reply\": \"string\" }" },
          { role: "user", content: `Inquiry Logs:\n${inquiryResults.join("\n")}\n\nUser Question: ${message}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      });
      const responseText = JSON.parse(actionRes.choices[0].message.content).reply;
      trace.update({ output: responseText });
      await langfuse.flushAsync();
      return res.json({ reply: responseText });
    }

    // 🛑 Missing quantity interrupt — ask about ALL missing at once
    const missingQtyItems = finalItems.filter(i => i.qty === null || typeof i.qty === "undefined" || Number.isNaN(i.qty));
    if (missingQtyItems.length > 0 && message.toLowerCase() !== "yes") {
      const names = missingQtyItems.map((i, idx) => `${idx + 1}. ${i.name}`).join("\n");
      orchestratorSpan.update({ output: "Missing quantity for some items, prompting user." });
      trace.update({ output: "Prompting user for quantities" });
      await langfuse.flushAsync();
      return res.json({
        askQuantity: true,
        reply: `How many units would you like to order for each medicine below?\nPlease reply with one number per line in this format:\n\n${missingQtyItems.map(i => `${i.name}: `).join("\n")}\n\nExample:\n${missingQtyItems.map(i => `${i.name}: 10`).join("\n")}`
      });
    }

    // 🛑 Missing daily dose interrupt — ask about ALL missing at once
    const missingDoseItems = finalItems.filter(i => i.dailyDose === null || typeof i.dailyDose === "undefined" || Number.isNaN(i.dailyDose));
    if (missingDoseItems.length > 0 && message.toLowerCase() !== "yes") {
      const names = missingDoseItems.map((i, idx) => `${idx + 1}. ${i.name}`).join("\n");
      orchestratorSpan.update({ output: "Missing daily dose for some items, prompting user." });
      trace.update({ output: "Prompting user for daily doses" });
      await langfuse.flushAsync();
      return res.json({
        askDailyDose: true,
        reply: `How many units per day do you take for each medicine below? (used to schedule your refill reminders)\nPlease reply with one number per line in this format:\n\n${missingDoseItems.map(i => `${i.name}: `).join("\n")}\n\nExample:\n${missingDoseItems.map(i => `${i.name}: 1`).join("\n")}`
      });
    }

    const results = [];
    const today = new Date();

    orchestratorSpan.update({ output: `Parsed ${finalItems.length} item(s) via Groq` });

    // 5️⃣ Action Agent
    const actionSpan = trace.span({ name: "Action Agent", startTime: new Date(logBaseTime += 5) });

    for (const it of finalItems) {

      if (!it.name) continue;

      const dailyUsage = Math.max(1, parseInt(it.dailyDose || req.body.dailyUsage || 1));

      // Ensure Groq's exact name is used to match inventory, prioritize exact matches
      const medicineMatch = it.name.trim().toLowerCase();
      const medicine = inventory.find(m => (m["product name"] || "").toLowerCase() === medicineMatch) ||
        inventory.find(m => (m["product name"] || "").toLowerCase().startsWith(medicineMatch)) ||
        inventory.find(m => (m["product name"] || "").toLowerCase().includes(medicineMatch)) ||
        inventory.find(m => medicineMatch.includes((m["product name"] || "").toLowerCase()));

      if (!medicine) {
        results.push(`❌ Not found: ${it.name}`);
        continue;
      }

      const stockKey = "Stock";
      medicine[stockKey] = Number(medicine[stockKey] || 0);

      if (medicine[stockKey] < it.qty) {
        results.push(`⚠️ ${medicine["product name"]}: insufficient stock`);
        continue;
      }

      // 🛡️ AUTOMATION: Prescription Check (Automated Matcher)
      const presReq = String(medicine["prescriptionRequired"] || "").toLowerCase().trim();
      const isRxRequired = presReq === "yes" || presReq.includes("yes");

      if (isRxRequired) {
        const matchingRx = prescriptions.find(p =>
          String(p.patientId) === String(userId) &&
          (p.medicine.toLowerCase().includes(medicine["product name"].toLowerCase().trim()) ||
            medicine["product name"].toLowerCase().includes(p.medicine.toLowerCase().trim()))
        );

        if (!matchingRx) {
          results.push(`❌ BLOCKED: ${medicine["product name"]} REQUIRES a prescription. No valid prescription found for this user. Please ask the user to upload their prescription image using the attachment icon.`);
          continue;
        } else {
          results.push(`✅ RX VERIFIED: Valid prescription found for ${medicine["product name"]} in user profile. Processing order.`);
        }
      } else {
        results.push(`ℹ️ OTC ITEM: ${medicine["product name"]} does NOT require a prescription.`);
      }

      results.push(`📦 STOCK CHECK: ${medicine["product name"]} has sufficient stock (Stock: ${medicine[stockKey]}, Requested: ${it.qty}).`);

      const daysCovered = Math.floor(it.qty / dailyUsage);
      const refillDate = new Date(today);
      refillDate.setDate(today.getDate() + Math.max(0, daysCovered - 2));

      medicine[stockKey] -= it.qty;
      // Update MongoDB for real-time persistence
      await InventoryModel.findOneAndUpdate(
        { "product id": medicine["product id"] },
        { Stock: medicine[stockKey] }
      );

      const user = users.find(u => String(u.id) === String(userId));
      const userName = user ? user.name : "Unknown User";

      const newOrder = new OrderModel({
        id: (Date.now() + Math.floor(Math.random() * 9999)).toString(),
        userId,
        name: userName,
        medicine: medicine["product name"],
        quantity: it.qty,
        dailyUsage,
        orderDate: today,
        refillDate,
        status: "Pending",
        subscription: isSubscription
      });
      await newOrder.save();
      orders.push(newOrder.toObject());

      results.push(`🎉 SUCCESS: Created order for ${it.qty} units of ${medicine["product name"]}.`);

      // Email sending moved to Admin Approval

      setImmediate(() => {
        // 🚨 AUTOMATION: Low Stock Alert
        if (medicine[stockKey] < 10) {
          sendAdminAlert("Low Stock Warning", `Product "${medicine["product name"]}" is running low. Current stock: ${medicine[stockKey]}`);
        }
      });
    }

    // Save order history (JSON) backup
    fs.writeFileSync("./orders.json", JSON.stringify(orders, null, 2));

    // 📦 Update Spreadsheet Backup
    try {
      if (inventoryWorkbook) {
        const newInventorySheet = xlsx.utils.json_to_sheet(inventory);
        inventoryWorkbook.Sheets[inventoryWorkbook.SheetNames[0]] = newInventorySheet;
        xlsx.writeFile(inventoryWorkbook, inventoryFile);
      }
    } catch (e) {
      console.error("Excel save error (non-critical):", e);
    }

    const rawResults = results.length
      ? results.join("\n")
      : "No valid medicines found.";

    // 5️⃣ Action Agent (Formulation)
    const actionSpanText = trace.span({ name: "Action Formulation Agent", startTime: new Date(logBaseTime += 5) });
    const actionRes = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are the Action AI. The backend has just processed a pharmacy request. You will receive 'Backend Logs' which are the absolute source of truth. \n\nRULES:\n1. If a log starts with '❌ BLOCKED', you MUST tell the user the order for that item failed and explain why. If the reason is a missing prescription, politely ask the user to upload their prescription image using the attachment (📎) icon so we can verify it.\n2. If a log starts with '🎉 SUCCESS', tell them the order was successfully placed.\n3. Mention every medicine found in the logs.\n4. Do NOT say 'prescription status not specified'—look at the ℹ️ and ✅ logs to determine the status.\n5. Be professional, friendly, and concise. Do NOT invent data not in the logs.\n\nOutput JSON: { \"reply\": \"string\" }" },
        { role: "user", content: `Backend Logs:\n${rawResults}` }
      ],

      response_format: { type: "json_object" },
      temperature: 0
    });
    let finalReply = JSON.parse(actionRes.choices[0].message.content).reply || rawResults;

    // Append proactive refill suggestion if any
    if (output.refillSuggestion && output.refillSuggestion.length > 5) {
      finalReply += `\n\n💡 Proactive Suggestion: ${output.refillSuggestion}`;
    }

    actionSpanText.update({ output: finalReply });
    actionSpanText.end({ endTime: new Date(logBaseTime += 5) });

    trace.update({ output: finalReply });
    await langfuse.flushAsync();
    // Save chat BEFORE returning
    chatHistory.push({
      userId,
      role: "bot",
      message: finalReply,
      time: new Date()
    });

    fs.writeFileSync(chatHistoryPath, JSON.stringify(chatHistory, null, 2));

    // Send email async (no delay)
    // We send emails for each successful item in the loop now.
    // (Original code was sending only for the first item)

    return res.json({ reply: finalReply });

  } catch (error) {
    console.error("SERVER ERROR:", error);
    trace.update({
      output: "Server error"
    });

    fs.writeFileSync(orderFile, JSON.stringify(orders, null, 2));
    await langfuse.flushAsync();
    res.status(500).json({ reply: "Server error" });
  }
})
// =============================
// LOAD USERS
// =============================
// users moved to top
// Inventory managed by syncDataFromDB()
// ============================
// GET FULL INVENTORY
// =============================
app.get("/inventory", (req, res) => {
  res.json(inventory);
});

// =============================
// DOCTOR PRESCRIPTIONS
// =============================
// Prescription routes removed.


// =============================
// SEARCH MEDICINE
// =============================
app.get("/search", async (req, res) => {
  const query = req.query.name?.toLowerCase();
  if (!query) {
    return res.json({ found: false });
  }
  const result = inventory.find(item =>
    item["product name"] &&
    item["product name"].toLowerCase().includes(query)
  );
  if (result) {
    // Demo simulation
    if (result.Stock > 0) {
      result.Stock -= 1;
      // Also update DB for consistency in demo
      InventoryModel.findOneAndUpdate(
        { "product id": result["product id"] },
        { Stock: result.Stock }
      ).exec().catch(e => console.error("Search stock update error", e));
    }
    const stock = result.Stock;
    let message;
    if (stock <= 0) {
      message = "⚠ Currently OUT OF STOCK.";
    } else if (stock < 5) {
      message = "⚠ Very low stock. Order soon.";
    } else if (stock <= 20) {
      message = "⚠ Limited stock available.";
    } else {
      message = "✅ Available.";
    }
    res.json({
      found: true,
      medicine: result["product name"],
      price: result["price rec"],
      status: message
    });
  }
});
// =============================
// ANALYTICS
// =============================
app.get("/analytics", (req, res) => {
  const totalMedicines = inventory.length;
  const totalStock = inventory.reduce((sum, item) => {
    return sum + (item.Stock || 0);
  }, 0);
  const lowStock = inventory.filter(item => item.Stock > 0 && item.Stock < 10);
  const outOfStock = inventory.filter(item => item.Stock <= 0);
  res.json({
    totalMedicines,
    totalStock,
    lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length,
    lowStockItems: lowStock
  });
});
// =============================
// RESTOCK MEDICINE
// =============================
app.post("/restock", async (req, res) => {
  const { id } = req.body;
  const medicine = inventory.find(item => item["product id"] == id);
  if (medicine) {
    medicine.Stock += 50; // add 50 units

    // 📦 PERSIST TO DB
    await InventoryModel.findOneAndUpdate(
      { "product id": medicine["product id"] },
      { Stock: medicine.Stock }
    );

    // 📦 PERSIST THE RESTOCK TO EXCEL BACKUP
    try {
      if (inventoryWorkbook) {
        const newInventorySheet = xlsx.utils.json_to_sheet(inventory);
        inventoryWorkbook.Sheets[inventoryWorkbook.SheetNames[0]] = newInventorySheet;
        xlsx.writeFile(inventoryWorkbook, inventoryFile);
      }
    } catch (e) {
      console.error("Excel save error (non-critical):", e);
    }

    res.json({ success: true, newStock: medicine.Stock });
  } else {
    res.json({ success: false, message: "Medicine not found" });
  }
});
// =============================
// ROUTE SIGNUP
// =============================
app.post("/signup", async (req, res) => {
  const { name, email, password, role, dob, height, weight, allergies, address } = req.body;
  if (!name || !email || !password) {
    return res.json({ success: false, message: "Required fields missing" });
  }
  try {
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.json({ success: false, message: "Email already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString();
    const newUser = new UserModel({
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: role || "user",
      dob: dob || "",
      height: height || "",
      weight: weight || "",
      allergies: allergies || "",
      address: address || ""
    });
    await newUser.save();
    // Update local array
    const userObj = newUser.toObject();
    users.push(userObj);
    fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ success: false, message: "Error during signup" });
  }
});

app.post("/update-profile", async (req, res) => {
  const { id, dob, height, weight, allergies, address } = req.body;
  try {
    const user = await UserModel.findOneAndUpdate(
      { id: String(id) },
      { dob, height, weight, allergies, address },
      { new: true }
    );
    if (!user) return res.json({ success: false });

    // Update local cache
    const idx = users.findIndex(u => String(u.id) === String(id));
    if (idx !== -1) users[idx] = user.toObject();
    fs.writeFileSync("./users.json", JSON.stringify(users, null, 2));

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ success: false, message: "Wrong password" });
    }
    res.json({
      success: true,
      user: {
        role: user.role,
        id: user.id,
        name: user.name,
        email: user.email,
        height: user.height,
        weight: user.weight,
        dob: user.dob,
        allergies: user.allergies,
        address: user.address
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Login error" });
  }
});




app.get("/refill-alerts/:userId", (req, res) => {
  const userId = String(req.params.userId);

  const userOrders = orders
    .filter(o => String(o.userId) === userId)
    .sort((a, b) => new Date(b.time || b.orderDate || 0) - new Date(a.time || a.orderDate || 0));

  // Pick latest order per medicine
  const latestByMed = {};
  for (const o of userOrders) {
    const med = o.medicine;
    if (!med) continue;
    if (!latestByMed[med]) latestByMed[med] = o;
  }

  const alerts = [];
  const today = new Date();

  Object.values(latestByMed).forEach(o => {
    const qty = Number(o.quantity || 1);
    const daily = Number(o.dailyUsage || 1);
    if (!daily || daily <= 0) return;

    const daysLeft = Math.floor(qty / daily);
    const last = new Date(o.time || o.orderDate || today);
    const refillDate = new Date(last);
    refillDate.setDate(refillDate.getDate() + daysLeft);

    // Alert if refill within next 3 days
    const diffDays = Math.ceil((refillDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3) {
      alerts.push({
        medicine: o.medicine,
        dailyUsage: daily,
        quantity: qty,
        refillDate: refillDate.toISOString(),
        inDays: diffDays
      });
    }
  });

  res.json({ alerts });
});


app.get("/orders/:userId", (req, res) => {
  const userOrders = orders.filter(
    order => String(order.userId) === String(req.params.userId)
  );
  res.json(userOrders);
});


// =============================
// AI CHAT ROUTE (Groq AI)
// =============================
app.post("/ai-chat", async (req, res) => {
  console.log("✅ AI CHAT ROUTE HIT for user:", req.body.userId);
  try {
    const { message, userId, lang } = req.body;
    const user = users.find(u => String(u.id) === String(userId)) || { id: userId, language: lang };
    if (!user.language) user.language = lang; // Ensure lang is passed to Groq context

    // Load Chat History (from Cloud)
    let chatHistory = await ChatHistoryModel.find({ userId }).sort({ time: 1 }).limit(10);
    chatHistory = chatHistory.map(h => h.toObject());

    // Add User Message (Push to Cloud)
    const userMsg = new ChatHistoryModel({
      userId,
      role: "user",
      message,
      time: new Date()
    });
    await userMsg.save();
    chatHistory.push(userMsg.toObject());

    // Provide a small slice of inventory to help the AI know what's in stock
    let inventoryPreview = (inventory || [])
      .slice(0, 20)
      .map(i => `- ${i["product name"]} (Stock: ${i.Stock || 0})`)
      .join("\n");

    // ✨ AUTOMATION: Add User's FULL Order History for the AI to reference
    const userOrders = orders.filter(o => String(o.userId) === String(userId));
    if (userOrders.length > 0) {
      const historyStr = userOrders
        .map((o, i) => `${i + 1}. ${o.medicine} — Qty: ${o.quantity}, Status: ${o.status}, Date: ${new Date(o.orderDate).toLocaleDateString()}`)
        .join("\n");
      inventoryPreview += `\n\nUSER FULL ORDER HISTORY (use this when user asks about their past orders or medication history):\n${historyStr}`;
    }

    const reply = await callGroq({ user, message, inventoryPreview, chatHistory });

    // Add Bot Message (Push to Cloud)
    const botMsg = new ChatHistoryModel({
      userId,
      role: "bot",
      message: reply,
      time: new Date()
    });
    await botMsg.save();

    res.json({ reply });

  } catch (err) {
    console.error("❌ GROQ AI FAILED:", err.message);
    const apiErrorMsg = err.status === 403 ? "Your Groq Developer Account has a billing issue." : "There was an issue communicating with the AI. Please verify your API Key and Model status.";
    res.status(500).json({ reply: `AI Connection Error: ${err.message}. ${apiErrorMsg}` });
  }
});



// =============================
// GLOBAL ERROR HANDLER
// =============================
app.use((err, req, res, next) => {
  console.error("💥 UNHANDLED ERROR:", err.stack);
  res.status(500).json({
    success: false,
    message: "An internal server error occurred.",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =============================
// START SERVER
// =============================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
app.get("/agent-trace", (req, res) => {
  res.json(lastAgentDecision);
});

app.get("/api/orders", (req, res) => {
  res.json(orders);
});

app.put("/api/orders/:id", (req, res) => {
  const orderId = req.params.id;
  const newStatus = req.body.status;

  // Update the global orders array in memory
  const orderIndex = orders.findIndex(o => String(o.id) === String(orderId));

  if (orderIndex === -1) {
    return res.status(404).json({ message: "Order not found" });
  }

  const oldStatus = orders[orderIndex].status;
  orders[orderIndex].status = newStatus;

  // Update MongoDB
  OrderModel.findOneAndUpdate({ id: orderId }, { status: newStatus }).exec().catch(e => console.error("DB Status Update Error", e));
  if (oldStatus !== "Approved" && newStatus === "Approved") {
    const order = orders[orderIndex];
    const user = users.find(u => String(u.id) === String(order.userId));

    // We need the full medicine object to get price
    const medicine = inventory.find(m => m["product name"] === order.medicine);

    // If medicine is found, send email
    if (user && medicine) {
      sendOrderEmail(
        user,
        medicine,
        order.quantity,
        order.dailyUsage,
        new Date(order.orderDate),
        new Date(order.refillDate),
        order.id
      ).catch(err => console.error("Email send loop error:", err));
    }
  }

  // Save the updated state to the file
  fs.writeFileSync(orderFile, JSON.stringify(orders, null, 2));

  res.json({ message: "Order updated successfully" });
});

// ✨ PROACTIVE AUTOMATION: Daily Subscription & Refill Reminders
setInterval(async () => {
  const today = new Date();

  // Track meds already reminded today to avoid spam
  const remindedUsers = new Set();

  for (const order of orders) {
    const refillDate = new Date(order.refillDate);
    const userId = order.userId;
    const user = users.find(u => String(u.id) === String(userId));
    if (!user || !user.email) continue;

    // A) Auto-Refill for Subscriptions
    if (order.subscription && today >= refillDate) {
      const newRefillDate = new Date();
      newRefillDate.setDate(newRefillDate.getDate() + Math.ceil(order.quantity / order.dailyUsage));

      const newOrderData = {
        id: (Date.now() + Math.floor(Math.random() * 1000)).toString(),
        userId: order.userId,
        name: user.name,
        medicine: order.medicine,
        quantity: order.quantity,
        dailyUsage: order.dailyUsage,
        orderDate: today,
        refillDate: newRefillDate,
        status: "Pending",
        subscription: true
      };

      const newOrder = new OrderModel(newOrderData);
      await newOrder.save();
      orders.push(newOrder.toObject());

      // Update original order cycle in DB
      await OrderModel.findOneAndUpdate({ id: order.id }, { refillDate: newRefillDate });

      order.refillDate = newRefillDate; // Update cycle
      sendEmail(user.email, "⏰ Automated Subscription Refill", `Good news! Your monthly refill for ${order.medicine} has been placed automatically.`);
    }
    // B) Proactive Reminders for Normal Orders (3 days prior)
    else if (!order.subscription) {
      const diffDays = Math.ceil((refillDate - today) / (1000 * 60 * 60 * 24));
      const reminderKey = `${userId}-${order.medicine}-${refillDate.toDateString()}`;

      if (diffDays <= 3 && diffDays > 0 && !remindedUsers.has(reminderKey)) {
        sendEmail(user.email, "💊 Refill Reminder: Running Low", `Friendly reminder from SafetyFirst AI: Your ${order.medicine} will run out in about ${diffDays} days. Would you like to reorder?`);
        remindedUsers.add(reminderKey); // Simple memory-based de-duplication for this run
      }
    }
  }

  fs.writeFileSync(orderFile, JSON.stringify(orders, null, 2));
}, 86400000); // runs every 24 hours


async function sendOrderEmail(user, medicine, quantity, dailyUsage, today, refillDate, orderId) {
  if (!user || !user.email) return;

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background:#f4f6f9; padding:20px;">
    <div style="max-width:600px; margin:auto; background:white; padding:25px; border-radius:10px; box-shadow:0 5px 20px rgba(0,0,0,0.1);">
      <h2 style="color:#2a7de1;">SafetyFirst AI</h2>
      <hr/>
      <h3>Order Confirmation</h3>
      <p>Hi ${user.name || "User"},</p>
      <p>Thank you for your order. Here are your order details:</p>
      <table width="100%" style="margin-top:15px; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0;"><strong>Order ID:</strong></td>
          <td>${orderId}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Medicine:</strong></td>
          <td>${medicine["product name"]}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Price per unit:</strong></td>
          <td>₹${medicine["price rec"] || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Quantity:</strong></td>
          <td>${quantity}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Total Cost:</strong></td>
          <td><b>₹${((medicine["price rec"] || 0) * quantity).toFixed(2)}</b></td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Daily Usage:</strong></td>
          <td>${dailyUsage} per day</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Order Date:</strong></td>
          <td>${today.toDateString()}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Expected Refill:</strong></td>
          <td>${refillDate.toDateString()}</td>
        </tr>
      </table>
      <hr style="margin:20px 0;"/>
      <p style="font-size:14px; color:gray;">
        This is an automated receipt from SafetyFirst AI Pharmacy System.
      </p>
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"SafetyFirst AI" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `✅ Order Confirmed - ${medicine["product name"]}`,
    html: htmlContent
  });
  console.log(`✅ Order email sent to ${user.email} for ${medicine["product name"]}`);
}