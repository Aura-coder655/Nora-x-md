<div align="center">

<img src="https://files.catbox.moe/6vit0z.png" alt="NORA X MD Banner" width="100%" style="border-radius: 16px;" />

<h1>⚡ ɴᴏʀᴀ x ᴍᴅ ⚡</h1>

<p><b>A Fast, Lightweight &amp; Modular Multi-Device WhatsApp Bot</b><br/>
Built with <code>Node.js</code> · <code>Baileys</code> · <code>MongoDB</code></p>

<p>
  <a href="https://nora-pairing-site.onrender.com/">
    <img src="https://img.shields.io/badge/🔑_GET_SESSION_ID-Nora~-00e5ff?style=for-the-badge&logo=whatsapp&logoColor=black" alt="Get Session ID" />
  </a>
  <a href="https://github.com/Madhavgkmd/Nora-x-md/fork">
    <img src="https://img.shields.io/badge/🍴_FORK_REPO-Nora--x--md-ff1744?style=for-the-badge&logo=github&logoColor=white" alt="Fork Repo" />
  </a>
  <a href="https://github.com/Madhavgkmd/Nora-x-md/stargazers">
    <img src="https://img.shields.io/github/stars/Madhavgkmd/Nora-x-md?style=for-the-badge&color=FFD700&logo=github" alt="Stars" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Baileys-Multi--Device-00d4ff?style=flat-square&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/Database-MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white" />
  <img src="https://img.shields.io/badge/Engine-Streaming-FF6F00?style=flat-square&logo=lightning&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Author-K%20I%20R%20Δ-111111?style=flat-square" />
</p>

<p>
  <a href="#-why-nora-x-md">Why Nora X MD</a> •
  <a href="#-session-id-setup">Session Setup</a> •
  <a href="#-command-modules">Commands</a> •
  <a href="#-installation--setup">Installation</a> •
  <a href="#-deployment">Deployment</a> •
  <a href="#-troubleshooting">Support</a>
</p>

</div>

---

## 📖 Table of Contents

1. [✨ Why Nora X MD?](#-why-nora-x-md)
2. [🔐 Step 1 — Session ID Setup](#-session-id-setup)
3. [🛠️ Command Modules](#-command-modules)
4. [🚀 Installation & Setup](#-installation--setup)
5. [🌍 Deployment Platforms](#-deployment)
6. [⚙️ Environment Variables](#-environment-variables)
7. [🧪 Troubleshooting](#-troubleshooting)
8. [🤝 Support & Community](#-support--community)
9. [👤 Credits & License](#-credits--license)

---

<a id="-why-nora-x-md"></a>
## ✨ Why Nora X MD?

**NORA X MD** is engineered for **speed**, **low RAM consumption**, and **zero-hassle deployment**. Whether you run it on a **Pterodactyl panel**, **VPS**, **Render**, or a **Windows PC**, its dynamic plugin engine and automatic MongoDB session loader keep your bot online **24/7**.

<div align="center">

| 🚀 Feature | 💡 What It Means For You |
| :--- | :--- |
| 🔌 **Plug-and-Play Plugins** | Drop any `.js` file into `plugins/` — it loads automatically. No config edits. |
| 🔑 **Instant `Nora~` Pairing** | Pair via phone number in seconds with automatic MongoDB session sync. |
| 🧠 **RAM-Friendly Streaming** | Large media files stream cleanly — no crashes on low-memory containers. |
| 🎯 **Interactive Reply Menus** | Reply directly with `1` or `2` for YouTube Video / Audio — no prefixes needed. |
| 🔒 **Persistent Sessions** | MongoDB-backed auth state survives restarts and redeploys. |
| 🎨 **Modular Architecture** | Each command is isolated — add, remove, or update without breaking others. |

</div>

---

<a id="-session-id-setup"></a>
## 🔐 Step 1 — Session ID Setup

> **Don't have a Session ID yet?** Follow this visual guide to link your WhatsApp account in under 60 seconds.

<div align="center">

### 🖼️ Session Pairing Walkthrough

<table>
<tr>
<td align="center" width="25%">
  <img src="https://img.shields.io/badge/STEP_1-00E5FF?style=for-the-badge&logoColor=black" /><br/><br/>
  <b>Open Pairing Portal</b><br/>
  <sub>Visit the official NORA X MD pairing site</sub><br/><br/>
  <a href="https://nora-pairing-site.onrender.com/">
    <img src="https://img.shields.io/badge/🌐_nora--pairing--site.onrender.com-0A0A0A?style=for-the-badge&logoColor=white" />
  </a>
</td>
<td align="center" width="25%">
  <img src="https://img.shields.io/badge/STEP_2-00C853?style=for-the-badge&logoColor=black" /><br/><br/>
  <b>Enter Your Number</b><br/>
  <sub>Include country code<br/>(e.g. <code>919876543210</code>)</sub>
</td>
<td align="center" width="25%">
  <img src="https://img.shields.io/badge/STEP_3-FF6D00?style=for-the-badge&logoColor=white" /><br/><br/>
  <b>Link Device</b><br/>
  <sub>WhatsApp → Linked Devices<br/>→ Link with phone number</sub>
</td>
<td align="center" width="25%">
  <img src="https://img.shields.io/badge/STEP_4-AA00FF?style=for-the-badge&logoColor=white" /><br/><br/>
  <b>Copy Session ID</b><br/>
  <sub>You'll receive<br/><code>Nora~xxxxxxxx</code></sub>
</td>
</tr>
</table>

### 🎬 Preview

<img src="https://files.catbox.moe/6vit0z.png" alt="Session Pairing Preview" width="70%" style="border-radius: 12px; border: 2px solid #00e5ff;" />

<p><em>📸 Replace the image above with your own pairing-screen screenshot for a real product feel.</em></p>

</div>

### 📋 Detailed Steps

| # | Action | Details |
| :-: | :--- | :--- |
| **1** | Open Pairing Portal | 👉 [nora-pairing-site.onrender.com](https://nora-pairing-site.onrender.com/) |
| **2** | Enter Phone Number | Full international format — **no** `+` or spaces (e.g. `919876543210`) |
| **3** | Generate Code | Copy the 8-digit pairing code shown on screen |
| **4** | Link in WhatsApp | **Linked Devices** → **Link with phone number** → paste code |
| **5** | Save Session ID | Copy the `Nora~xxxxxxxx` ID sent to your WhatsApp chat |
| **6** | Deploy | Paste the Session ID into your env as `SESSION_ID` |

> [!IMPORTANT]
> Your Session ID is **equivalent to your WhatsApp password**. Never share it publicly, commit it to GitHub, or paste it in screenshots.

---

<a id="-command-modules"></a>
## 🛠️ Command Modules

<div align="center"><img src="https://img.shields.io/badge/📥_DOWNLOADERS-00E5FF?style=for-the-badge" /></div>

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `.yt <url>` | `ytv`, `ytdl`, `ytmp4` | Fetch YouTube info · reply `1` for Video, `2` for MP3 |
| `.play <song/url>` | `song`, `music`, `sp`, `yta` | Search & download from Spotify or YouTube |
| `.ig <url>` | `insta`, `reel`, `igdl` | Instagram Reels, Videos & Carousels in HD |
| `.fb <url>` | `facebook`, `fbdl` | Public Facebook videos in HD |
| `.pinterest <url>` | `pin`, `pindl` | Pinterest images & videos |

<div align="center"><img src="https://img.shields.io/badge/🧰_SMART_TOOLS-FF6D00?style=for-the-badge" /></div>

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `.sticker` | `s`, `st`, `stiker` | Image/video → borderless sticker (original ratio) |
| `.vv` | `viewonce`, `rvo`, `reveal` | Reveal View-Once photos, videos & voice notes |
| `.url` | `tourl`, `upload` | Upload media → permanent direct URL (Catbox / Uguu) |
| `.qr <text/reply>` | `qrcode`, `qrscan` | Generate QR from text, or decode a replied QR image |
| `.ss <url>` | `fullss`, `screenshot` | Full-page website screenshot |
| `.tinyurl <url>` | `tiny`, `short` | Shorten long URLs instantly |
| `.translate <lang> <text>` | `tr`, `trt` | Translate text/replies (20+ languages · `.tr list`) |
| `.getpp <number/@tag>` | `pp`, `dp` | Fetch full-resolution WhatsApp profile picture |

<div align="center"><img src="https://img.shields.io/badge/🎨_AI_%26_UTILITIES-AA00FF?style=for-the-badge" /></div>

| Command | Aliases | Description |
| :--- | :--- | :--- |
| `.removebg` | `rbg`, `rembg`, `nobg` | Remove image background (reply or URL) |
| `.upscale` | `hd`, `remini`, `enhance` | 2× HD image enhancement |
| `.weather <city> [days]` | `wtr`, `forecast` | Live weather + 7-day forecast |

---

<a id="-installation--setup"></a>
## 🚀 Installation & Setup

### ✅ Prerequisites

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `v20+` | LTS recommended |
| **FFmpeg** | latest | Required for stickers & media conversion |
| **MongoDB** | — | Atlas (free tier) or self-hosted |
| **Git** | latest | For cloning |

### 📦 1. Clone the Repository

```bash
git clone https://github.com/Madhavgkmd/Nora-x-md.git
cd Nora-x-md