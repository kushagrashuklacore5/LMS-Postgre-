const puppeteer = require('puppeteer');
const translationService = require('../services/translationService');

/**
 * Server-side translator monitor.
 * - Crawls configured pages periodically
 * - Extracts visible text nodes
 * - Requests batch translations for configured target languages
 * - Emits `translation_update` events via Socket.IO with { lang, url, map }
 */
module.exports = async function startTranslatorMonitor(io) {
  // Disable monitor by default; enable with ENABLE_MONITOR=true
  if (process.env.ENABLE_MONITOR !== 'true') {
    console.log('translatorMonitor: disabled (set ENABLE_MONITOR=true to enable)');
    return;
  }

  const urls = (process.env.MONITOR_URLS || 'http://localhost:5174').split(',').map(s => s.trim()).filter(Boolean);
  const targetLangs = (process.env.MONITOR_TARGET_LANGS || 'ar').split(',').map(s => s.trim()).filter(Boolean);
  const interval = parseInt(process.env.MONITOR_INTERVAL_MS || '60000', 10);

  if (!io) {
    console.warn('translatorMonitor: Socket.IO instance not provided, monitor disabled');
    return;
  }

  // Ensure translation service availability check
  await translationService.isServiceAvailable();

  (async () => {
    let browser;
    try {
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    } catch (e) {
      console.error('translatorMonitor: Failed to launch puppeteer:', e.message || e);
      return;
    }

    console.log('translatorMonitor: started, monitoring', urls, 'for', targetLangs);

    const crawlOnce = async () => {
      for (const url of urls) {
        let page;
        try {
          page = await browser.newPage();
          await page.setViewport({ width: 1200, height: 800 });
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });

          // Extract visible text nodes and a simple selector for them
          const nodes = await page.evaluate(() => {
            const isVisible = (el) => {
              if (!el) return false;
              const style = window.getComputedStyle(el);
              if (style && (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) === 0)) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            };

            const getSelector = (el) => {
              if (!(el instanceof Element)) return null;
              const parts = [];
              while (el && el.nodeType === Node.ELEMENT_NODE && el.tagName.toLowerCase() !== 'html') {
                let part = el.tagName.toLowerCase();
                if (el.id) {
                  part += `#${el.id}`;
                  parts.unshift(part);
                  break;
                }
                const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean)[0] : null;
                if (cls) part += `.${cls}`;
                const parent = el.parentNode;
                if (parent) {
                  const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(el) + 1;
                    part += `:nth-of-type(${index})`;
                  }
                }
                parts.unshift(part);
                el = el.parentNode;
              }
              return parts.join(' > ');
            };

            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            const texts = [];
            let node;
            while (node = walker.nextNode()) {
              const text = node.textContent && node.textContent.trim();
              if (!text) continue;
              const parent = node.parentElement;
              if (!parent) continue;
              if (!isVisible(parent)) continue;
              const selector = getSelector(parent) || 'body';
              texts.push({ text, selector });
            }
            return texts;
          });

          if (!nodes || nodes.length === 0) {
            await page.close();
            continue;
          }

          // Deduplicate preserving selector for each unique text
          const unique = [];
          const seen = new Set();
          for (const n of nodes) {
            if (!seen.has(n.text)) {
              seen.add(n.text);
              unique.push(n);
            }
          }
          const texts = unique.slice(0, 500).map(n => n.text);

          for (const lang of targetLangs) {
            try {
              // Batch translate using translationService
              const translatedArr = await translationService.translateBatch(texts, lang, 'en');
              // Build selector-based diff map only where translation differs
              const diffMap = {};
              for (let i = 0; i < texts.length; i++) {
                const original = texts[i];
                const translated = (translatedArr && translatedArr[i]) ? translatedArr[i] : original;
                if (translated && translated !== original) {
                  // Use the selector of the original item (from unique)
                  const selector = unique[i] && unique[i].selector ? unique[i].selector : null;
                  if (selector) {
                    diffMap[selector] = { original, translated };
                  }
                }
              }

              // Emit only if there are diffs
              if (Object.keys(diffMap).length > 0) {
                io.emit('translation_update', { lang, url, map: diffMap, type: 'diff' });
              }
            } catch (e) {
              console.warn('translatorMonitor: translation failed for', lang, e.message || e);
            }
          }

          await page.close();
        } catch (err) {
          console.warn('translatorMonitor: error crawling', url, err.message || err);
          try { if (page) await page.close(); } catch (e) { /* ignore */ }
        }
      }
    };

    // Run initially and then on interval
    try { await crawlOnce(); } catch (e) { console.warn('translatorMonitor: initial crawl failed', e.message || e); }
    const timer = setInterval(() => { crawlOnce().catch(err => console.warn('translatorMonitor: crawl error', err)); }, interval);

    // Graceful cleanup on process exit
    const cleanup = async () => {
      clearInterval(timer);
      try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  })();
};
