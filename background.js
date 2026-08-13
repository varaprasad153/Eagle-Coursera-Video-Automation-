// Coursera Auto Learner - Background Service Worker v5.3.0
console.log("⚡ Auto Learner background service worker active");

// Listen for tab URL changes / completion
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('coursera.org')) {
        chrome.storage.local.get(["enabled", "autoPilot"], (data) => {
            if (data.enabled && data.autoPilot) {
                chrome.tabs.sendMessage(tabId, { action: "GET_STATUS" }).catch(() => {});
            }
        });
    }
});
