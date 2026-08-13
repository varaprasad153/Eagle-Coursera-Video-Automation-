// Coursera Auto Learner - Content Script v5.3.0 (Zero False-Skip & Bulletproof Pipeline)
console.log("⚡ Coursera Auto Learner v5.3.0 active (Zero False-Skip)");

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
let processingWatchdog = null;

function setProcessingLock(val) {
    isProcessing = val;
    if (processingWatchdog) {
        clearTimeout(processingWatchdog);
        processingWatchdog = null;
    }
    if (val) {
        // Auto-release lock after 20s as safety watchdog
        processingWatchdog = setTimeout(() => {
            console.warn("Processing lock watchdog expired (20s). Releasing lock.");
            isProcessing = false;
        }, 20000);
    }
}

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
        setProcessingLock(false);
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
            setProcessingLock(false); // Unlock processing immediately when page URL changes
            console.log("Navigation detected to:", currentUrl);

            if (settings.enabled && settings.autoPilot) {
                setTimeout(processCurrentItem, 300); // Fast 300ms startup delay
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
    }, 500);
}

// Helper: Ensure element is NOT inside the left sidebar navigation drawer
function isInsideSidebar(el) {
    if (!el) return false;
    return !!el.closest("nav, aside, .rc-ModuleNav, .rc-TreeNav, [data-testid='course-navigation'], [aria-label*='navigation'], .rc-NavigationDrawer, [role='navigation']");
}

// Helper: Find valid visible video element (including shadow DOM / iframe check)
function findVideoElement() {
    const videos = Array.from(document.querySelectorAll("video"));
    for (const v of videos) {
        if (v && !isInsideSidebar(v)) {
            return v;
        }
    }

    const iframes = Array.from(document.querySelectorAll("iframe"));
    for (const frame of iframes) {
        try {
            const frameDoc = frame.contentDocument || frame.contentWindow?.document;
            if (frameDoc) {
                const frameVideo = frameDoc.querySelector("video");
                if (frameVideo) return frameVideo;
            }
        } catch (e) {}
    }

    return null;
}

// Main execution function
function processCurrentItem() {
    if (!settings.enabled || !settings.autoPilot || isProcessing) {
        return;
    }

    setProcessingLock(true);
    console.log("Processing page:", location.href);

    const path = location.pathname.toLowerCase();
    const isVideoCandidateUrl = path.includes("/lecture/") || path.includes("/item/") || path.includes("/video/") || path.includes("/supplement/");

    // ONLY trigger instant skip on explicit assignment/discussion URL paths (e.g. /discussionprompt/ or /quiz/)
    // NEVER trigger instant skip on video/lecture/item candidate URLs!
    if (!isVideoCandidateUrl && isExplicitSkipUrl()) {
        console.log("Instant skip triggered for explicit assignment/discussion URL...");
        skipAssessmentOrDiscussion();
        return;
    }

    let attempts = 0;
    const maxAttempts = 30; // Poll up to 9s (30 * 300ms) for video/reading elements to mount in React

    const mountChecker = setInterval(() => {
        attempts++;

        // 1. VIDEO ITEM: If <video> element exists anywhere on page, process video!
        const video = findVideoElement();
        if (video) {
            clearInterval(mountChecker);
            console.log("Video detected! Starting bulletproof video completion...");
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
        if (audio && !isInsideSidebar(audio)) {
            clearInterval(mountChecker);
            console.log("Audio detected! Starting audio completion...");
            completeAudioItem(audio);
            return;
        }

        // 4. Non-media skip page check after waiting 1.8s (6 attempts)
        if (attempts >= 6 && !isVideoCandidateUrl && isExplicitSkipPageDOM()) {
            clearInterval(mountChecker);
            console.log("Non-media skip page confirmed. Skipping...");
            skipAssessmentOrDiscussion();
            return;
        }

        // 5. TIMEOUT FALLBACK (9s): If no video/reading mounted after 30 attempts
        if (attempts >= maxAttempts) {
            clearInterval(mountChecker);

            if (isExplicitSkipUrl() || isExplicitSkipPageDOM()) {
                console.log("Skip page confirmed after timeout. Skipping...");
                skipAssessmentOrDiscussion();
                return;
            }

            console.log("No media mounted after timeout. Attempting navigation...");
            const markBtn = findMarkCompleteButton();
            if (markBtn) markBtn.click();
            setTimeout(() => {
                if (settings.autoAdvance) clickNextButton();
            }, 300);
        }
    }, 300);
}

// 1. BULLETPROOF VIDEO COMPLETION PIPELINE
function completeVideoItem(video) {
    let loadAttempts = 0;
    const checkReady = setInterval(() => {
        loadAttempts++;

        const isReady = (video.duration > 0 && !isNaN(video.duration)) || video.readyState >= 1;

        if (isReady && video.duration > 0) {
            clearInterval(checkReady);

            console.log(`Video metadata ready (duration: ${video.duration.toFixed(1)}s). Starting progressive telemetry completion...`);

            video.muted = true;
            try {
                video.playbackRate = Math.min(Number(settings.playbackSpeed) || 16, 16);
            } catch (e) {}

            if (video.paused) {
                video.play().catch(() => {});
            }

            // High-Speed Progressive Scrubbing: 20 steps at 20ms interval = ~400ms total scrub time
            const steps = 20;
            const stepDuration = video.duration / steps;
            let currentStep = 0;

            const scrubInterval = setInterval(() => {
                currentStep++;
                const targetTime = Math.min(video.duration - 0.2, currentStep * stepDuration);

                try {
                    video.currentTime = targetTime;
                    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
                    video.dispatchEvent(new Event("seeking", { bubbles: true }));
                    video.dispatchEvent(new Event("seeked", { bubbles: true }));
                } catch (e) {}

                handleInVideoPrompts();

                if (currentStep >= steps || targetTime >= video.duration - 0.5) {
                    clearInterval(scrubInterval);

                    try {
                        video.currentTime = Math.max(0, video.duration - 0.2);
                        video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
                        video.dispatchEvent(new Event("ended", { bubbles: true }));
                        video.dispatchEvent(new Event("pause", { bubbles: true }));
                    } catch (e) {}

                    // Click Mark Complete if present
                    const markBtn = findMarkCompleteButton();
                    if (markBtn) {
                        markBtn.click();
                    }

                    // 400ms buffer for Coursera watch event XHR to resolve
                    setTimeout(() => {
                        console.log("Video completion done. Advancing to next item...");
                        if (settings.autoAdvance) {
                            clickNextButton();
                        } else {
                            setProcessingLock(false);
                        }
                    }, 400);
                }
            }, 20);

        } else if (loadAttempts >= 30) {
            clearInterval(checkReady);
            console.log("Video metadata load timeout. Retrying...");
            setProcessingLock(false);
        }
    }, 250);
}

// 2. READING COMPLETION PIPELINE
function findReadingElement() {
    const selectors = [".rc-Reading", ".reading-body", ".reading-content", "[data-testid*='reading']", ".cml-article", ".rc-ReadingItem"];
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.length > 30 && !isInsideSidebar(el)) return el;
    }
    return null;
}

function completeReadingItem(reading) {
    console.log("Reading item detected. Fast Scroll & Mark Complete...");

    try {
        if (reading.scrollHeight > reading.clientHeight) {
            reading.scrollTop = reading.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
    } catch (e) {}

    const markBtn = findMarkCompleteButton();
    if (markBtn) markBtn.click();

    document.querySelectorAll(".rc-ReadingCompletion button, [data-testid*='mark-complete']")
        .forEach(btn => { if (!btn.disabled && !isInsideSidebar(btn)) btn.click(); });

    setTimeout(() => {
        if (settings.autoAdvance) {
            clickNextButton();
        } else {
            setProcessingLock(false);
        }
    }, 400);
}

// 3. AUDIO COMPLETION PIPELINE
function completeAudioItem(audio) {
    let loadAttempts = 0;
    const checkReady = setInterval(() => {
        loadAttempts++;

        if (audio.duration > 0 && !isNaN(audio.duration) && audio.readyState >= 1) {
            clearInterval(checkReady);

            audio.muted = true;
            audio.currentTime = Math.max(0, audio.duration - 1);
            try {
                audio.dispatchEvent(new Event("timeupdate", { bubbles: true }));
                audio.dispatchEvent(new Event("ended", { bubbles: true }));
            } catch (e) {}

            const markBtn = findMarkCompleteButton();
            if (markBtn) markBtn.click();

            setTimeout(() => {
                if (settings.autoAdvance) {
                    clickNextButton();
                } else {
                    setProcessingLock(false);
                }
            }, 400);

        } else if (loadAttempts >= 15) {
            clearInterval(checkReady);
            setProcessingLock(false);
        }
    }, 250);
}

// MANUAL SKIP BUTTON HANDLER
function completeCurrentItemManual() {
    const video = findVideoElement();
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
    if (audio && !isInsideSidebar(audio)) {
        completeAudioItem(audio);
        return { success: true, status: "Audio completing & advancing..." };
    }

    if (isExplicitSkipUrl() || isExplicitSkipPageDOM()) {
        skipAssessmentOrDiscussion();
        return { success: true, status: "Skipped assignment/discussion" };
    }

    const markBtn = findMarkCompleteButton();
    if (markBtn) {
        markBtn.click();
        setTimeout(() => { if (settings.autoAdvance) clickNextButton(); }, 300);
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
        "button[data-testid*='mark-as-complete']",
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
        "button[aria-label*='Next']",
        "a[aria-label*='Next']",
        "button[data-testid*='next']",
        "a[data-testid*='next']",
        ".rc-ItemNav button",
        "a.next-item-btn",
        "[data-track-component='next_item_button']"
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

function clickNextButton(retryCount = 0) {
    let btn = findNextButton();
    if (!btn) btn = findNextModuleButton();

    if (btn && !btn.disabled) {
        console.log("Clicked Next button:", btn.innerText || btn.getAttribute("aria-label"));
        btn.click();
        return true;
    }

    if (clickNextItemFromSidebar()) {
        return true;
    }

    // Retry up to 4 times (250ms intervals) in case Next button is rendering asynchronously
    if (retryCount < 4) {
        setTimeout(() => clickNextButton(retryCount + 1), 250);
        return true;
    }

    console.log("No next button or sidebar link found after retries.");
    setProcessingLock(false);
    return false;
}

function isExplicitSkipUrl() {
    const path = location.pathname.toLowerCase();
    const skipPaths = [
        "/discussionprompt/", "/discussions/", "/discussion/",
        "/forum/", "/peer-review/", "/ungradedplugin/", "/plugin/",
        "/assignment/", "/quiz/", "/exam/", "/gradedlti/", "/graded/"
    ];
    for (const p of skipPaths) {
        if (path.includes(p)) return true;
    }
    return false;
}

function isExplicitSkipPageDOM() {
    const mainContent = document.querySelector("#rendered-content, main, .rc-ItemPage, body");
    if (!mainContent) return false;

    // If a video element is present anywhere on the page, it is NOT a skip page
    if (document.querySelector("video")) return false;
    if (findReadingElement()) return false;

    const selectors = [
        ".rc-DiscussionPrompt",
        ".rc-Assignment",
        ".rc-Assessment",
        ".rc-PeerReview",
        ".rc-Quiz"
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

    if (clickNextButton()) return;

    setTimeout(() => {
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
        setProcessingLock(false);
    }, 200);
}

function handleInVideoPrompts() {
    const promptSelectors = [
        ".rc-VideoQuizModal",
        "[data-testid='in-video-quiz-modal']",
        ".rc-InVideoQuiz",
        ".rc-QuizPrompt",
        ".rc-VideoPrompt"
    ];
    for (const sel of promptSelectors) {
        const container = document.querySelector(sel);
        if (container) {
            const btns = container.querySelectorAll("button");
            for (const btn of btns) {
                if (btn && !btn.disabled && !isInsideSidebar(btn)) {
                    const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase();
                    if (text.includes("submit") || text.includes("continue") || text.includes("skip") || text.includes("resume") || text.includes("dismiss") || text.includes("next")) {
                        btn.click();
                        console.log("Dismissed in-video prompt:", text);
                        return;
                    }
                }
            }
            const firstBtn = container.querySelector("button");
            if (firstBtn && !firstBtn.disabled && !isInsideSidebar(firstBtn)) {
                firstBtn.click();
                console.log("Dismissed in-video prompt (fallback button click)");
            }
        }
    }
}