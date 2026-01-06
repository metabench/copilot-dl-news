const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ICONS_DIR = path.join(__dirname, '../public/icons');

if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
}

async function generateIcons() {
    // Create a base SVG buffer
    // Simple blue circle with "A" for Analysis
    const svgBuffer = Buffer.from(`
        <svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
            <circle cx="96" cy="96" r="90" fill="#0078d7" />
            <text x="96" y="135" font-family="Arial" font-size="100" fill="white" text-anchor="middle">A</text>
        </svg>
    `);

    const sizes = [16, 32, 48, 64, 192];

    for (const size of sizes) {
        const fileName = `icon-${size}.png`;
        const filePath = path.join(ICONS_DIR, fileName);
        
        await sharp(svgBuffer)
            .resize(size, size)
            .png()
            .toFile(filePath);
            
        console.log(`Generated ${fileName}`);
    }
    
    // Also generate a specific tray icon (usually 16x16 or 32x32, sometimes monochrome)
    // For now, we'll use the colored 32x32 as the tray icon
    const trayIconPath = path.join(ICONS_DIR, 'tray-icon.png');
    await sharp(svgBuffer)
        .resize(32, 32)
        .png()
        .toFile(trayIconPath);
    console.log(`Generated tray-icon.png`);
}

generateIcons().catch(console.error);
