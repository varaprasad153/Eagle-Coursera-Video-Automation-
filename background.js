// Coursera Auto Learner - Background Service Worker v4.2.0
console.log("⚡ Auto Learner background service worker started");

// Keep service worker alive and ping Coursera tabs periodically
chrome.alarms.create("keepAliveAlarm", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAliveAlarm") {
        pingCourseraTabs();
    }
});

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
    chrome.tabs.query({ url: "https://*.coursera.org/*" }, (tabs) => {
        tabs.forEach((tab) => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { action: "BACKGROUND_PING" }).catch(() => {});
            }
        });
    });
}
