'use strict';

const fs = require('fs');
const path = require('path');
const { extractCSS, aggregateCSS, discoverFiles } = require('../tools/build/css-extractor');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'assets');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'controls.css');

async function build() {
  console.log('🎨 Building CSS bundle...');
  
  // 1. Discover source files
  // We look for both .js files (to extract inline CSS) and .css files (extracted or manual)
  const jsFiles = discoverFiles(ROOT_DIR, {
    patterns: [
      'src/ui/controls/**/*.js',
      'src/ui/server/**/*.js'
    ]
  });
  
  const cssFiles = discoverFiles(ROOT_DIR, {
    patterns: [
      'src/ui/controls/**/*.css',
      'src/ui/server/**/*.css'
    ]
  });
  
  console.log(`   Found ${jsFiles.length} JS files and ${cssFiles.length} CSS files`);
  
  const extractions = [];
  
  // 2. Extract CSS from JS files
  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const results = extractCSS(content, file);
    extractions.push(...results);
  }
  
  // 3. Add CSS from .css files
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const className = path.basename(file, '.css');
    
    extractions.push({
      file: file,
      pattern: 'css-file',
      className: className,
      css: content.trim(),
      cssLines: content.split('\n').length,
      start: 0,
      end: content.length
    });
  }
  
  console.log(`   Collected ${extractions.length} CSS blocks`);
  
  // 4. Aggregate into single CSS
  const combinedCSS = aggregateCSS(extractions);
  
  // 5. Write output
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, combinedCSS);
  
  console.log(`   Output: ${OUTPUT_FILE} (${combinedCSS.length} bytes)`);
  console.log('✅ CSS build complete');
}

build().catch(err => {
  console.error('❌ CSS build failed:', err);
  process.exit(1);
});
