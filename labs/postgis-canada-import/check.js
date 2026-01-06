const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    try {
        console.log('Navigating to lab...');
        await page.goto('http://localhost:3009', { waitUntil: 'networkidle0' });

        console.log('Clicking Start button...');
        await page.click('#startBtn');

        console.log('Waiting for items to appear...');
        // Wait for at least one item
        await page.waitForSelector('.item', { timeout: 10000 });

        console.log('Items found! Waiting a bit for more progress...');
        await new Promise(r => setTimeout(r, 2000));

        const itemCount = await page.$$eval('.item', items => items.length);
        console.log(`Found ${itemCount} items in the list.`);

        const progressWidth = await page.$eval('#progressFill', el => el.style.width);
        console.log(`Progress bar width: ${progressWidth}`);

        console.log('Taking screenshot...');
        await page.screenshot({ path: path.join(__dirname, 'screenshot.png') });

        console.log('Success!');
    } catch (err) {
        console.error('Check failed:', err);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
