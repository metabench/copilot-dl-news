
async function init() {
    const container = document.getElementById('svg-container');

    // Load SVG
    const res = await fetch('/api/svg');
    const svgText = await res.text();
    container.innerHTML = svgText;

    const svg = container.querySelector('svg');
    let selectedElement = null;
    let offset = { x: 0, y: 0 };
    let isDragging = false;

    // Helper to get SVG coordinates
    function getMousePosition(evt) {
        const CTM = svg.getScreenCTM();
        if (evt.touches) { evt = evt.touches[0]; }
        return {
            x: (evt.clientX - CTM.e) / CTM.a,
            y: (evt.clientY - CTM.f) / CTM.d
        };
    }

    svg.addEventListener('mousedown', startDrag);
    svg.addEventListener('mousemove', drag);
    svg.addEventListener('mouseup', endDrag);
    svg.addEventListener('mouseleave', endDrag);

    // Touch support for tablet
    svg.addEventListener('touchstart', startDrag);
    svg.addEventListener('touchmove', drag);
    svg.addEventListener('touchend', endDrag);

    function startDrag(evt) {
        const target = evt.target.closest('.draggable');
        if (target) {
            isDragging = true;
            selectedElement = target;

            const transforms = selectedElement.transform.baseVal;
            let translate = null;

            if (transforms.length === 0 || transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
                translate = svg.createSVGTransform();
                translate.setTranslate(0, 0);
                selectedElement.transform.baseVal.insertItemBefore(translate, 0);
            } else {
                translate = transforms.getItem(0);
            }

            const coord = getMousePosition(evt);
            offset.x = coord.x - translate.matrix.e;
            offset.y = coord.y - translate.matrix.f;

            // Visual feedback
            document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            selectedElement.classList.add('selected');
        }
    }

    function drag(evt) {
        if (isDragging && selectedElement) {
            evt.preventDefault();
            const coord = getMousePosition(evt);
            const transform = selectedElement.transform.baseVal.getItem(0);
            transform.setTranslate(coord.x - offset.x, coord.y - offset.y);
        }
    }

    async function endDrag(evt) {
        if (isDragging && selectedElement) {
            isDragging = false;
            const transform = selectedElement.transform.baseVal.getItem(0);
            const x = transform.matrix.e;
            const y = transform.matrix.f;
            const id = selectedElement.id;

            console.log(`Moved ${id} to ${x}, ${y}`);

            // Save changes
            await saveTransform(id, x, y);

            selectedElement = null;
        }
    }

    async function saveTransform(id, x, y) {
        // In a real app complexity, we might parse the SVG string.
        // Here we just serialize the whole DOM for simplicity in the lab.
        const content = container.innerHTML;
        const logEntry = `User moved element #${id} to (${Math.round(x)}, ${Math.round(y)})`;

        await fetch('/api/svg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, logEntry })
        });
    }
}

init();
