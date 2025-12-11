```markdown
# Chapter 11: Spacing and Alignment

*The invisible structure that makes designs look professional.*

---

## 11.1 Why Spacing Matters

Poor spacing → amateur look. Professional designs have:
- Consistent gaps between elements
- Aligned edges and centers
- Visual rhythm and balance
- Intentional white space

---

## 11.2 The Spacing System

Define a base unit and use multiples:

```javascript
const SPACING = {
    unit: 8,        // Base unit (8px is common)
    xs: 4,          // 0.5 × unit
    sm: 8,          // 1 × unit
    md: 16,         // 2 × unit
    lg: 24,         // 3 × unit
    xl: 32,         // 4 × unit
    xxl: 48         // 6 × unit
};
```

### Why Multiples?

- Creates visual consistency
- Makes decisions easier
- Produces harmonious proportions
- Enables predictable calculations

---

## 11.3 Horizontal Spacing

### Between Inline Elements

```javascript
function spaceHorizontally(elements, gap) {
    let x = elements[0].x;
    
    return elements.map((e, i) => {
        const result = { ...e, x };
        x += e.width + gap;
        return result;
    });
}
```

### Inside Container Padding

```javascript
function applyHorizontalPadding(container, padding) {
    return {
        contentX: container.x + padding,
        contentWidth: container.width - 2 * padding
    };
}
```

---

## 11.4 Vertical Spacing

### Between Stacked Elements

```javascript
function spaceVertically(elements, gap) {
    let y = elements[0].y;
    
    return elements.map((e, i) => {
        const result = { ...e, y };
        y += e.height + gap;
        return result;
    });
}
```

### Section Spacing

Larger gaps between sections, smaller gaps within:

```javascript
function layoutSections(sections, sectionGap, itemGap) {
    let y = 0;
    const result = [];
    
    for (const section of sections) {
        // Add section header
        result.push({ ...section.header, y });
        y += section.header.height + itemGap;
        
        // Add section items
        for (const item of section.items) {
            result.push({ ...item, y });
            y += item.height + itemGap;
        }
        
        // Larger gap before next section
        y += sectionGap - itemGap;
    }
    
    return result;
}
```

---

## 11.5 Alignment Types

### Left Alignment

```javascript
function alignToLeft(elements, leftEdge) {
    return elements.map(e => ({ ...e, x: leftEdge }));
}
```

### Right Alignment

```javascript
function alignToRight(elements, rightEdge) {
    return elements.map(e => ({ ...e, x: rightEdge - e.width }));
}
```

### Center Alignment

```javascript
function alignToCenter(elements, centerX) {
    return elements.map(e => ({ ...e, x: centerX - e.width / 2 }));
}
```

### Top Alignment

```javascript
function alignToTop(elements, topEdge) {
    return elements.map(e => ({ ...e, y: topEdge }));
}
```

### Bottom Alignment

```javascript
function alignToBottom(elements, bottomEdge) {
    return elements.map(e => ({ ...e, y: bottomEdge - e.height }));
}
```

### Middle Alignment

```javascript
function alignToMiddle(elements, middleY) {
    return elements.map(e => ({ ...e, y: middleY - e.height / 2 }));
}
```

---

## 11.6 Relative Alignment

Align to another element rather than a fixed edge:

### Align Bottoms

```javascript
function alignBottomTo(elements, referenceElement) {
    const refBottom = referenceElement.y + referenceElement.height;
    return elements.map(e => ({ 
        ...e, 
        y: refBottom - e.height 
    }));
}
```

### Align Centers

```javascript
function alignCenterTo(elements, referenceElement) {
    const refCenterY = referenceElement.y + referenceElement.height / 2;
    return elements.map(e => ({ 
        ...e, 
        y: refCenterY - e.height / 2 
    }));
}
```

---

## 11.7 Golden Ratio Spacing

The golden ratio (≈ 1.618) creates naturally pleasing proportions:

```javascript
const PHI = 1.618033988749;

function goldenRatioSplit(totalWidth) {
    const larger = totalWidth / PHI;
    const smaller = totalWidth - larger;
    return { larger, smaller };
}

// Example: Split 500px width
// larger ≈ 309px, smaller ≈ 191px
```

### Application in Layout

```javascript
function goldenRatioLayout(containerWidth) {
    const { larger, smaller } = goldenRatioSplit(containerWidth);
    
    return {
        mainColumn: {
            x: 0,
            width: larger
        },
        sideColumn: {
            x: larger,
            width: smaller
        }
    };
}
```

---

## 11.8 Margin Collapse

In SVG, margins don't collapse like CSS. You must manage it:

```javascript
function verticalStackWithCollapsedMargins(elements, margins) {
    let y = 0;
    
    return elements.map((e, i) => {
        const prevMarginBottom = i > 0 ? margins[i - 1].bottom : 0;
        const currMarginTop = margins[i].top;
        
        // Take the larger margin, not the sum
        const effectiveMargin = Math.max(prevMarginBottom, currMarginTop);
        
        if (i > 0) {
            y += effectiveMargin;
        }
        
        const result = { ...e, y };
        y += e.height;
        
        return result;
    });
}
```

---

## 11.9 Baseline Alignment for Text

Text elements should align on their baselines:

```javascript
function alignBaselines(textElements) {
    // All text should share the same y (baseline) value
    const baseline = textElements[0].y;
    return textElements.map(t => ({ ...t, y: baseline }));
}
```

### Visual Representation

```
correct (baseline aligned):
┌─────┐ ┌─────┐ ┌─────┐
│ Agy │ │ Box │ │ Cqp │  ← All sit on same baseline
└─────┘ └─────┘ └─────┘
__________________________________________ ← baseline

wrong (top aligned):
┌─────┐ ┌─────┐ ┌─────┐
│ Agy │ │ Box │ │ Cqp │  ← Different visual positions
│     │ └─────┘ │     │     despite aligned tops
└─────┘         └─────┘
```

---

## 11.10 Optical Alignment

Mathematical alignment isn't always visually correct.

### The Triangle Problem

A triangle aligned by its bounding box looks off-center:

```
        ┌─────────────────┐
        │       ▲         │  ← Triangle bbox is centered
        │      ╱ ╲        │     but triangle looks left-heavy
        │     ╱   ╲       │
        │    ╱     ╲      │
        │   ╱───────╲     │
        └─────────────────┘
```

### Solution: Visual Center

For triangles, circles, and other asymmetric shapes, compute the **visual center** (centroid):

```javascript
function triangleCentroid(p1, p2, p3) {
    return {
        x: (p1.x + p2.x + p3.x) / 3,
        y: (p1.y + p2.y + p3.y) / 3
    };
}
```

### Optical Margin Adjustments

Round shapes need slightly larger margins to look equal:

```javascript
function opticalMargin(baseMargin, shapeType) {
    const adjustments = {
        rectangle: 1.0,      // No adjustment
        circle: 1.1,         // 10% more margin
        triangle: 1.15,      // 15% more margin
        text: 1.0            // Depends on characters
    };
    
    return baseMargin * (adjustments[shapeType] || 1.0);
}
```

---

## 11.11 Spacing Algorithm: Card Layout

A complete example combining concepts:

```javascript
function cardLayout(cards, containerWidth, options = {}) {
    const {
        padding = 16,
        cardGap = 16,
        minCardWidth = 200,
        cardHeight = 150
    } = options;
    
    // Calculate columns
    const availableWidth = containerWidth - 2 * padding;
    const maxColumns = Math.floor((availableWidth + cardGap) / (minCardWidth + cardGap));
    const columns = Math.max(1, maxColumns);
    
    // Calculate actual card width
    const cardWidth = (availableWidth - (columns - 1) * cardGap) / columns;
    
    // Position each card
    return cards.map((card, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        
        return {
            ...card,
            x: padding + col * (cardWidth + cardGap),
            y: padding + row * (cardHeight + cardGap),
            width: cardWidth,
            height: cardHeight
        };
    });
}
```

---

## 11.12 Spacing Algorithm: Dashboard Panels

```javascript
function dashboardLayout(panels, containerWidth, containerHeight) {
    const margin = 16;
    const gap = 12;
    
    // Assume 2x2 grid for 4 panels
    const cellWidth = (containerWidth - 2 * margin - gap) / 2;
    const cellHeight = (containerHeight - 2 * margin - gap) / 2;
    
    const positions = [
        { x: margin, y: margin },
        { x: margin + cellWidth + gap, y: margin },
        { x: margin, y: margin + cellHeight + gap },
        { x: margin + cellWidth + gap, y: margin + cellHeight + gap }
    ];
    
    return panels.map((panel, i) => ({
        ...panel,
        ...positions[i],
        width: cellWidth,
        height: cellHeight
    }));
}
```

---

## 11.13 Decision Tree: Choosing Alignment

```
What are you aligning?
│
├─► Text elements on same line
│   └─► Baseline alignment
│
├─► Elements of same height
│   └─► Top or bottom alignment
│
├─► Elements of different heights
│   └─► Middle alignment
│
├─► Icons next to text
│   └─► Middle alignment (or slight visual adjustment)
│
├─► Form labels and fields
│   └─► Left alignment (labels), left alignment (fields)
│
└─► Decorative shapes
    └─► Visual/optical alignment (may need adjustment)
```

---

## 11.14 Formula Reference

### Even Spacing
```
gap = (totalSpace - totalContentSize) / (itemCount + 1)
```

### Space-Between
```
gap = (totalSpace - totalContentSize) / (itemCount - 1)
```

### Center Alignment
```
x = containerCenter - elementWidth / 2
```

### Golden Ratio
```
larger = total / 1.618
smaller = total - larger
```

### Grid Cell Position
```
x = margin + col × (cellWidth + gap)
y = margin + row × (cellHeight + gap)
```

---

## 11.15 Chapter Checklist

- [ ] Define consistent spacing scale
- [ ] Align elements to left/right/center
- [ ] Space elements evenly
- [ ] Apply golden ratio to layout
- [ ] Align text baselines
- [ ] Account for optical alignment
- [ ] Create card/dashboard layouts

---

## 11.16 Key Takeaways

1. **Use a spacing scale**: 4, 8, 16, 24, 32... (multiples)
2. **Consistency is key**: Same gaps throughout
3. **Baseline alignment for text**: Not top or middle
4. **Golden ratio for pleasing proportions**: 1.618 split
5. **Optical > mathematical**: Adjust for visual perception
6. **Larger gaps between sections**: Creates visual hierarchy

---

*Next: [Chapter 12: Tree and Graph Layouts](12-tree-graph-layouts.md)*

```