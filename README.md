# Coursera Auto Learner Extension

⚡ **Coursera Auto Learner** is a feature-rich, lightweight Google Chrome Extension (Manifest V3) designed to automate Coursera course completion.

---

## ✨ Features

- **Automated Video Fast-Forwarding**: Loads video streams, fast-forwards to the final 2 seconds, plays through to the end, and marks videos complete.
- **Auto Reading Completion**: Automatically scrolls reading assignments to the bottom and clicks *Mark as Complete*.
- **Auto Audio Playback**: Fast-forwards audio lessons and marks them finished.
- **Auto-Advance to Next Item**: Moves seamlessly from one lesson to the next.
- **Auto Module/Week Advancement**: Transitions automatically to the next Week / Module at the end of each module.
- **Auto Assignment & Discussion Skipper**: Bypasses Graded Assignments, Homework, Discussion Prompts, and Ungraded Plugins.
- **In-Video Prompt Dismissal**: Dismisses mid-video interactive questions and popups.
- **Sleek Popup UI**: Built with a clean dark theme for easy toggling of Auto-Pilot mode and playback speed.

---

## 🚀 Installation Guide

1. Clone or download this repository:
   ```bash
   git clone https://github.com/<your-username>/CourseVideoHelper.git
   ```
2. Open **Google Chrome** (or Edge/Brave/Arc).
3. Navigate to `chrome://extensions` in your browser address bar.
4. Turn on **Developer mode** in the top right corner.
5. Click **Load unpacked**.
6. Select the `CourseVideoHelper` directory.
7. Open any course page on [Coursera](https://www.coursera.org) and enable **Auto Pilot** in the extension popup!

---

## 📁 Repository Structure

```
CourseVideoHelper/
├── manifest.json     # Chrome Extension Manifest V3 configuration
├── content.js        # Core content script for page automation & DOM manipulation
├── popup.html        # Extension popup control panel
├── popup.js          # Extension popup script & settings sync
├── style.css         # Shared extension stylesheet
└── icons/            # Extension PNG icons (16px, 48px, 128px)
```

---

## 📄 License

MIT License
