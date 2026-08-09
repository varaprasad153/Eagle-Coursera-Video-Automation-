// Coursera Auto Learner - Content Script v5.0.0 (Rock Solid Locked Pipeline)
console.log("⚡ Coursera Auto Learner v5.0.0 active");

// Overrides Page Visibility API so Coursera player believes window is ALWAYS visible
try {
    Object.defineProperty(document, 'hidden', { get: function () { return false; }, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: function () { return 'visible'; }, configurable: true });
    window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
    document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
    window.addEventListener('blur', (e) => e.stopImmediatePropagation(), true);
} catch (e) {}

let settings = {
    enabled: true,
    autoPilot: false,
    autoAdvance: true,
    playbackSpeed: 16
};

let isProcessing = false;
let currentUrl = location.href;

// Load settings from storage
chrome.storage.local.get(
    ["enabled", "autoPilot", "autoAdvance", "playbackSpeed"],
    (data) => {
        settings.enabled = data.enabled ?? true;
        settings.autoPilot = data.autoPilot ?? false;
        settings.autoAdvance = data.autoAdvance ?? true;
        settings.playbackSpeed = data.playbackSpeed ?? 16;
        console.log("Settings loaded:", settings);
        startMonitoring();
    }
);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "UPDATE_SETTINGS") {
        settings = { ...settings, ...request };
        console.log("Settings updated:", settings);

        if (settings.enabled && settings.autoPilot && !isProcessing) {
            processCurrentItem();
        }
        sendResponse({ status: "Settings updated" });
        return true;
    }

    if (request.action === "SKIP_VIDEO") {
        const result = completeCurrentItemManual();
        sendResponse(result);
        return true;
    }

    if (request.action === "GET_STATUS") {
        sendResponse({
            enabled: settings.enabled,
            autoPilot: settings.autoPilot
        });
        return true;
    }
});

// Monitor URL changes (Coursera Single Page App)
function startMonitoring() {
    setInterval(() => {
        // Detect page URL navigation
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            isProcessing = false; // Unlock processing ONLY when page URL changes
            console.log("Navigation detected to:", currentUrl);

            if (settings.enabled && settings.autoPilot) {
                setTimeout(processCurrentItem, 1500);
            }
        } else {
            // Trigger processing if enabled and not currently processing
            if (settings.enabled && settings.autoPilot && !isProcessing) {
                processCurrentItem();
            }
        }

        if (settings.enabled) {
            handleInVideoPrompts();
        }
    }, 1000);
}

// Helper: Ensure element is NOT inside the left sidebar navigation drawer
function isInsideSidebar(el) {
    if (!el) return false;
    return !!el.closest("nav, aside, .rc-ModuleNav, .rc-TreeNav, [data-testid='course-navigation'], [aria-label*='navigation'], .rc-NavigationDrawer, [role='navigation']");
}

// Main execution function
function processCurrentItem() {
    if (!settings.enabled || !settings.autoPilot || isProcessing) {
        return;
    }

    isProcessing = true; // Lock processing until URL navigation completes
    console.log("Processing page:", location.href);

    let attempts = 0;
    const maxAttempts = 10; // Poll for up to 5 seconds for React components to mount

    const mountChecker = setInterval(() => {
        attempts++;

        // 1. VIDEO ITEM: If <video> element exists, process video!
        const video = document.querySelector("video");
        if (video) {
            clearInterval(mountChecker);
            console.log("Video detected! Starting video completion...");
            completeVideoItem(video);
            return;
        }

        // 2. READING ITEM: If reading container exists, process reading!
        const reading = findReadingElement();
        if (reading) {
            clearInterval(mountChecker);
            console.log("Reading detected! Starting reading completion...");
            completeReadingItem(reading);
            return;
        }

        // 3. AUDIO ITEM: If <audio> element exists, process audio!
        const audio = document.querySelector("audio");
        if (audio) {
            clearInterval(mountChecker);
            console.log("Audio detected! Starting audio completion...");
            completeAudioItem(audio);
            return;
        }

        // 4. DISCUSSION / PLUGIN ITEM: If explicit discussion/plugin page, skip!
        if (isExplicitSkipPage()) {
            clearInterval(mountChecker);
            console.log("Discussion/Plugin page detected. Skipping...");
            skipAssessmentOrDiscussion();
            return;
        }

        // 5. TIMEOUT FALLBACK (5s): If no video/reading mounted after 5s
        if (attempts >= maxAttempts) {
            clearInterval(mountChecker);
            console.log("No media mounted after 5s timeout. Attempting navigation...");

            const markBtn = findMarkCompleteButton();
            if (markBtn) {
                markBtn.click();
                setTimeout(() => {
                    if (settings.autoAdvance) clickNextButton();
                }, 1500);
                return;
            }

            clickNextButton();
        }
    }, 500);
}

// 1. VIDEO COMPLETION PIPELINE
function completeVideoItem(video) {
    let loadAttempts = 0;
    const checkReady = setInterval(() => {
        loadAttempts++;

        if (video.duration > 0 && !isNaN(video.duration) && video.readyState >= 2) {
            clearInterval(checkReady);

            console.log(`Video ready (${video.duration}s). Seeking to last 2 seconds...`);

            video.muted = true;
            try {
                video.playbackRate = Math.min(Number(settings.playbackSpeed) || 16, 16);
            } catch (e) {}

            // Fast-forward playhead to 2 seconds before end
            video.currentTime = Math.max(0, video.duration - 2);
            video.play().catch(e => {});

            let finished = false;
            const onEnded = () => {
                if (finished) return;
                finished = true;
                console.log("Video finished playing to end.");

                const markBtn = findMarkCompleteButton();
                if (markBtn) markBtn.click();

                setTimeout(() => {
                    if (settings.autoAdvance) {
                        console.log("Advancing to next item...");
                        clickNextButton();
                    }
                }, 1200);
            };

            video.addEventListener("ended", onEnded, { once: true });

            // Fallback safety timer if ended event does not fire
            setTimeout(() => {
                if (!finished) onEnded();
            }, 3500);

        } else if (loadAttempts >= 20) {
            clearInterval(checkReady);
            console.log("Video load timeout. Retrying...");
            isProcessing = false;
        }
    }, 500);
}

// 2. READING COMPLETION PIPELINE
function findReadingElement() {
    const selectors = [".rc-Reading", ".reading-body", ".reading-content", "[data-testid*='reading']", ".cml-article"];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.length > 30 && !isInsideSidebar(el)) return el;
    }
    return null;
}

function completeReadingItem(reading) {
    console.log("Reading item detected. Scroll & Mark Complete...");

    try {
        if (reading.scrollHeight > reading.clientHeight) {
            reading.scrollTop = reading.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
    } catch (e) {}

    setTimeout(() => {
        const markBtn = findMarkCompleteButton();
        if (markBtn) markBtn.click();

        document.querySelectorAll(".rc-ReadingCompletion button, [data-testid*='mark-complete']")
            .forEach(btn => { if (!btn.disabled && !isInsideSidebar(btn)) btn.click(); });

        setTimeout(() => {
            if (settings.autoAdvance) {
                clickNextButton();
            }
        }, 1200);
    }, 1000);
}

// 3. AUDIO COMPLETION PIPELINE
function completeAudioItem(audio) {
    let loadAttempts = 0;
    const checkReady = setInterval(() => {
        loadAttempts++;

        if (audio.duration > 0 && !isNaN(audio.duration) && audio.readyState >= 2) {
            clearInterval(checkReady);

            audio.muted = true;
            audio.currentTime = Math.max(0, audio.duration - 2);
            audio.play().catch(e => {});

            let finished = false;
            const onEnded = () => {
                if (finished) return;
                finished = true;
                console.log("Audio finished.");

                const markBtn = findMarkCompleteButton();
                if (markBtn) markBtn.click();

                setTimeout(() => {
                    if (settings.autoAdvance) clickNextButton();
                }, 1200);
            };

            audio.addEventListener("ended", onEnded, { once: true });
            setTimeout(onEnded, 3500);

        } else if (loadAttempts >= 15) {
            clearInterval(checkReady);
            isProcessing = false;
        }
    }, 500);
}

// MANUAL SKIP BUTTON HANDLER
function completeCurrentItemManual() {
    const video = document.querySelector("video");
    if (video) {
        completeVideoItem(video);
        return { success: true, status: "Video completing & advancing..." };
    }

    const reading = findReadingElement();
    if (reading) {
        completeReadingItem(reading);
        return { success: true, status: "Reading marked complete & advancing..." };
    }

    const audio = document.querySelector("audio");
    if (audio) {
        completeAudioItem(audio);
        return { success: true, status: "Audio completing & advancing..." };
    }

    if (isExplicitSkipPage()) {
        skipAssessmentOrDiscussion();
        return { success: true, status: "Skipped assignment/discussion" };
    }

    const markBtn = findMarkCompleteButton();
    if (markBtn) {
        markBtn.click();
        setTimeout(() => { if (settings.autoAdvance) clickNextButton(); }, 1000);
        return { success: true, status: "Marked complete" };
    }

    if (clickNextButton()) {
        return { success: true, status: "Moving to Next Item / Module..." };
    }

    return { success: false, status: "No content found on page" };
}

// HELPERS & BUTTON FINDERS
function findMarkCompleteButton() {
    const selectors = [
        "button[aria-label*='Mark as complete']",
        "button[aria-label*='Mark complete']",
        "button[data-testid*='mark-complete']",
        ".rc-ReadingCompletion button",
        ".rc-VideoCompletion button"
    ];
    for (const s of selectors) {
        const elements = document.querySelectorAll(s);
        for (const el of elements) {
            if (el && !el.disabled && !isInsideSidebar(el)) return el;
        }
    }

    const btns = document.querySelectorAll("button, a, div[role='button']");
    for (const btn of btns) {
        if (isInsideSidebar(btn)) continue;
        const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase().trim();
        if (text.includes("mark as complete") || text.includes("mark complete")) {
            if (!btn.disabled) return btn;
        }
    }
    return null;
}

function findNextButton() {
    const selectors = [
        "[data-testid='next-item-button']",
        "button[aria-label*='Go to next item']",
        "a[aria-label*='Go to next item']",
        "button[aria-label*='Next item']",
        "a[aria-label*='Next item']",
        "button[aria-label*='next item']",
        "a[aria-label*='next item']",
        "button[data-testid*='next']",
        "a[data-testid*='next']",
        ".rc-ItemNav button",
        "button[aria-label='Next']",
        "a[aria-label='Next']",
        "a.next-item-btn"
    ];
    for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
            if (el && !el.disabled && !isInsideSidebar(el)) return el;
        }
    }

    const btns = document.querySelectorAll("button, a, div[role='button']");
    const keywords = [
        "go to next item", "next item", "next lesson", "go to next",
        "next", "continue", "skip", "go to next module"
    ];

    for (const btn of btns) {
        if (isInsideSidebar(btn)) continue;
        const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase().trim();
        for (const kw of keywords) {
            if (text.includes(kw)) {
                if (!btn.disabled) return btn;
            }
        }
    }
    return null;
}

function findNextModuleButton() {
    const selectors = [
        "[data-testid='next-module-button']",
        "[data-testid='next-week-button']",
        ".rc-NextModuleButton",
        ".rc-NextWeekButton"
    ];
    for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
            if (el && !el.disabled && !isInsideSidebar(el)) return el;
        }
    }

    const elements = document.querySelectorAll("button, a, div[role='button']");
    const keywords = [
        "next module", "next week", "go to next module", "go to next week",
        "continue to next module", "continue to next week", "start next week",
        "start next module"
    ];

    for (const el of elements) {
        if (isInsideSidebar(el)) continue;
        const text = (el.innerText || el.getAttribute("aria-label") || "").toLowerCase().trim();
        for (const kw of keywords) {
            if (text.includes(kw)) {
                if (!el.disabled) return el;
            }
        }
    }
    return null;
}

function clickNextItemFromSidebar() {
    const sidebar = document.querySelector("nav, aside, .rc-ModuleNav, .rc-TreeNav, [data-testid='course-navigation'], [aria-label*='navigation']");
    if (!sidebar) return false;

    const allLinks = Array.from(sidebar.querySelectorAll("a[href*='/item/'], a[href*='/lecture/'], a[href*='/discussion/'], a[href*='/assignment/'], a[href*='/quiz/'], a.rc-Option"));
    if (allLinks.length === 0) return false;

    let activeIdx = -1;
    for (let i = 0; i < allLinks.length; i++) {
        const link = allLinks[i];
        if (link.getAttribute("aria-current") === "page" || link.classList.contains("active") || link.classList.contains("rc-Option--active") || link.href === location.href) {
            activeIdx = i;
            break;
        }
    }

    if (activeIdx !== -1 && activeIdx + 1 < allLinks.length) {
        const nextLink = allLinks[activeIdx + 1];
        console.log("Advancing via sidebar next item link:", nextLink.innerText || nextLink.href);
        nextLink.click();
        return true;
    }

    return false;
}

function clickNextButton() {
    let btn = findNextButton();
    if (!btn) btn = findNextModuleButton();

    if (btn && !btn.disabled) {
        console.log("Clicked Next button:", btn.innerText || btn.getAttribute("aria-label"));
        btn.click();
        return true;
    }

    console.log("Main Next button not found. Trying sidebar next item link...");
    if (clickNextItemFromSidebar()) {
        return true;
    }

    console.log("No next button or sidebar link found.");
    return false;
}

function isExplicitSkipPage() {
    const path = location.pathname.toLowerCase();
    const skipPaths = [
        "/discussionprompt/", "/discussions/", "/discussion/",
        "/forum/", "/peer-review/", "/ungradedplugin/", "/plugin/"
    ];
    for (const p of skipPaths) {
        if (path.includes(p)) return true;
    }

    const mainContent = document.querySelector(".rc-ItemContent, #rendered-content, .rc-ItemPage, main") || document.body;
    const selectors = [
        ".rc-DiscussionPrompt",
        ".rc-Assignment",
        ".rc-Assessment",
        "[data-testid*='discussion']"
    ];
    for (const s of selectors) {
        const el = mainContent.querySelector(s);
        if (el && !isInsideSidebar(el)) return true;
    }

    return false;
}

function skipAssessmentOrDiscussion() {
    const markBtn = findMarkCompleteButton();
    if (markBtn) {
        try { markBtn.click(); } catch(e) {}
    }

    setTimeout(() => {
        if (clickNextButton()) return;

        const btns = document.querySelectorAll("button, a, div[role='button']");
        for (const b of btns) {
            if (isInsideSidebar(b)) continue;
            const txt = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase();
            if (txt.includes("go to next") || txt.includes("next item") || txt.includes("skip") || txt.includes("continue")) {
                if (!b.disabled) {
                    b.click();
                    break;
                }
            }
        }
    }, 600);
}

function handleInVideoPrompts() {
    const promptSelectors = [".rc-VideoQuizModal", "[data-testid='in-video-quiz-modal']", ".rc-InVideoQuiz"];
    for (const sel of promptSelectors) {
        if (document.querySelector(sel)) {
            const btn = document.querySelector(`${sel} button`);
            if (btn && !btn.disabled && !isInsideSidebar(btn)) {
                btn.click();
                console.log("Dismissed in-video prompt");
            }
        }
    }
}