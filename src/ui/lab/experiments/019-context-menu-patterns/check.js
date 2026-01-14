"use strict";

const { runBrowserScenario, closeShared } = require('../../../../shared/utils/browserHarness");

const scenario = {
	name: "Context Menu Pattern",
	scenario: function () {
		const events = [];
		const root = document.getElementById("root");
		
		// 1. Setup Target
		const target = document.createElement("div");
		target.id = "target";
		target.style.width = "100px";
		target.style.height = "100px";
		target.style.background = "red";
		root.appendChild(target);

		// 2. Setup Menu Logic (The Pattern)
		let activeMenu = null;
		let closeHandler = null;

		function closeMenu() {
			if (activeMenu) {
				events.push("menu:close");
				activeMenu.remove();
				activeMenu = null;
			}
			if (closeHandler) {
				document.removeEventListener("click", closeHandler);
				document.removeEventListener("keydown", closeHandler);
				closeHandler = null;
			}
		}

		target.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			events.push(`contextmenu:${e.target.id}`);

			// Close existing
			closeMenu();

			// Create Menu
			const menu = document.createElement("div");
			menu.id = "context-menu";
			menu.style.position = "fixed";
			menu.style.left = e.clientX + "px";
			menu.style.top = e.clientY + "px";
			menu.style.width = "50px";
			menu.style.height = "50px";
			menu.style.background = "blue";
			menu.innerText = "Menu";
			document.body.appendChild(menu);
			activeMenu = menu;
			events.push("menu:open");

			// Setup Dismissal
			// Use setTimeout to avoid immediate close from the click that might have triggered this (if it was a click)
			// But contextmenu is usually distinct.
			// However, we need to handle the case where the user clicks *inside* the menu vs outside.
			
			closeHandler = (ev) => {
				if (ev.type === "keydown" && ev.key !== "Escape") return;
				
				// If click inside menu, handle action (mock) then close
				if (ev.type === "click" && activeMenu && activeMenu.contains(ev.target)) {
					events.push("menu:action");
					closeMenu();
					return;
				}

				// If click outside or Escape
				events.push(`dismiss:${ev.type}`);
				closeMenu();
			};

			// Defer listener attachment to avoid immediate trigger if event loop is synchronous (it isn't usually for these events but good practice)
			requestAnimationFrame(() => {
				document.addEventListener("click", closeHandler);
				document.addEventListener("keydown", closeHandler);
			});
		});

		// 3. Simulate Interactions
		
		// A. Right click on target -> Open
		target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 50, clientY: 50 }));
		
		// Wait for RAF
		return new Promise(resolve => {
			requestAnimationFrame(() => {
				// B. Click outside -> Close
				document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200, clientY: 200 }));
				
				requestAnimationFrame(() => {
					// C. Right click again -> Open
					target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 60, clientY: 60 }));
					
					requestAnimationFrame(() => {
						// D. Escape -> Close
						document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
						
						requestAnimationFrame(() => {
							// E. Right click again -> Open
							target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 70, clientY: 70 }));
							
							requestAnimationFrame(() => {
								// F. Click inside -> Action -> Close
								const menu = document.getElementById("context-menu");
								if (menu) {
									menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
								} else {
									events.push("error:menu-not-found");
								}
								
								resolve(events);
							});
						});
					});
				});
			});
		});
	},
	assert(result) {
		const checks = [];
		const expected = [
			"contextmenu:target", "menu:open",      // A
			"dismiss:click", "menu:close",          // B
			"contextmenu:target", "menu:open",      // C
			"dismiss:keydown", "menu:close",        // D
			"contextmenu:target", "menu:open",      // E
			"menu:action", "menu:close"             // F
		];
		
		checks.push({
			label: "Event sequence matches",
			pass: result.join(",") === expected.join(","),
			detail: `Got: ${result.join(",")}`
		});
		
		return checks;
	}
};

async function main() {
	console.log(`Running ${scenario.name}`);
	const { result, logs, errors } = await runBrowserScenario({ name: scenario.name, scenario: scenario.scenario });
	
	if (logs.length) logs.forEach(l => console.log(` [${l.type}] ${l.text}`));
	if (errors.length) errors.forEach(e => console.log(` [error] ${e.text}`));
	
	const checks = scenario.assert(result);
	let failed = 0;
	checks.forEach(c => {
		const status = c.pass ? "✅" : "❌";
		console.log(`${status} ${c.label} ${c.detail ? `(${c.detail})` : ""}`);
		if (!c.pass) failed++;
	});
	
	await closeShared();
	if (failed) process.exitCode = 1;
}

main().catch(err => {
	console.error(err);
	process.exitCode = 1;
	closeShared();
});
