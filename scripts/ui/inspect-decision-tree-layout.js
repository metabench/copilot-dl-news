"use strict";

const puppeteer = require("puppeteer");
const path = require("path");
const { app } = require("../../src/ui/server/decisionTreeViewer/server");

const PORT = 3031; // Use a different port to avoid conflicts

async function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      resolve(server);
    });
  });
}

async function inspectLayout() {
  console.log("Starting server...");
  const server = await startServer();
  console.log(`Server running on port ${PORT}`);

  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    await page.setViewport({ width: 1600, height: 1200 });
    console.log("Navigating to viewer...");
    await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle0" });
    
    // Wait for client-side rendering/layout if needed
    console.log("Waiting for nodes...");
    await page.waitForSelector(".dt-node", { timeout: 5000 }).catch(() => {
      console.warn("Timeout waiting for .dt-node selector");
    });

    // Extract layout metrics
    console.log("Extracting metrics...");
    const metrics = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll(".dt-node"));
      const connections = Array.from(document.querySelectorAll(".dt-connection"));
      
      return {
        nodes: nodes.map(node => {
          const rect = node.getBoundingClientRect();
          const text = node.innerText;
          const content = node.querySelector(".dt-node__content");
          const contentRect = content ? content.getBoundingClientRect() : null;
          
          // Check for text overflow
          // For branch nodes, content is rotated, so we check the inner label
          const label = node.querySelector(".dt-node__label");
          let isOverflowing = false;
          
          if (label) {
             isOverflowing = label.scrollWidth > label.clientWidth || label.scrollHeight > label.clientHeight;
          } else if (content) {
             isOverflowing = content.scrollWidth > content.clientWidth || content.scrollHeight > content.clientHeight;
          }

          return {
            id: node.dataset.nodeId,
            type: node.dataset.nodeType,
            text: text.replace(/\s+/g, " ").trim(),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            contentRect: contentRect ? { x: contentRect.x, y: contentRect.y, width: contentRect.width, height: contentRect.height } : null,
            isOverflowing,
            styles: {
                fontSize: window.getComputedStyle(node).fontSize,
                padding: window.getComputedStyle(node).padding
            }
          };
        }),
        connections: connections.map(conn => {
          const bbox = conn.getBBox();
          return {
            bbox: { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
          };
        })
      };
    });

    console.log(JSON.stringify(metrics, null, 2));

  } catch (err) {
    console.error("Error during inspection:", err);
  } finally {
    await browser.close();
    server.close();
  }
}

if (require.main === module) {
  inspectLayout().catch(console.error);
}
