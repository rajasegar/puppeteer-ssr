const puppeteer = require('puppeteer');

// In-memory cache of rendered pages. Note: this will be cleared whenever the 
// server process stops. If you need true persistence, use something like
// Google Cloud Storage
const RENDER_CACHE = new Map();


async function ssr(url) {
  if(RENDER_CACHE.has(url)) {
    return { html: RENDER_CACHE.get(url), ttRenderMs: 0 };
  }

  const start = Date.now();

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // 1. Intercept network requests
  await page.setRequestInterception(true);

  page.on('request', req => {
    // 2. Ignore requests for resources that don't produce DOM
    // (images, stylesheets, media)
    const allowList = ['document','script','xhr','fetch'];
    if(!allowList.includes(req.resourceType())) {
      return req.abort();
    }

    // 3. Pass through all other requests.
    req.continue();
  });

  try {
    // networkidle0 waits for the network to be idle (no requests for 500ms).
    // The page's JS has likely produced markup by this point, but wait longer
    // if your site lazy loads, etc.
    await page.goto(url, { waitUntil: 'networkidle0'});
    await page.waitForSelector('#posts'); // ensure #posts exists in the DOM.
  } catch(err) {
    console.error(err);
    throw new Error('page.goto/watiForSelector timed out.');
  }

  const html = await page.content(); // serialized HTML of page DOM.
  await browser.close();

  const ttRenderMs = Date.now() - start;
  console.log(`Headless rendered page in : ${ttRenderMs}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.
  return { html, ttRenderMs };
}

module.exports = ssr;
