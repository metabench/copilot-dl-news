"use strict";

const net = require("net");
const puppeteer = require("puppeteer");

const jsguiServer = require("jsgui3-server");
const { Server: JsguiServer } = jsguiServer;
const jsgui = require("./client");

const Ctrl = jsgui.controls.advanced_mvvm_page;

async function getFreePort() {
	return await new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			const address = srv.address();
			srv.close(() => resolve(address.port));
		});
	});
}

async function fetchText(url) {
	if (typeof fetch === "function") {
		const res = await fetch(url);
		const text = await res.text();
		return { status: res.status, text };
	}

	const http = require("http");
	return await new Promise((resolve, reject) => {
		http
			.get(url, res => {
				let buf = "";
				res.setEncoding("utf8");
				res.on("data", d => (buf += d));
				res.on("end", () => resolve({ status: res.statusCode, text: buf }));
			})
			.on("error", reject);
	});
}

function assert(label, condition, detail) {
	const status = condition ? "✅" : "❌";
	console.log(`${status} ${label}${detail ? ` — ${detail}` : ""}`);
	if (!condition) process.exitCode = 1;
}

async function main() {
	const server = new JsguiServer({
		Ctrl,
		debug: true,
		disk_path_client_js: require.resolve("./client.js")
	});

	server.allowed_addresses = ["127.0.0.1"];
	await new Promise(resolve => server.on("ready", resolve));

	const port = await getFreePort();
	await new Promise((resolve, reject) => {
		server.start(port, err => (err ? reject(err) : resolve()));
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const pageUrl = `${baseUrl}/`;

	let browser;
	try {
		const { status, text: html } = await fetchText(pageUrl);
		assert("SSR returns 200", status === 200, `status=${status}`);
		assert(
			"SSR includes advanced_mvvm_page",
			/data-jsgui-type=["']advanced_mvvm_page["']/.test(html)
		);
		assert(
			"SSR includes advanced_mvvm_demo",
			/data-jsgui-type=["']advanced_mvvm_demo["']/.test(html)
		);
		assert("SSR includes encoded Data_Object string", /Data_Object\(/.test(html));

		const jsBundle = await fetchText(`${baseUrl}/js/js.js`);
		assert("/js/js.js returns 200", jsBundle.status === 200, `status=${jsBundle.status}`);
		const cssBundle = await fetchText(`${baseUrl}/css/css.css`);
		assert("/css/css.css returns 200", cssBundle.status === 200, `status=${cssBundle.status}`);

		browser = await puppeteer.launch({ headless: "new" });
		const page = await browser.newPage();
		page.setDefaultTimeout(8000);

		const logs = [];
		page.on("console", msg => logs.push({ type: msg.type(), text: msg.text() }));
		page.on("pageerror", err => logs.push({ type: "pageerror", text: err.stack || err.message || String(err) }));

		await page.goto(pageUrl, { waitUntil: "load" });
		await page.waitForSelector(".adv-mvvm");

		const activated = await page
			.waitForFunction(() => {
				const el = document.querySelector(".adv-mvvm");
				return el && el.getAttribute("data-activated") === "1";
			})
			.then(() => true)
			.catch(() => false);
		assert("Client activation sets data-activated=1", activated);

		// Initial state from SSR hydration.
		const dataName0 = await page.$eval(".adv-mvvm__dataName", el => el.textContent);
		const draftName0 = await page.$eval(".adv-mvvm__draftName", el => el.textContent);
		const count0 = await page.$eval(".adv-mvvm__count", el => el.textContent);
		assert("Initial dataName is Ada Lovelace", /Ada Lovelace/.test(dataName0), dataName0);
		assert("Initial draftName is Ada Lovelace", /Ada Lovelace/.test(draftName0), draftName0);
		assert("Initial count is 2", /count=2/.test(count0), count0);

		// Staged edits: typing changes draftName but not dataName until Apply.
		await page.focus(".adv-mvvm__first");
		await page.click(".adv-mvvm__first", { clickCount: 3 });
		await page.type(".adv-mvvm__first", "Grace");
		await page.waitForFunction(() => {
			const t = document.querySelector(".adv-mvvm__draftName")?.textContent || "";
			return t.includes("Grace");
		});

		const dataName1 = await page.$eval(".adv-mvvm__dataName", el => el.textContent);
		const draftName1 = await page.$eval(".adv-mvvm__draftName", el => el.textContent);
		assert("Draft name updates immediately", /Grace/.test(draftName1), draftName1);
		assert("Data name unchanged before Apply", /Ada/.test(dataName1), dataName1);

		// Apply should commit draft to data model.
		await page.click(".adv-mvvm__apply");
		await page.waitForFunction(() => {
			const t = document.querySelector(".adv-mvvm__dataName")?.textContent || "";
			return t.includes("Grace");
		});

		const dataName2 = await page.$eval(".adv-mvvm__dataName", el => el.textContent);
		assert("Data name updates after Apply", /Grace/.test(dataName2), dataName2);

		// Two-way safe binding: editing countText updates data count.
		await page.focus(".adv-mvvm__countText");
		await page.click(".adv-mvvm__countText", { clickCount: 3 });
		await page.type(".adv-mvvm__countText", "5");
		await page.waitForFunction(() => {
			const t = document.querySelector(".adv-mvvm__count")?.textContent || "";
			return t.includes("count=5");
		});

		const count1 = await page.$eval(".adv-mvvm__count", el => el.textContent);
		assert("Editing countText updates data count", /count=5/.test(count1), count1);

		// Increment button updates data count and keeps countText in sync.
		await page.click(".adv-mvvm__inc");
		await page.waitForFunction(() => {
			const t = document.querySelector(".adv-mvvm__count")?.textContent || "";
			return t.includes("count=6");
		});

		const count2 = await page.$eval(".adv-mvvm__count", el => el.textContent);
		assert("Increment updates count", /count=6/.test(count2), count2);

		const countTextElValue = await page.$eval(".adv-mvvm__countText", el => el.value);
		assert("countText stays in sync", countTextElValue === "6", `value=${countTextElValue}`);

		if (logs.length) {
			const interesting = logs.filter(l => l.type !== "debug");
			if (interesting.length) {
				console.log("\nBrowser logs:");
				interesting.forEach(l => console.log(` [${l.type}] ${l.text}`));
			}
		}
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise(resolve => server.close(resolve));
	}
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
});
