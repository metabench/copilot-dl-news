```markdown
# Chapter 10: Positioning Strategies

*Putting things in the right place, every time.*

---

## 10.1 The Positioning Challenge

SVG has no layout engine. Unlike HTML with CSS Flexbox/Grid, you must compute every position yourself. This chapter covers the strategies.

---

## 10.2 Absolute Positioning

The simplest approach: specify exact coordinates.

```xml
<rect x="100" y="50" width="200" height="100"/>
<text x="200" y="100">Centered Text</text>
```

### When to Use

- Fixed layouts that don't change
- Known dimensions
- Simple diagrams

### Drawbacks

- Brittle: changing one element may require changing many
- Hard to maintain
- Doesn't adapt to content size

---

## 10.3 Relative Positioning with Groups

Use `transform="translate()"` to position groups relative to each other:

```xml
<g transform="translate(100, 50)">
    <!-- Everything in here is relative to (100, 50) -->
    <rect x="0" y="0" width="200" height="100"/>
    <text x="100" y="50">Centered</text>
</g>
```

### Benefits

- Move entire component by changing one number
- Children use local coordinates (often 0-based)
- Easy to duplicate: just change the translate

### Component Pattern

```javascript
function createComponent(x, y, content) {
    return `
        <g transform="translate(${x}, ${y})" class="component">
            <rect x="0" y="0" width="150" height="80" class="frame"/>
            <text x="75" y="45" text-anchor="middle">${content}</text>
        </g>
    `;
}
```

---

## 10.4 Anchor Points

Different elements have different anchor points:

| Element | Anchor Point |
|---------|--------------|
| `<rect>` | Top-left corner (x, y) |
| `<circle>` | Center (cx, cy) |
| `<ellipse>` | Center (cx, cy) |
| `<text>` | Baseline, varies by text-anchor |
| `<line>` | Two endpoints (x1,y1 to x2,y2) |

### Text Anchoring

```xml
<!-- Left-aligned (default) -->
<text x="100" y="50" text-anchor="start">Left</text>

<!-- Center-aligned -->
<text x="100" y="50" text-anchor="middle">Center</text>

<!-- Right-aligned -->
<text x="100" y="50" text-anchor="end">Right</text>
```

The `x` coordinate is where the anchor sits:
- `start`: x is the left edge
- `middle`: x is the center
- `end`: x is the right edge

### Vertical Alignment

SVG text has no native vertical centering. You must compute:

```javascript
function centerTextVertically(containerY, containerHeight, fontSize) {
    // Approximate vertical center (baseline positioned)
    return containerY + (containerHeight / 2) + (fontSize * 0.35);
}
```

The `0.35` factor accounts for the baseline being below the visual center.

---

## 10.5 Grid Layouts

Arrange elements in rows and columns:

```javascript
function gridLayout(items, columns, cellWidth, cellHeight, startX = 0, startY = 0) {
    return items.map((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        
        return {
            ...item,
            x: startX + col * cellWidth,
            y: startY + row * cellHeight
        };
    });
}
```

### Example

```javascript
const items = ['A', 'B', 'C', 'D', 'E', 'F'];
const positioned = gridLayout(items, 3, 100, 50);
// Result:
// A at (0, 0)    B at (100, 0)   C at (200, 0)
// D at (0, 50)   E at (100, 50)  F at (200, 50)
```

### With Padding

```javascript
function gridLayoutWithGaps(items, columns, cellWidth, cellHeight, gap = 10) {
    return items.map((item, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        
        return {
            ...item,
            x: col * (cellWidth + gap),
            y: row * (cellHeight + gap)
        };
    });
}
```

---

## 10.6 Flow Layouts

Arrange items horizontally, wrapping when they exceed max width:

```javascript
function flowLayout(items, maxWidth, padding = 10) {
    const positioned = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    
    for (const item of items) {
        // Would this item overflow the row?
        if (x + item.width > maxWidth && x > 0) {
            // Move to next row
            x = 0;
            y += rowHeight + padding;
            rowHeight = 0;
        }
        
        positioned.push({
            ...item,
            x: x,
            y: y
        });
        
        x += item.width + padding;
        rowHeight = Math.max(rowHeight, item.height);
    }
    
    return positioned;
}
```

---

## 10.7 Centered Layouts

### Single Element Centered

```javascript
function center(element, container) {
    return {
        x: container.x + (container.width - element.width) / 2,
        y: container.y + (container.height - element.height) / 2
    };
}
```

### Multiple Elements Centered as Group

```javascript
function centerGroup(elements, container) {
    // First, compute combined bounds of elements (in local coords)
    const groupBbox = unionBBox(elements.map(e => e.bbox));
    
    // Compute offset to center the group
    const offsetX = (container.width - groupBbox.width) / 2 - groupBbox.x;
    const offsetY = (container.height - groupBbox.height) / 2 - groupBbox.y;
    
    // Apply offset to all elements
    return elements.map(e => ({
        ...e,
        x: e.x + offsetX + container.x,
        y: e.y + offsetY + container.y
    }));
}
```

---

## 10.8 Edge-Aligned Layouts

### Left Edge

```javascript
function alignLeft(elements, leftX, gap = 0) {
    return elements.map(e => ({
        ...e,
        x: leftX
    }));
}
```

### Right Edge

```javascript
function alignRight(elements, rightX, gap = 0) {
    return elements.map(e => ({
        ...e,
        x: rightX - e.width
    }));
}
```

### Top Edge

```javascript
function alignTop(elements, topY) {
    return elements.map(e => ({
        ...e,
        y: topY
    }));
}
```

### Bottom Edge

```javascript
function alignBottom(elements, bottomY) {
    return elements.map(e => ({
        ...e,
        y: bottomY - e.height
    }));
}
```

---

## 10.9 Distributed Layouts

Spread elements evenly across a space:

### Even Distribution

```javascript
function distributeHorizontally(elements, startX, endX) {
    const totalWidth = elements.reduce((sum, e) => sum + e.width, 0);
    const availableSpace = endX - startX - totalWidth;
    const gap = availableSpace / (elements.length + 1);
    
    let x = startX + gap;
    return elements.map(e => {
        const result = { ...e, x };
        x += e.width + gap;
        return result;
    });
}
```

### Space-Between (No Outer Gaps)

```javascript
function spaceBetween(elements, startX, endX) {
    if (elements.length === 1) {
        return [{ ...elements[0], x: (startX + endX - elements[0].width) / 2 }];
    }
    
    const totalWidth = elements.reduce((sum, e) => sum + e.width, 0);
    const gap = (endX - startX - totalWidth) / (elements.length - 1);
    
    let x = startX;
    return elements.map(e => {
        const result = { ...e, x };
        x += e.width + gap;
        return result;
    });
}
```

---

## 10.10 Stacked Layouts

Arrange elements vertically:

```javascript
function stackVertically(elements, startY, gap = 10) {
    let y = startY;
    return elements.map(e => {
        const result = { ...e, y };
        y += e.height + gap;
        return result;
    });
}
```

### Centered Stack

```javascript
function centeredStack(elements, centerX, startY, gap = 10) {
    let y = startY;
    return elements.map(e => {
        const result = { 
            ...e, 
            x: centerX - e.width / 2,
            y 
        };
        y += e.height + gap;
        return result;
    });
}
```

---

## 10.11 Radial Layouts

Arrange elements in a circle:

```javascript
function radialLayout(elements, centerX, centerY, radius) {
    const angleStep = (2 * Math.PI) / elements.length;
    
    return elements.map((e, i) => {
        const angle = i * angleStep - Math.PI / 2; // Start at top
        return {
            ...e,
            x: centerX + radius * Math.cos(angle) - e.width / 2,
            y: centerY + radius * Math.sin(angle) - e.height / 2
        };
    });
}
```

### Arc Layout (Partial Circle)

```javascript
function arcLayout(elements, centerX, centerY, radius, startAngle, endAngle) {
    const angleRange = endAngle - startAngle;
    const angleStep = angleRange / Math.max(1, elements.length - 1);
    
    return elements.map((e, i) => {
        const angle = startAngle + i * angleStep;
        return {
            ...e,
            x: centerX + radius * Math.cos(angle) - e.width / 2,
            y: centerY + radius * Math.sin(angle) - e.height / 2
        };
    });
}
```

---

## 10.12 Responsive Positioning

Adjust layout based on container size:

```javascript
function responsiveGrid(items, containerWidth, minCellWidth, gap = 10) {
    // Calculate how many columns fit
    const columns = Math.max(1, Math.floor((containerWidth + gap) / (minCellWidth + gap)));
    const cellWidth = (containerWidth - (columns - 1) * gap) / columns;
    
    return gridLayout(items, columns, cellWidth, cellWidth, 0, 0);
}
```

---

## 10.13 Decision Tree: Choosing a Layout

```
What are you laying out?
│
├─► Fixed number of items with known positions
│   └─► Absolute positioning
│
├─► Items that move together
│   └─► Group with translate
│
├─► Items in rows and columns
│   └─► Grid layout
│
├─► Items that wrap when full
│   └─► Flow layout
│
├─► Items spread across a space
│   └─► Distributed layout
│
├─► Items stacked top-to-bottom
│   └─► Stacked layout
│
├─► Items around a center point
│   └─► Radial layout
│
└─► Layout adapts to container
    └─► Responsive calculation
```

---

## 10.14 Formula Reference

### Grid Cell Position
```
x = startX + col × (cellWidth + gap)
y = startY + row × (cellHeight + gap)
```

### Even Distribution Gap
```
gap = (totalSpace - totalElementSize) / (elementCount + 1)
```

### Space-Between Gap
```
gap = (totalSpace - totalElementSize) / (elementCount - 1)
```

### Center Element
```
x = containerX + (containerWidth - elementWidth) / 2
y = containerY + (containerHeight - elementHeight) / 2
```

### Radial Position
```
x = centerX + radius × cos(angle) - width/2
y = centerY + radius × sin(angle) - height/2
```

---

## 10.15 Chapter Checklist

- [ ] Position element using absolute coordinates
- [ ] Create component with group and translate
- [ ] Align text using text-anchor
- [ ] Create grid layout
- [ ] Create flow layout with wrapping
- [ ] Center element in container
- [ ] Distribute elements evenly
- [ ] Create radial layout

---

## 10.16 Key Takeaways

1. **SVG has no layout engine**: You compute everything
2. **Groups + translate = components**: Move together, local coordinates
3. **text-anchor controls horizontal**: start, middle, end
4. **Grids are rows × columns**: Index to position math
5. **Distribution needs gap calculation**: (space - content) / (n + 1)
6. **Radial uses trigonometry**: cos for x, sin for y

---

*Next: [Chapter 11: Spacing and Alignment](11-spacing-alignment.md)*

```