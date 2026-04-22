const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const MAX_CONCURRENT_PAGES = Number(process.env.MAX_CONCURRENT_PAGES || 1);

let browserInstance = null;
let browserLaunching = null;
let activePages = 0;
const waitQueue = [];

function getLaunchOptions() {
  return {
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-blink-features=AutomationControlled",
    ],
    protocolTimeout: 60000,
  };
}

function logPageState(event) {
  console.log(
    `[BROWSER_POOL] ${event} | activePages=${activePages} queue=${waitQueue.length} max=${MAX_CONCURRENT_PAGES}`
  );
}

async function launchBrowser() {
  try {
    const browser = await puppeteer.launch(getLaunchOptions());

    browser.on("disconnected", () => {
      console.warn("[BROWSER] Browser disconnected");
      browserInstance = null;
      browserLaunching = null;
      activePages = 0;
      waitQueue.length = 0;
    });

    console.log("[BROWSER] New browser launched successfully");
    return browser;
  } catch (error) {
    console.error("[BROWSER] Launch failed:", error.message);
    throw error;
  }
}

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (browserLaunching) {
    return browserLaunching;
  }

  browserLaunching = launchBrowser();

  try {
    browserInstance = await browserLaunching;
    return browserInstance;
  } catch (error) {
    browserInstance = null;
    throw error;
  } finally {
    browserLaunching = null;
  }
}

function acquirePageSlot() {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages += 1;
    logPageState("SLOT_ACQUIRED");
    return Promise.resolve();
  }

  logPageState("SLOT_WAIT");
  return new Promise((resolve) => {
    waitQueue.push(resolve);
  }).then(() => {
    activePages += 1;
    logPageState("SLOT_ACQUIRED_FROM_QUEUE");
  });
}

function releasePageSlot() {
  if (activePages > 0) {
    activePages -= 1;
  }

  if (waitQueue.length > 0 && activePages < MAX_CONCURRENT_PAGES) {
    const nextResolve = waitQueue.shift();
    if (nextResolve) nextResolve();
  }

  logPageState("SLOT_RELEASED");
}

async function createManagedPage() {
  await acquirePageSlot();

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);

    const originalClose = page.close.bind(page);
    let closed = false;

    page.close = async (...args) => {
      if (closed) return;
      closed = true;

      try {
        await originalClose(...args);
      } finally {
        releasePageSlot();
      }
    };

    page.on("close", () => {
      if (!closed) {
        closed = true;
        releasePageSlot();
      }
    });

    return page;
  } catch (error) {
    releasePageSlot();
    throw error;
  }
}

async function resetBrowser() {
  try {
    if (browserInstance) {
      await browserInstance.close();
    }
  } catch (error) {
    console.error("[BROWSER] Error while resetting browser:", error.message);
  } finally {
    browserInstance = null;
    browserLaunching = null;
    activePages = 0;
    waitQueue.length = 0;
  }
}

async function closeBrowser() {
  if (!browserInstance) return;

  try {
    await browserInstance.close();
    console.log("[BROWSER] Browser closed");
  } catch (error) {
    console.error("[BROWSER] Error while closing browser:", error.message);
  } finally {
    browserInstance = null;
    browserLaunching = null;
    activePages = 0;
    waitQueue.length = 0;
  }
}

async function checkBrowserHealth() {
  let page;
  try {
    page = await createManagedPage();
    await page.goto("about:blank", {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    return true;
  } catch (error) {
    console.error("[BROWSER] Health check failed:", error.message);
    return false;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (error) {
        console.error("[BROWSER] Health check page close failed:", error.message);
      }
    }
  }
}

function getBrowserPoolStats() {
  return {
    maxConcurrentPages: MAX_CONCURRENT_PAGES,
    activePages,
    queuedRequests: waitQueue.length,
    browserConnected: Boolean(browserInstance && browserInstance.connected),
  };
}

module.exports = {
  getBrowser,
  createManagedPage,
  closeBrowser,
  checkBrowserHealth,
  getBrowserPoolStats,
  resetBrowser,
};