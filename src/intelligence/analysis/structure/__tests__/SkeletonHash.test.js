const SkeletonHash = require('../SkeletonHash');

describe('SkeletonHash', () => {
    const htmlA = `
        <html>
            <body>
                <div id="main" class="container">
                    <h1>Title A</h1>
                    <p>Content A</p>
                </div>
            </body>
        </html>
    `;

    const htmlB = `
        <html>
            <body>
                <div id="main" class="container">
                    <h1>Title B</h1>
                    <p>Content B</p>
                </div>
            </body>
        </html>
    `;

    const htmlC = `
        <html>
            <body>
                <div id="other" class="container">
                    <h1>Title A</h1>
                    <p>Content A</p>
                </div>
            </body>
        </html>
    `;

    const htmlWithScript = `
        <html>
            <head><script>console.log('ignore me');</script></head>
            <body>
                <div id="main" class="container">
                    <h1>Title A</h1>
                    <p>Content A</p>
                </div>
            </body>
        </html>
    `;

    const htmlClassOrder = `
        <html>
            <body>
                <div id="main" class="container wrapper"></div>
            </body>
        </html>
    `;

    const htmlClassOrderReversed = `
        <html>
            <body>
                <div id="main" class="wrapper container"></div>
            </body>
        </html>
    `;

    test('Level 2: Ignores content differences', () => {
        const resA = SkeletonHash.compute(htmlA, 2);
        const resB = SkeletonHash.compute(htmlB, 2);
        expect(resA.hash).toBe(resB.hash);
        expect(resA.signature).toBe(resB.signature);
    });

    test('Level 1: Detects ID differences', () => {
        const resA = SkeletonHash.compute(htmlA, 1);
        const resC = SkeletonHash.compute(htmlC, 1);
        expect(resA.hash).not.toBe(resC.hash);
    });

    test('Pruning: Ignores scripts', () => {
        const resA = SkeletonHash.compute(htmlA, 2);
        const resScript = SkeletonHash.compute(htmlWithScript, 2);
        expect(resA.hash).toBe(resScript.hash);
    });

    test('Normalization: Ignores class order in Level 1', () => {
        const res1 = SkeletonHash.compute(htmlClassOrder, 1);
        const res2 = SkeletonHash.compute(htmlClassOrderReversed, 1);
        expect(res1.hash).toBe(res2.hash);
    });

    test('Signature Format', () => {
        const simple = '<div><p></p></div>';
        const res = SkeletonHash.compute(simple, 2);
        // Expect: html(body(div(p))) - assuming cheerio adds html/body if missing? 
        // Cheerio usually adds html/body/head if full document, but for fragments it might not.
        // Let's check the output in the test runner if this fails.
        // For '<div><p></p></div>', cheerio might wrap it in body if loaded as full page, or not.
        // We'll see.
        expect(res.signature).toContain('div(p)');
    });
});
