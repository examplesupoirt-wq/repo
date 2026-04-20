# Termux Setup Guide for BitAim Bot Pro

Follow these steps to run this Carrom AI system on your Android device using Termux.

### 1. Install Termux
Download and install Termux from F-Droid (preferred) or the Play Store.

### 2. Update and Install Dependencies
Open Termux and run the following commands:
```bash
pkg update && pkg upgrade
pkg install nodejs git -y
```

### 3. Clone and Setup Project
Since you are currently in the AI Studio environment, you can download the project as a ZIP (from the Settings menu) and move it to Termux. 
Alternatively, if you have pushed it to GitHub:
```bash
git clone <YOUR_GITHUB_REPO_URL>
cd <REPO_NAME>
npm install
```

### 4. Run Development Server
```bash
npm run dev
```
Once it's running, you will see a local URL (e.g., `http://localhost:3000`). Open this in your mobile browser.

### 5. Build as an Android App (.apk)
To turn this into a real Android App with Overlay permissions, we recommend using **Capacitor**:

1. Install Capacitor in your project:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init
   ```
2. Build the web project:
   ```bash
   npm run build
   ```
3. Add the Android platform:
   ```bash
   npx cap add android
   npx cap copy
   npx cap open android
   ```
*(Note: `npx cap open android` requires Android Studio on a PC to compile the final APK. For Termux-only building, look into specialized tools like `buildozer` for Python-based apps, but for React, a PC is usually recommended for the final APK step.)*

---
### Live Aim Features in App:
- **Drag Striker**: You can now drag the striker directly on the board baseline to change its position.
- **Live Lines**: All prediction lines generate in real-time as you drag the striker or adjust the angle.
- **Overlay Mode**: Use the "START AIMING SERVICE" to enter a transparent mode that sits perfectly over Carrom Disc Pool.
