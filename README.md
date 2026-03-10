# 🏥 SafetyFirst AI Pharmacy Dashboard

**SafetyFirst AI** is a state-of-the-art, intelligent pharmacy management ecosystem. It blends modern **Glassmorphic Design** with advanced **Agentic Workflows** to revolutionize how patients interact with healthcare providers. Built for safety, speed, and precision.

---

## 🚀 Vision
To provide a seamless, AI-driven bridge between patients and pharmacists, ensuring that every order is safe, every prescription is verified, and every refill is proactive.

## ✨ Key Capabilities

### 🧠 Intelligent Agentic Orchestration (5-Agent System)
( AI (Chat + Agents): Groq — Llama 3.3 70B Versatile )
The heart of our system is a continuous **Multi-Agent Orchestration** flow powered by 5 specialized LLM agents working in tandem:
*   **Conversational Agent**: Handles natural language interactions, translates multilingual inputs dynamically, and guides the user through the pharmacy experience smoothly.
*   **Safety Agent**: Scans for high-risk medications, dangerous quantities, and potential health conflicts by cross-referencing orders with the user's profile, vulnerabilities, and allergies.
*   **Predictive Agent**: Analyzes past order history and calculates daily dosages to proactively suggest recurring medicines the user may need to reorder before they run out.
*   **Inventory Agent**: Intelligently maps natural conversational language (e.g., "1 strip of paracetamol") to exact SKUs, verifies stock availability, enforces prescription requirements, and calculates pricing.
*   **Action Agent**: Formulates clear, professional final responses that summarize backend execution results (e.g., order success, stock shortages, prescription warnings) back to the user natively.

### 📸 Tesseract OCR (Prescription Scanning)
*   **Precision Scanning**: Direct integration with **Tesseract.js** for reliable, totally free Optical Character Recognition (OCR) — no Vision API costs or limits.
*   **Auto-Structuralization**: Extracts doctor details, medicine names, dosages, and quantities from handwritten or printed prescription images.
*   **Instant Sync**: Scanned text is structured via Groq LLM and saved directly to the patient's digital health record for future order verification.

### 🔔 Proactive Care & Subscriptions
*   **Automated Refills**: For chronic conditions, patients can enable "Subscribed" mode for hands-off recurring delivery.
*   **Smart Refill Alerts**: Dashboard notifications and email reminders trigger before any medication runs out, calculated from daily usage and quantity ordered.
*   **Health Score**: A dynamically calculated personal metric based on BMI, profile completeness (DOB), known allergies, and recent ailments.

### 🌐 Multilingual AI Chat
*   **Auto Language Detection**: The AI automatically detects the user's language (Hindi, Marathi, Spanish, etc.) and responds in the same language.
*   **Seamless Translation**: Pharmacy responses are translated back to the user's native language without losing medical accuracy.

### 🎙️ Voice Input
*   **Speech-to-Text**: Users can use the microphone button to dictate orders or questions directly into the chat interface.
*   **Language-Aware**: Voice input adapts to the selected language in the language dropdown.

### 📍 Nearby Store Finder
*   **Location-Based Search**: Users can discover nearby pharmacies and medical stores via the dedicated Nearby Stores page.

### 🛒 Admin Panel
*   **Order Management**: Admins can view all incoming orders, approve or reject them, and update their status.
*   **Low Stock Alerts**: Automated email alerts are sent to the admin when any product's stock falls below a threshold.
*   **Email Receipts**: Order confirmation emails with full details are sent to users upon admin approval.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Vanilla JS, HTML5, CSS3 |
| **Backend** | Node.js, Express.js |
| **AI (Chat + Agents)** | Groq — Llama 3.3 70B Versatile |
| **AI (Vision OCR)** | Tesseract.js (Local Machine Learning) |
| **Observability** | Langfuse (Agent Tracing & LLM Logging) |
| **Database** | XLSX (Inventory), JSON (Users / Orders / Chat History / Prescriptions) |
| **Auth** | bcrypt (password hashing) |
| **File Uploads** | Multer (prescription image handling) |
| **Scheduling** | Native JavaScript setInterval (automated refill checks) |
| **Communication** | Nodemailer (HTML order receipts & admin alerts) |

---

## ⚙️ Installation & Setup

### 1. Prerequisites
*   [Node.js](https://nodejs.org/) (v16+)
*   API Keys: **Groq** ([Get Key Here](https://console.groq.com/keys)) and **Langfuse**.
*   A **Gmail account** with an [App Password](https://support.google.com/accounts/answer/185833) for email sending.

### 2.Install
```bash
cd 1hack/backend
npm install
```

### 3. Environment Configuration
For your convenience, a `.env.example` file has been provided in the `/backend` folder. Rename this file to `.env` or create a new `.env` file and fill in your keys:

```ini
GROQ_API_KEY=your_groq_key
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```

> 🔑 **Note**: You can get your **Groq API Key** [here](https://console.groq.com/keys) and your **Langfuse Keys** from your [Langfuse Project Settings](https://cloud.langfuse.com/).


### 4. Run Locally
```bash
node server.js
```
The app will be live at `http://localhost:5000`.

---

## 🚢 Deployment (Live)

This project is configured for easy deployment on **Render.com** (recommended) or any platform that supports Node.js.

### 1. One-Click Deploy (Render)
1. Push this entire repository to your **GitHub**.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect the `render.yaml` file and set up the service.
5. You will need to manually add your **Environment Variables** in the Render dashboard (Settings > Env Vars):
   - `GROQ_API_KEY`
   - `LANGFUSE_PUBLIC_KEY`
   - `LANGFUSE_SECRET_KEY`
   - `EMAIL_USER`
   - `EMAIL_PASS`

### 2. Deployment Notes
*   **API URLs**: All frontend-to-backend calls have been updated to use relative paths (stripping `localhost:5000`), making the app domain-agnostic.
*   **Persistence**: Since the app uses local JSON and XLSX files, data will reset on every redeploy/restart on Render's **Free Tier**. For permanent storage, consider connecting a **MongoDB** database (drivers already included in `package.json`).
*   **Start Command**: The service is configured to run `node server.js` from the `/backend` directory.

---

### 5. Application Pages

| Page | URL | Description |
| :--- | :--- | :--- |
| **Landing** | `/index.html` | Public homepage |
| **Sign Up** | `/signup.html` | New user registration |
| **Login** | `/login.html` | User login |
| **Dashboard** | `/dashboard.html` | Patient AI chat, orders, prescriptions, refill alerts |
| **Profile** | `/profile.html` | Edit personal info, allergies, health data |
| **Orders** | `/orders.html` | View personal order history |
| **Nearby Store** | `/nearby-store.html` | Find nearby pharmacies |
| **Admin Panel** | `/admin.html` | Manage orders, view low-stock alerts (admin only) |

### 6. Accounts Configuration

> 💡 **Pre-configured Accounts**: To make testing easier, two accounts have already been set up in `users.json` with the password `password123`:
> - **Admin**: `admin@example.com`
> - **User**: `test@example.com`

If you would like to test the registration flow, you can also create new accounts:

#### 👤 User Account (for placing orders, prescription scanning, AI chat)
1. Go to `http://localhost:5000/signup.html`
2. Fill in your name, email, password, and health details
3. Log in at `http://localhost:5000/login.html`
4. You will land on the **Dashboard** where you can chat with the AI, upload prescriptions, and track orders

#### 🛡️ Admin Account (for approving orders, managing inventory alerts)
1. First, sign up for a **regular account** at `/signup.html` (as above)
2. Open the file `backend/users.json`
3. Find the entry for the email you just registered
4. Change `"role": "user"` → `"role": "admin"` and save the file
5. Log in at `http://localhost:5000/login.html` — you will be redirected to `/admin.html` automatically

---

## 🛡️ Safety & Compliance
*   **Strict Prescription Blocking**: Orders for prescription-only medicines are automatically blocked. Users are guided to upload a prescription image via the chat interface.
*   **Allergy Guard**: The AI cross-references every suggested medicine against the user's known allergies and warns clearly before any order is placed.
*   **Age-Aware Dosage**: User date-of-birth is used to flag potential dosage concerns for elderly or pediatric patients.
*   **Zero-Hardcode Policy**: All sensitive data (API keys, email credentials) is abstracted into environment variables for safe deployment.




## 📂 Folder Structure

```text
1hack/
├── backend/
│   ├── public/                # Frontend assets
│   │   ├── js/                # Client-side logic
│   │   │   ├── admin.js
│   │   │   ├── dashboard.js
│   │   │   ├── orders.js
│   │   │   └── profile.js
│   │   ├── admin.html
│   │   ├── dashboard.html
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── nearby-store.html
│   │   ├── orders.html
│   │   ├── profile.html
│   │   ├── signup.html
│   │   └── style.css
│   ├── .env                   # Environment variables (secret)
│   ├── .env.example           # Template for environment variables
│   ├── chatHistory.json       # Chat data store
│   ├── check_inventory.js     # Script to verify stock
│   ├── inventory.xlsx         # Master medicine database
│   ├── orders.json            # Orders data store
│   ├── package.json           # Backend dependencies and scripts
│   ├── prescriptions.json     # Prescription data store
│   ├── server.js              # Main Express server & AI logic
│   └── users.json             # User authentication data
├── README.md                  # Project documentation
└── .vscode/                   # Editor configuration
    └── settings.json

```

---
*Built with ❤️ by the SafetyFirst AI Team.*