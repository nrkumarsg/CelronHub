import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    console.log('Navigating to local server...');
    await page.goto('http://127.0.0.1:5174/');

    console.log('Typing login credentials...');
    await page.waitForSelector('input[placeholder*="email"]', { timeout: 10000 });
    await page.type('input[placeholder*="email"]', 'nrkumarsg@gmail.com');
    await page.type('input[type="password"]', 'Mother1973');
    await page.click('button[type="submit"]');

    console.log('Waiting for login to complete...');
    await page.waitForNavigation();

    console.log('Navigating to workflows...');
    await page.goto('http://127.0.0.1:5174/workflows');

    console.log('Waiting for workflows page to load and fetch documents...');
    await page.waitForSelector('.table-row td button', { timeout: 15000 });

    const results = await page.evaluate(() => {
        const buttons = document.querySelectorAll('.table-row td button');
        if (buttons.length === 0) return 'No buttons found';

        const openBtn = buttons[0]; // "Open" button on first row
        const rect = openBtn.getBoundingClientRect();

        const centerX = Math.floor(rect.x + (rect.width / 2));
        const centerY = Math.floor(rect.y + (rect.height / 2));

        const topmostEl = document.elementFromPoint(centerX, centerY);

        return {
            buttonFound: true,
            buttonHTML: openBtn.outerHTML,
            rect: JSON.parse(JSON.stringify(rect)),
            point: { x: centerX, y: centerY },
            topmostElementTag: topmostEl ? topmostEl.tagName : 'none',
            topmostElementClass: topmostEl ? topmostEl.className : 'none',
            isTopmostSelf: topmostEl === openBtn || openBtn.contains(topmostEl),
        };
    });

    console.log('Test results:', results);
    await browser.close();
    process.exit(0);
})();
