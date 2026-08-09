// Coursera Auto Learner - Background Service Worker v4.2.1
console.log("⚡ Auto Learner background service worker started");

// Create alarm if alarms API is available
if (chrome.alarms) {
    try {
        chrome.alarms.create("keepAliveAlarm", { periodInMinutes: 0.5 });
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === "keepAliveAlarm") {
                pingCourseraTabs();
            }
        });
    } catch (e) {
        console.warn("Alarms warning:", e);
    }
}

// Listen for tab URL changes / completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('coursera.org')) {
        chrome.storage.local.get(["enabled", "autoPilot"], (data) => {
            if (data.enabled && data.autoPilot) {
                chrome.tabs.sendMessage(tabId, { action: "BACKGROUND_PING" }).catch(() => {});
            }
        });
    }
});

function pingCourseraTabs() {
    if (chrome.tabs) {
        chrome.tabs.query({ url: "https://*.coursera.org/*" }, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, { action: "BACKGROUND_PING" }).catch(() => {});
                }
            });
        });
    }
}
