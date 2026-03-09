# 🍃 MongoDB Atlas Setup & Connection Guide

Connecting MongoDB Atlas to your **SafetyFirst AI** project will allow you to store user data, orders, and chat history permanently in the cloud, even on a free tier.

---

### Step 1: Create a MongoDB Atlas Cluster
1.  **Sign Up**: Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and create a free account.
2.  **Create Project**: Create a new project named `SafetyFirstAI`.
3.  **Build a Cluster**:
    *   Choose the **FREE** (Shared) Tier.
    *   Select your preferred cloud provider (AWS/Google Cloud/Azure) and the region closest to you.
    *   Click **Create Cluster**.

### Step 2: Configure Network & Database Access
1.  **Network Access**:
    *   Go to **Network Access** in the left sidebar.
    *   Click **Add IP Address**.
    *   Select **Allow Access from Anywhere** (IP `0.0.0.0/0`) and click **Confirm**. *Note: For production, only add your server's IP.*
2.  **Database Access**:
    *   Go to **Database Access**.
    *   Click **Add New Database User**.
    *   Choose **Password** as the authentication method.
    *   Set a username (e.g., `admin`) and a strong password. **Write this down!**
    *   Set the role to `Atlas Admin` or `Read and Write to any database`.

### Step 3: Get Your Connection String
1.  Go to **Database** (Deployments).
2.  Click the **Connect** button on your cluster.
3.  Select **Drivers** (Node.js).
4.  Copy the connection string. It will look something like this:
    `mongodb+srv://admin:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

---

### Step 4: Update Your Environment Variables
Open your `.env` file in the `/backend` directory and add the connection string (replacing `<db_password>` with your actual password):

```ini
MONGO_URI=mongodb+srv://admin:YourSecurePassword@cluster0.abcde.mongodb.net/safetyfirst?retryWrites=true&w=majority
```

---

### Step 5: Implement Connection in `server.js`
Add the following code to the top of your `backend/server.js` file (after the `dotenv` line):

```javascript
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("🍃 MongoDB Atlas Connected!"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));
} else {
  console.warn("⚠️ MONGO_URI missing, the app is running in local file storage mode.");
}
```

---

### 🚀 Next Steps: Migrating to Schmeas
To fully move away from JSON files, you would define Mongoose Models. For example, for your **User** data:

```javascript
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  dob: String,
  height: String,
  weight: String,
  allergies: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
```

You would then replace lines like `users.push(newUser)` with `await User.create(newUser)`.
