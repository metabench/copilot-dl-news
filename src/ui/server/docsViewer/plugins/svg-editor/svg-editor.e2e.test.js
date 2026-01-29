/**
 * E2E Test: SVG Editor Save Persistence
 * 
 * This test verifies that:
 * 1. Dragging an SVG element triggers the save flow
 * 2. The server confirms the save with a hash
 * 3. After page reload, the element is at the new position
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://144.21.35.104:4700';
const TEST_DOC = 'design/repo-division-plan-v6.svg';

test.describe('SVG Editor Save Persistence', () => {

    test('should persist element position after drag and reload', async ({ page }) => {
        // 1. Navigate to the SVG document
        await page.goto(`${BASE_URL}/?doc=${TEST_DOC}`);
        await page.waitForSelector('svg');

        // 2. Get the first group element with a transform
        const firstGroup = page.locator('svg g').first();
        await expect(firstGroup).toBeVisible();

        // 3. Record the initial transform
        const initialTransform = await firstGroup.evaluate((el) => {
            if (el.transform && el.transform.baseVal.numberOfItems > 0) {
                const t = el.transform.baseVal.getItem(0);
                return { x: t.matrix.e, y: t.matrix.f };
            }
            return { x: 0, y: 0 };
        });
        console.log('Initial transform:', initialTransform);

        // 4. Click to select the element
        const box = await firstGroup.boundingBox();
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        await page.mouse.click(centerX, centerY);

        // 5. Wait for selection visual (outline)
        await page.waitForTimeout(200);

        // 6. Drag the element by 50px in each direction
        const dragDelta = 50;
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX + dragDelta, centerY + dragDelta, { steps: 10 });
        await page.mouse.up();

        // 7. Wait for the success tick (indicates server confirmed save)
        // The tick is a div with ✅ that appears and fades
        const tickLocator = page.locator('div:has-text("✅")');
        await expect(tickLocator).toBeVisible({ timeout: 5000 });
        console.log('Success tick appeared - save confirmed by server');

        // 8. Wait for tick animation to complete
        await page.waitForTimeout(1000);

        // 9. Record the new transform BEFORE reload
        const transformAfterDrag = await firstGroup.evaluate((el) => {
            if (el.transform && el.transform.baseVal.numberOfItems > 0) {
                const t = el.transform.baseVal.getItem(0);
                return { x: t.matrix.e, y: t.matrix.f };
            }
            return { x: 0, y: 0 };
        });
        console.log('Transform after drag (before reload):', transformAfterDrag);

        // Verify the DOM was updated
        expect(transformAfterDrag.x).toBeCloseTo(initialTransform.x + dragDelta, 1);
        expect(transformAfterDrag.y).toBeCloseTo(initialTransform.y + dragDelta, 1);

        // 10. Reload the page
        await page.reload();
        await page.waitForSelector('svg');

        // 11. Get the transform AFTER reload
        const firstGroupAfterReload = page.locator('svg g').first();
        const transformAfterReload = await firstGroupAfterReload.evaluate((el) => {
            if (el.transform && el.transform.baseVal.numberOfItems > 0) {
                const t = el.transform.baseVal.getItem(0);
                return { x: t.matrix.e, y: t.matrix.f };
            }
            return { x: 0, y: 0 };
        });
        console.log('Transform after reload:', transformAfterReload);

        // 12. CRITICAL ASSERTION: Position should be the NEW position
        expect(transformAfterReload.x).toBeCloseTo(transformAfterDrag.x, 1);
        expect(transformAfterReload.y).toBeCloseTo(transformAfterDrag.y, 1);

        console.log('✅ Test passed: Element position persisted after reload');
    });

    test('should show correct hash in console logs', async ({ page }) => {
        const consoleLogs = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        await page.goto(`${BASE_URL}/?doc=${TEST_DOC}`);
        await page.waitForSelector('svg');

        // Select and drag
        const firstGroup = page.locator('svg g').first();
        const box = await firstGroup.boundingBox();
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        await page.mouse.click(centerX, centerY);
        await page.waitForTimeout(200);

        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX + 30, centerY + 30, { steps: 10 });
        await page.mouse.up();

        // Wait for save to complete
        await page.waitForTimeout(2000);

        // Check console for hash logs
        const hashLogs = consoleLogs.filter(log => log.includes('[SVG-Save]'));
        console.log('Hash-related console logs:', hashLogs);

        // Should have a client hash log
        const clientHashLog = hashLogs.find(log => log.includes('Client Hash'));
        expect(clientHashLog).toBeTruthy();

        // Should have a verification log (Verified or Skipped)
        const verificationLog = hashLogs.find(log =>
            log.includes('Verified') || log.includes('Skipped')
        );
        expect(verificationLog).toBeTruthy();
    });
});
