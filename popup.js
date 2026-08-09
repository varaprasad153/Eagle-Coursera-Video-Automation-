console.log("Popup loaded");

document.addEventListener("DOMContentLoaded", () => {

    const enabled = document.getElementById("enabled");
    const autoPilot = document.getElementById("autoPilot");
    const autoAdvance = document.getElementById("autoAdvance");

    const speed = document.getElementById("speed");
    const speedValue = document.getElementById("speedValue");

    const skipVideo = document.getElementById("skipVideo");
    const status = document.getElementById("status");

    chrome.storage.local.get(
        [
            "enabled",
            "autoPilot",
            "autoAdvance",
            "playbackSpeed"
        ],
        (data) => {
            enabled.checked = data.enabled ?? true;
            autoPilot.checked = data.autoPilot ?? false;
            autoAdvance.checked = data.autoAdvance ?? true;

            speed.value = data.playbackSpeed ?? 16;
            speedValue.textContent = speed.value;
            updateStatus();
        }
    );

    function saveSettings() {
        const settings = {
            enabled: enabled.checked,
            autoPilot: autoPilot.checked,
            autoAdvance: autoAdvance.checked,
            playbackSpeed: Number(speed.value)
        };

        chrome.storage.local.set(settings);

        chrome.tabs.query(
            {
                active: true,
                currentWindow: true
            },
            (tabs) => {
                if (!tabs[0]?.id) {
                    return;
                }

                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: "UPDATE_SETTINGS",
                        ...settings
                    },
                    () => {
                        if (chrome.runtime.lastError) {
                            console.log(
                                "Content script not available:",
                                chrome.runtime.lastError.message
                            );
                        }
                    }
                );
            }
        );

        updateStatus();
    }

    function updateStatus() {
        if (!enabled.checked) {
            status.textContent = "Disabled";
        }
        else if (autoPilot.checked) {
            status.textContent = "Auto Pilot ON";
        }
        else {
            status.textContent = "Ready";
        }
    }

    enabled.addEventListener("change", saveSettings);
    autoPilot.addEventListener("change", saveSettings);
    autoAdvance.addEventListener("change", saveSettings);

    speed.addEventListener("input", () => {
        speedValue.textContent = speed.value;
        saveSettings();
    });

    skipVideo.addEventListener("click", () => {
        skipVideo.textContent = "⏳...";
        skipVideo.disabled = true;

        chrome.tabs.query(
            {
                active: true,
                currentWindow: true
            },
            (tabs) => {
                if (!tabs[0]?.id) {
                    status.textContent = "No active tab";
                    skipVideo.textContent = "⏭ Skip / Complete Current Item";
                    skipVideo.disabled = false;
                    return;
                }

                chrome.tabs.sendMessage(
                    tabs[0].id,
                    {
                        action: "SKIP_VIDEO"
                    },
                    (response) => {
                        skipVideo.textContent = "⏭ Skip / Complete Current Item";
                        skipVideo.disabled = false;

                        if (chrome.runtime.lastError) {
                            status.textContent = "Open/refresh Coursera first.";
                            console.log(chrome.runtime.lastError.message);
                            return;
                        }

                        status.textContent = response?.status || "Done";
                    }
                );
            }
        );
    });

    updateStatus();
});