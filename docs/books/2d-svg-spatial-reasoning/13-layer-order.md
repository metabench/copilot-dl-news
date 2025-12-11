# Chapter 13: Layer Order and Z-Index

*Understanding what appears on top of what in SVG.*

---

## 13.1 The Painter's Algorithm

SVG uses the **painter's algorithm**: elements are drawn in document order, with later elements painted on top of earlier ones.

```xml
<!-- This rect is behind -->
<rect x="0" y="0" width="100" height="100" fill="blue"/>

<!-- This rect is in front -->
<rect x="50" y="50" width="100" height="100" fill="red"/>
```

```
┌─────────────┐
│  BLUE       │
│    ┌────────┼───────┐
│    │ OVERLAP│       │
└────┼────────┘  RED  │
     │                │
     └────────────────┘
     
Red appears on top because it comes later in the document.
```

---

## 13.2 No CSS z-index in SVG

**Critical**: CSS `z-index` does **NOT** work in SVG.

```css
/* This does NOTHING in SVG */
.my-element {
    z-index: 999;
}
```

The only way to change layer order is to change document order.

---

## 13.3 Controlling Layer Order

### Method 1: Document Order at Creation

Plan your layers when building the SVG:

```javascript
function buildLayeredDiagram(data) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    // Layer 1: Background (drawn first, appears behind)
    const bgLayer = createGroup('background-layer');
    svg.appendChild(bgLayer);
    
    // Layer 2: Connections (behind nodes)
    const edgeLayer = createGroup('edge-layer');
    svg.appendChild(edgeLayer);
    
    // Layer 3: Nodes (on top of edges)
    const nodeLayer = createGroup('node-layer');
    svg.appendChild(nodeLayer);
    
    // Layer 4: Labels (on top of everything)
    const labelLayer = createGroup('label-layer');
    svg.appendChild(labelLayer);
    
    // Populate layers
    data.edges.forEach(e => edgeLayer.appendChild(createEdge(e)));
    data.nodes.forEach(n => nodeLayer.appendChild(createNode(n)));
    data.labels.forEach(l => labelLayer.appendChild(createLabel(l)));
    
    return svg;
}

function createGroup(id) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    return g;
}
```

### Method 2: Moving Elements at Runtime

To bring an element to front:

```javascript
function bringToFront(element) {
    const parent = element.parentNode;
    parent.appendChild(element);  // Re-appending moves it to the end
}

function sendToBack(element) {
    const parent = element.parentNode;
    parent.insertBefore(element, parent.firstChild);
}

function moveUp(element) {
    const next = element.nextElementSibling;
    if (next) {
        element.parentNode.insertBefore(next, element);
    }
}

function moveDown(element) {
    const prev = element.previousElementSibling;
    if (prev) {
        element.parentNode.insertBefore(element, prev);
    }
}
```

---

## 13.4 Layer Strategy: The Five-Layer Model

A robust layering system for complex diagrams:

```
┌──────────────────────────────────────┐
│ Layer 5: UI (tooltips, highlights)   │  ← FRONT
├──────────────────────────────────────┤
│ Layer 4: Labels and annotations      │
├──────────────────────────────────────┤
│ Layer 3: Primary content (nodes)     │
├──────────────────────────────────────┤
│ Layer 2: Connections (edges, lines)  │
├──────────────────────────────────────┤
│ Layer 1: Background (grid, bg color) │  ← BACK
└──────────────────────────────────────┘
```

```javascript
const LAYERS = {
    BACKGROUND: 0,
    CONNECTIONS: 1,
    CONTENT: 2,
    LABELS: 3,
    UI: 4
};

class LayeredSVG {
    constructor() {
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.layers = [];
        
        // Create layers in order
        for (let i = 0; i <= 4; i++) {
            const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            layer.setAttribute('data-layer', i);
            this.layers.push(layer);
            this.svg.appendChild(layer);
        }
    }
    
    add(element, layer) {
        this.layers[layer].appendChild(element);
    }
    
    addNode(element) {
        this.add(element, LAYERS.CONTENT);
    }
    
    addEdge(element) {
        this.add(element, LAYERS.CONNECTIONS);
    }
    
    addLabel(element) {
        this.add(element, LAYERS.LABELS);
    }
    
    addTooltip(element) {
        this.add(element, LAYERS.UI);
    }
}
```

---

## 13.5 Highlight on Hover

Common pattern: bring element to front when hovered:

```javascript
function setupHoverHighlight(element) {
    let originalNext = null;  // Remember original position
    
    element.addEventListener('mouseenter', () => {
        originalNext = element.nextElementSibling;
        bringToFront(element);
        element.classList.add('highlighted');
    });
    
    element.addEventListener('mouseleave', () => {
        element.classList.remove('highlighted');
        // Restore original position
        if (originalNext) {
            element.parentNode.insertBefore(element, originalNext);
        }
        // If it was last, no need to move (it's already at end)
    });
}
```

---

## 13.6 Selection Layer Pattern

Selected elements often need to appear on top:

```javascript
class SelectionManager {
    constructor(svg) {
        this.svg = svg;
        this.selectionLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.selectionLayer.setAttribute('id', 'selection-layer');
        this.svg.appendChild(this.selectionLayer);
        this.originalParents = new Map();
    }
    
    select(element) {
        // Remember where it came from
        this.originalParents.set(element, {
            parent: element.parentNode,
            next: element.nextElementSibling
        });
        
        // Move to selection layer
        this.selectionLayer.appendChild(element);
        element.classList.add('selected');
    }
    
    deselect(element) {
        const origin = this.originalParents.get(element);
        if (!origin) return;
        
        // Move back
        if (origin.next) {
            origin.parent.insertBefore(element, origin.next);
        } else {
            origin.parent.appendChild(element);
        }
        
        element.classList.remove('selected');
        this.originalParents.delete(element);
    }
    
    clearSelection() {
        for (const element of this.originalParents.keys()) {
            this.deselect(element);
        }
    }
}
```

---

## 13.7 Edges Behind Nodes Pattern

A critical pattern for graph/tree visualization:

```javascript
function ensureEdgesBehindNodes(svg) {
    const nodes = svg.querySelectorAll('.node');
    const edges = svg.querySelectorAll('.edge');
    
    // Create separate groups if they don't exist
    let edgeGroup = svg.querySelector('#edge-layer');
    let nodeGroup = svg.querySelector('#node-layer');
    
    if (!edgeGroup) {
        edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        edgeGroup.id = 'edge-layer';
        // Insert at beginning (behind everything)
        svg.insertBefore(edgeGroup, svg.firstChild);
    }
    
    if (!nodeGroup) {
        nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.id = 'node-layer';
        // Insert after edge layer
        svg.insertBefore(nodeGroup, edgeGroup.nextSibling);
    }
    
    // Move all edges to edge layer
    edges.forEach(edge => edgeGroup.appendChild(edge));
    
    // Move all nodes to node layer  
    nodes.forEach(node => nodeGroup.appendChild(node));
}
```

---

## 13.8 Dynamic Layer Assignment

Compute layers based on data properties:

```javascript
function assignLayers(elements, getLayer) {
    // Group elements by layer
    const byLayer = new Map();
    
    for (const element of elements) {
        const layer = getLayer(element);
        if (!byLayer.has(layer)) {
            byLayer.set(layer, []);
        }
        byLayer.get(layer).push(element);
    }
    
    // Sort layers
    const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b);
    
    // Reorder elements
    const parent = elements[0]?.parentNode;
    if (!parent) return;
    
    for (const layer of sortedLayers) {
        for (const element of byLayer.get(layer)) {
            parent.appendChild(element);
        }
    }
}

// Example: layer by importance
assignLayers(nodes, node => {
    if (node.dataset.important === 'true') return 2;
    if (node.dataset.selected === 'true') return 1;
    return 0;
});
```

---

## 13.9 Text Always on Top

Text readability requires it to be on top:

```javascript
function ensureTextOnTop(container) {
    const texts = container.querySelectorAll('text');
    const labels = container.querySelectorAll('.label');
    
    // Move all text elements to the end (top layer)
    texts.forEach(text => container.appendChild(text));
    labels.forEach(label => container.appendChild(label));
}
```

But better: use dedicated label layer (Section 13.4).

---

## 13.10 Interactive Z-Order

Allow users to change layer order:

```javascript
function setupLayerControls(element) {
    const controls = document.createElement('div');
    controls.className = 'layer-controls';
    
    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.onclick = () => moveUp(element);
    
    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.onclick = () => moveDown(element);
    
    const frontBtn = document.createElement('button');
    frontBtn.textContent = 'Front';
    frontBtn.onclick = () => bringToFront(element);
    
    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back';
    backBtn.onclick = () => sendToBack(element);
    
    controls.append(upBtn, downBtn, frontBtn, backBtn);
    return controls;
}
```

---

## 13.11 Preserving Layer Order During Updates

When refreshing content, maintain intentional ordering:

```javascript
function updateDiagram(svg, newData) {
    // Remember intentional layer structure
    const layers = {};
    const layerGroups = svg.querySelectorAll('g[data-layer]');
    
    layerGroups.forEach(g => {
        const layerNum = parseInt(g.dataset.layer);
        layers[layerNum] = g;
        // Clear existing content
        g.innerHTML = '';
    });
    
    // Re-populate with new data
    newData.backgrounds.forEach(bg => {
        layers[0].appendChild(createBackground(bg));
    });
    
    newData.edges.forEach(edge => {
        layers[1].appendChild(createEdge(edge));
    });
    
    newData.nodes.forEach(node => {
        layers[2].appendChild(createNode(node));
    });
    
    newData.labels.forEach(label => {
        layers[3].appendChild(createLabel(label));
    });
}
```

---

## 13.12 Layer Debugging

Tools for understanding layer issues:

```javascript
function debugLayers(svg) {
    const allElements = svg.querySelectorAll('*');
    const layerInfo = [];
    
    let order = 0;
    allElements.forEach(el => {
        if (el.tagName !== 'g' && el.tagName !== 'defs') {
            layerInfo.push({
                order: order++,
                tag: el.tagName,
                id: el.id,
                class: el.className?.baseVal || '',
                parentId: el.parentNode.id
            });
        }
    });
    
    console.table(layerInfo);
    return layerInfo;
}

function highlightLayer(svg, layerIndex) {
    const layers = svg.querySelectorAll('g[data-layer]');
    
    layers.forEach((layer, i) => {
        if (i === layerIndex) {
            layer.style.opacity = '1';
        } else {
            layer.style.opacity = '0.1';
        }
    });
}

function resetLayerHighlight(svg) {
    const layers = svg.querySelectorAll('g[data-layer]');
    layers.forEach(layer => {
        layer.style.opacity = '1';
    });
}
```

---

## 13.13 Common Patterns

### Pattern 1: Tooltip Layer

```javascript
function showTooltip(content, x, y, svg) {
    let tooltipLayer = svg.querySelector('#tooltip-layer');
    if (!tooltipLayer) {
        tooltipLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        tooltipLayer.id = 'tooltip-layer';
        svg.appendChild(tooltipLayer);  // Always at end = on top
    }
    
    // Clear previous
    tooltipLayer.innerHTML = '';
    
    // Create tooltip
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', x);
    bg.setAttribute('y', y);
    bg.setAttribute('rx', '4');
    bg.setAttribute('fill', '#333');
    
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 8);
    text.setAttribute('y', y + 16);
    text.setAttribute('fill', '#fff');
    text.textContent = content;
    
    tooltipLayer.appendChild(bg);
    tooltipLayer.appendChild(text);
    
    // Size background to text
    const textBBox = text.getBBox();
    bg.setAttribute('width', textBBox.width + 16);
    bg.setAttribute('height', textBBox.height + 8);
}
```

### Pattern 2: Drop Shadow Behind

```javascript
function addDropShadow(element) {
    const bbox = element.getBBox();
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    
    shadow.setAttribute('x', bbox.x + 4);
    shadow.setAttribute('y', bbox.y + 4);
    shadow.setAttribute('width', bbox.width);
    shadow.setAttribute('height', bbox.height);
    shadow.setAttribute('fill', 'rgba(0,0,0,0.2)');
    shadow.setAttribute('rx', element.getAttribute('rx') || '0');
    
    // Insert shadow BEFORE the element
    element.parentNode.insertBefore(shadow, element);
    
    return shadow;
}
```

### Pattern 3: Focus Ring on Top

```javascript
function showFocusRing(element) {
    const bbox = element.getBBox();
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    
    const padding = 4;
    ring.setAttribute('x', bbox.x - padding);
    ring.setAttribute('y', bbox.y - padding);
    ring.setAttribute('width', bbox.width + padding * 2);
    ring.setAttribute('height', bbox.height + padding * 2);
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', '#0066ff');
    ring.setAttribute('stroke-width', '2');
    ring.setAttribute('rx', (parseFloat(element.getAttribute('rx')) || 0) + padding);
    ring.classList.add('focus-ring');
    
    // Add to UI layer (always on top)
    const uiLayer = element.ownerSVGElement.querySelector('#ui-layer');
    if (uiLayer) {
        uiLayer.appendChild(ring);
    } else {
        // Fallback: just after element
        element.parentNode.insertBefore(ring, element.nextSibling);
    }
    
    return ring;
}
```

---

## 13.14 Decision Tree: Layer Placement

```
What kind of element?
├── Background/grid → Layer 1 (BACKGROUND)
├── Connection/edge/line → Layer 2 (CONNECTIONS)
├── Primary content (node, shape) → Layer 3 (CONTENT)
├── Text label → Layer 4 (LABELS)
├── Interactive UI (tooltip, highlight) → Layer 5 (UI)
└── Shadow/glow effect → Insert BEFORE its subject
```

---

## 13.15 Chapter Checklist

- [ ] Understand painter's algorithm (document order = layer order)
- [ ] Know that CSS z-index doesn't work in SVG
- [ ] Create explicit layer groups
- [ ] Implement bring-to-front/send-to-back
- [ ] Handle hover/selection layer changes
- [ ] Keep edges behind nodes
- [ ] Keep labels on top

---

## 13.16 Key Takeaways

1. **Document order = visual order**: Later = on top
2. **z-index is useless**: Only document order matters
3. **Use explicit layers**: Create groups for each purpose
4. **Move elements to reorder**: appendChild moves, not copies
5. **Shadows go BEFORE**: Insert shadows before their subject
6. **UI layer goes LAST**: Tooltips, highlights always at end

---

*Next: [Chapter 14: The Repair Toolkit](14-repair-toolkit.md)*
