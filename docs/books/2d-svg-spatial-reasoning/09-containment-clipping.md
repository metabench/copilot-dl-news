```markdown
# Chapter 9: Containment and Clipping

*Keeping elements where they belong.*

---

## 9.1 The Containment Problem

In SVG layouts, child elements should stay inside their containers. When they don't:
- Text gets cut off
- Important information is hidden
- Visual boundaries are broken
- The design looks broken

---

## 9.2 Containment Test

Is element A fully inside element B?

```javascript
function isContained(inner, outer, tolerance = 0) {
    return inner.x >= outer.x - tolerance &&
           inner.y >= outer.y - tolerance &&
           inner.x + inner.width <= outer.x + outer.width + tolerance &&
           inner.y + inner.height <= outer.y + outer.height + tolerance;
}
```

### With Tolerance

Sometimes a pixel or two of overflow is acceptable:

```javascript
isContained(labelBbox, containerBbox, 2); // Allow 2px overflow
```

---

## 9.3 Overflow Detection

Which edges overflow, and by how much?

```javascript
function getOverflow(inner, outer) {
    return {
        left: Math.max(0, outer.x - inner.x),
        right: Math.max(0, (inner.x + inner.width) - (outer.x + outer.width)),
        top: Math.max(0, outer.y - inner.y),
        bottom: Math.max(0, (inner.y + inner.height) - (outer.y + outer.height))
    };
}
```

### Example

```javascript
const container = { x: 100, y: 100, width: 200, height: 150 };
const label = { x: 90, y: 120, width: 180, height: 20 };

getOverflow(label, container);
// Result: { left: 10, right: 0, top: 0, bottom: 0 }
// Label extends 10px left of container
```

---

## 9.4 Computing Containment Fixes

When overflow is detected, compute the movement needed:

```javascript
function fixOverflow(innerBbox, outerBbox, padding = 5) {
    const overflow = getOverflow(innerBbox, outerBbox);
    
    let dx = 0, dy = 0;
    
    // Fix horizontal overflow
    if (overflow.left > 0) {
        dx = overflow.left + padding;
    } else if (overflow.right > 0) {
        dx = -(overflow.right + padding);
    }
    
    // Fix vertical overflow
    if (overflow.top > 0) {
        dy = overflow.top + padding;
    } else if (overflow.bottom > 0) {
        dy = -(overflow.bottom + padding);
    }
    
    return { dx, dy };
}
```

### Alternative: Constrain to Bounds

Clamp coordinates to stay within container:

```javascript
function constrainToBounds(element, container, padding = 5) {
    const padded = {
        x: container.x + padding,
        y: container.y + padding,
        width: container.width - 2 * padding,
        height: container.height - 2 * padding
    };
    
    return {
        x: Math.max(padded.x, Math.min(element.x, padded.x + padded.width - element.width)),
        y: Math.max(padded.y, Math.min(element.y, padded.y + padded.height - element.height))
    };
}
```

---

## 9.5 SVG clipPath

When you **want** content to be clipped at container edges, use `clipPath`:

```xml
<defs>
    <clipPath id="containerClip">
        <rect x="100" y="100" width="200" height="150"/>
    </clipPath>
</defs>

<g clip-path="url(#containerClip)">
    <!-- All content here is clipped to the rectangle -->
    <text x="90" y="120">This text gets clipped on the left</text>
</g>
```

### Dynamic clipPath

Create the clip path from the container itself:

```xml
<defs>
    <clipPath id="myClip">
        <use href="#myContainer"/>
    </clipPath>
</defs>

<rect id="myContainer" x="100" y="100" width="200" height="150"/>

<g clip-path="url(#myClip)">
    <!-- Clipped content -->
</g>
```

---

## 9.6 SVG Masks

Masks provide soft-edge clipping with gradients:

```xml
<defs>
    <linearGradient id="fadeGradient">
        <stop offset="0%" stop-color="white"/>
        <stop offset="70%" stop-color="white"/>
        <stop offset="100%" stop-color="black"/>
    </linearGradient>
    
    <mask id="fadeRight">
        <rect x="0" y="0" width="200" height="100" fill="url(#fadeGradient)"/>
    </mask>
</defs>

<g mask="url(#fadeRight)">
    <text x="10" y="50">This text fades out on the right...</text>
</g>
```

### Mask vs ClipPath

| clipPath | mask |
|----------|------|
| Binary (in or out) | Gradual (transparency) |
| Crisp edges | Soft edges |
| Better performance | More flexible |
| Vector shapes only | Can use images, gradients |

---

## 9.7 Viewport Clipping

The SVG element itself clips at its edges:

```xml
<svg width="800" height="600" viewBox="0 0 800 600">
    <!-- Anything outside 0-800 x 0-600 is clipped -->
    <circle cx="850" cy="300" r="100"/>  <!-- Half visible -->
</svg>
```

### overflow Attribute

Control whether content outside viewBox is visible:

```xml
<svg overflow="visible">
    <!-- Content can extend outside the SVG boundaries -->
</svg>

<svg overflow="hidden">
    <!-- Default: content is clipped at boundaries -->
</svg>
```

---

## 9.8 Nested Viewports

SVG can contain nested `<svg>` elements with their own coordinate systems:

```xml
<svg viewBox="0 0 800 600">
    <!-- Main canvas -->
    
    <svg x="100" y="100" width="200" height="150" viewBox="0 0 400 300">
        <!-- Nested canvas with its own coordinate system -->
        <!-- 400x300 internal units mapped to 200x150 display size -->
        <!-- Content clipped at 200x150 boundary -->
    </svg>
</svg>
```

This creates natural containment—the nested SVG acts as a container.

---

## 9.9 Algorithm: Smart Text Containment

Text that doesn't fit needs special handling:

```javascript
function fitTextInContainer(text, container, options = {}) {
    const {
        minFontSize = 8,
        padding = 5,
        ellipsis = '...'
    } = options;
    
    // Initial measurement
    let fontSize = text.fontSize;
    let bbox = measureText(text.content, fontSize);
    
    // Available space
    const maxWidth = container.width - 2 * padding;
    const maxHeight = container.height - 2 * padding;
    
    // Strategy 1: Reduce font size
    while (bbox.width > maxWidth && fontSize > minFontSize) {
        fontSize -= 1;
        bbox = measureText(text.content, fontSize);
    }
    
    // Strategy 2: Truncate with ellipsis
    let content = text.content;
    if (bbox.width > maxWidth) {
        while (content.length > 0 && measureText(content + ellipsis, fontSize).width > maxWidth) {
            content = content.slice(0, -1);
        }
        content = content + ellipsis;
    }
    
    return {
        content,
        fontSize,
        x: container.x + padding,
        y: container.y + padding + fontSize  // Baseline
    };
}
```

---

## 9.10 Multi-Line Text Wrapping

SVG doesn't natively wrap text. You must compute line breaks:

```javascript
function wrapText(text, maxWidth, fontSize) {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = measureText(testLine, fontSize).width;
        
        if (testWidth > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}
```

### Rendering Wrapped Text

```javascript
function renderWrappedText(lines, x, y, lineHeight) {
    return lines.map((line, i) => 
        `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${line}</tspan>`
    ).join('');
}

// Usage:
const lines = wrapText('This is a long text that needs wrapping', 100, 14);
const tspans = renderWrappedText(lines, 10, 20, 18);
// Result: multiple <tspan> elements for each line
```

```xml
<text x="10" y="20">
    <tspan x="10" dy="0">This is a long</tspan>
    <tspan x="10" dy="18">text that needs</tspan>
    <tspan x="10" dy="18">wrapping</tspan>
</text>
```

---

## 9.11 Container Resize to Fit

Sometimes the container should grow to fit content:

```javascript
function resizeContainerToFit(container, children, padding = 10) {
    // Compute union of all children
    const childBboxes = children.map(c => c.bbox);
    const contentBbox = unionBBox(childBboxes);
    
    // Add padding
    return {
        x: contentBbox.x - padding,
        y: contentBbox.y - padding,
        width: contentBbox.width + 2 * padding,
        height: contentBbox.height + 2 * padding
    };
}
```

---

## 9.12 Decision Tree: Handling Overflow

```
Content extends beyond container?
│
├─► Is overflow acceptable?
│   └─► YES → Do nothing
│
├─► Can content be moved inside?
│   └─► YES → Apply containment fix (dx, dy)
│
├─► Can content be resized?
│   ├─► Text → Reduce font size or truncate
│   └─► Shape → Scale down
│
├─► Should container grow?
│   └─► YES → Resize container to fit content
│
├─► Should content be clipped?
│   └─► YES → Apply clipPath
│
└─► Should overflow be hidden softly?
    └─► YES → Apply mask with gradient
```

---

## 9.13 Formula Reference

### Containment Test
```
contained = inner.left >= outer.left AND
            inner.right <= outer.right AND
            inner.top >= outer.top AND
            inner.bottom <= outer.bottom
```

### Overflow Amount
```
overflowLeft = max(0, outer.left - inner.left)
overflowRight = max(0, inner.right - outer.right)
overflowTop = max(0, outer.top - inner.top)
overflowBottom = max(0, inner.bottom - outer.bottom)
```

### Constrain to Bounds
```
constrainedX = max(outer.left, min(inner.x, outer.right - inner.width))
constrainedY = max(outer.top, min(inner.y, outer.bottom - inner.height))
```

---

## 9.14 Chapter Checklist

- [ ] Test if one rectangle contains another
- [ ] Calculate overflow amounts for each edge
- [ ] Compute movement to fix overflow
- [ ] Create a clipPath for hard clipping
- [ ] Create a mask for soft-edge clipping
- [ ] Wrap text to fit container width
- [ ] Resize container to fit content

---

## 9.15 Key Takeaways

1. **Containment = all edges inside**: Check all four edges
2. **clipPath for hard edges**: Binary in/out
3. **mask for soft edges**: Gradual transparency
4. **Text is tricky**: May need font resize + truncation + wrapping
5. **Sometimes container should grow**: Content dictates size
6. **Nested SVGs create natural boundaries**: Built-in clipping

---

*Next: [Chapter 10: Positioning Strategies](10-positioning-strategies.md)*

```