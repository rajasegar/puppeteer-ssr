const puppeteer = require('puppeteer');
const fs = require('fs');

// In-memory cache of rendered pages. Note: this will be cleared whenever the 
// server process stops. If you need true persistence, use something like
// Google Cloud Storage
const RENDER_CACHE = new Map();


/**
 * @param {string} url URL to prerender.
 * @param {string} browserWSEndpoint Optional remove debugging URL. If
 *  provided, Puppeteer's reconnects to the browser instance. Otherwise,
 *  a new browser instance is launched.
 */
async function ssr(url, browserWSEndpoint) {

  const stylesheetContents = {};

  if(RENDER_CACHE.has(url)) {
    return { html: RENDER_CACHE.get(url), ttRenderMs: 0 };
  }

  const start = Date.now();

  console.info('Connecting to existing Chrome instance.');
  const browser = await puppeteer.connect({browserWSEndpoint});
  const page = await browser.newPage();

  // Stash the responses of local stylesheets.
  page.on('response', async resp => {
    const responseUrl = resp.url();
    const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
    const isStylesheet = resp.request().resourceType() === 'stylesheet';
    if(sameOrigin && isStylesheet) {
      stylesheetContents[responseUrl] = await resp.text();
    }
  });

  // 1. Intercept network requests
  await page.setRequestInterception(true);

  page.on('request', req => {
    // 2. Ignore requests for resources that don't produce DOM
    // (images, stylesheets, media)
    const allowList = ['document','script','xhr','fetch'];
    if(!allowList.includes(req.resourceType())) {
      return req.abort();
    }

    // If request is for styles.css, respond with the minified version.
    if(req.url().endsWith('styles.css')) {
      return req.respond({
        status: 200,
        contentType: 'text/css',
        body: fs.readFileSync('./public/styles.min.css', 'utf-8')
      });
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

  // Inline the CSS
  // Replace stylesheets in the page with their equivalent <style>
  await page.$$eval('link[rel="stylesheet"]', (links, content) => {
    links.forEach(link => {
      const cssText = content[link.href];
      if(cssText) {
        const style = document.createElement('style');
        style.textContent = cssText;
        link.replaceWith(style);
      }
    });
  }, stylesheetContents);

  const html = await page.content(); // serialized HTML of page DOM.
  await browser.close();

  const ttRenderMs = Date.now() - start;
  console.log(`Headless rendered page in : ${ttRenderMs}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.
  return { html, ttRenderMs };
}

module.exports = ssr;
