# Chapter 14: The Repair Toolkit

*Detecting problems and computing fixes algorithmically.*

---

## 14.1 The Repair Mindset

SVG repair is a systematic process:

1. **Detect**: Find what's wrong
2. **Diagnose**: Understand why it's wrong
3. **Compute**: Calculate the fix mathematically
4. **Apply**: Make the change safely
5. **Verify**: Confirm the fix worked

---

## 14.2 Prevention: Avoiding Layout Errors by Design

The best repair is one you never need. These patterns prevent common layout problems:

### Text Placement Rules

1. **Reserve width before positioning**: Estimate text width before placing. A safe heuristic: `width ≈ characters × fontSize × 0.6` for proportional fonts.

2. **Use text-anchor strategically**:
   - `text-anchor="start"`: Use when text should not extend left
   - `text-anchor="middle"`: Use when centering in a known-width container
   - `text-anchor="end"`: Use when text should not extend right

3. **Position labels relative to their containers**: Don't hardcode absolute positions. Instead:
   ```javascript
   const labelX = containerX + containerWidth / 2;  // Centered
   const labelY = containerY + 24;                  // Relative offset
   ```

4. **Add padding budgets**: When placing text in a container, reserve 8-16px on each side:
   ```javascript
   const availableWidth = containerWidth - 16;  // 8px padding each side
   ```

### Element Spacing Patterns

1. **Compute positions algorithmically**: Don't manually position each element. Use formulas:
   ```javascript
   const gap = 20;
   const elementWidth = 100;
   for (let i = 0; i < items.length; i++) {
       const x = startX + i * (elementWidth + gap);
   }
   ```

2. **Use grid layouts for multiple elements**: Define cell sizes, then place content within cells:
   ```javascript
   const cellWidth = totalWidth / columns;
   const cellHeight = totalHeight / rows;
   const x = col * cellWidth + cellPadding;
   const y = row * cellHeight + cellPadding;
   ```

3. **Track cumulative heights for vertical layouts**:
   ```javascript
   let currentY = startY;
   for (const item of items) {
       // Place item at currentY
       currentY += item.height + gap;
   }
   ```

### Container Sizing

1. **Size containers to content + padding**: Don't hardcode container sizes. Compute from content:
   ```javascript
   const contentWidth = Math.max(...items.map(i => i.width));
   const containerWidth = contentWidth + 2 * padding;
   ```

2. **Use relative sizing within groups**: When elements are grouped, define internal layout relative to group origin:
   ```xml
   <g transform="translate(100, 50)">
     <rect x="0" y="0" width="200" height="100"/>  <!-- Group-relative -->
     <text x="100" y="50">Centered</text>          <!-- Group-relative -->
   </g>
   ```

3. **Define viewBox based on content**: Set viewBox to match actual content bounds plus margin:
   ```javascript
   const margin = 20;
   viewBox = `${minX - margin} ${minY - margin} ${width + 2*margin} ${height + 2*margin}`;
   ```

### The 80% Width Rule

For text in containers, assume text will use at most 80% of available width:

```javascript
const maxTextWidth = containerWidth * 0.8;
const fontSize = Math.min(desiredFontSize, (maxTextWidth / estimatedCharacters) / 0.6);
```

### Pre-validation Checklist

Before finalizing any SVG:

- [ ] All text labels have `text-anchor` appropriate to their position
- [ ] No hardcoded absolute positions inside transformed groups
- [ ] Container dimensions computed from content, not guessed
- [ ] All element positions use relative offsets from logical parents
- [ ] Spacing between elements uses consistent gap values
- [ ] viewBox dimensions match content bounds plus margin

---

## 14.3 Problem Categories

| Category | Examples | Detection Method |
|----------|----------|------------------|
| **Overlap** | Text on text, shapes covering shapes | Intersection testing |
| **Overflow** | Content outside container | Containment testing |
| **Alignment** | Elements not lined up | Position comparison |
| **Spacing** | Irregular gaps | Distance measurement |
| **Clipping** | Text cut off | Bounds vs container |
| **Missing** | Labels not visible, elements off-canvas | Visibility testing |

---

## 14.4 Detection: The Collision Detector

```javascript
class CollisionDetector {
    constructor(svg) {
        this.svg = svg;
        this.issues = [];
    }
    
    detectAll() {
        this.issues = [];
        this.detectOverlaps();
        this.detectOverflows();
        this.detectOffCanvas();
        return this.issues;
    }
    
    detectOverlaps() {
        const elements = this.svg.querySelectorAll('rect, circle, ellipse, text, path');
        const boxes = [];
        
        elements.forEach(el => {
            try {
                const bbox = el.getBBox();
                const ctm = el.getScreenCTM();
                const svg = el.ownerSVGElement;
                
                // Convert to absolute coordinates
                const pt1 = svg.createSVGPoint();
                pt1.x = bbox.x; pt1.y = bbox.y;
                const abs1 = pt1.matrixTransform(ctm);
                
                const pt2 = svg.createSVGPoint();
                pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
                const abs2 = pt2.matrixTransform(ctm);
                
                boxes.push({
                    element: el,
                    x: abs1.x,
                    y: abs1.y,
                    width: abs2.x - abs1.x,
                    height: abs2.y - abs1.y,
                    right: abs2.x,
                    bottom: abs2.y
                });
            } catch (e) {
                // Skip elements that can't be measured
            }
        });
        
        // Check all pairs
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const b = boxes[j];
                
                if (this.boxesIntersect(a, b)) {
                    const overlap = this.computeOverlap(a, b);
                    const severity = this.classifySeverity(a, b, overlap);
                    
                    this.issues.push({
                        type: 'overlap',
                        severity,
                        elements: [a.element, b.element],
                        boxes: [a, b],
                        overlap,
                        repair: this.computeOverlapRepair(a, b, overlap)
                    });
                }
            }
        }
    }
    
    boxesIntersect(a, b) {
        return !(a.right < b.x || b.right < a.x || 
                 a.bottom < b.y || b.bottom < a.y);
    }
    
    computeOverlap(a, b) {
        const x = Math.max(a.x, b.x);
        const y = Math.max(a.y, b.y);
        const right = Math.min(a.right, b.right);
        const bottom = Math.min(a.bottom, b.bottom);
        
        return {
            x,
            y,
            width: right - x,
            height: bottom - y,
            area: (right - x) * (bottom - y)
        };
    }
    
    classifySeverity(a, b, overlap) {
        const smallerArea = Math.min(a.width * a.height, b.width * b.height);
        const ratio = overlap.area / smallerArea;
        
        // Text overlaps are more severe
        const hasText = a.element.tagName === 'text' || b.element.tagName === 'text';
        
        if (hasText && ratio > 0.1) return 'high';
        if (ratio > 0.3) return 'high';
        if (ratio > 0.1) return 'medium';
        return 'low';
    }
    
    computeOverlapRepair(a, b, overlap) {
        // Determine which element to move (prefer the second/later one)
        const toMove = b;
        
        // Compute minimum separation vector
        const overlapX = overlap.width;
        const overlapY = overlap.height;
        const padding = 8;
        
        if (overlapX < overlapY) {
            // Horizontal separation is easier
            const moveRight = b.x > a.x;
            return {
                element: toMove.element,
                dx: moveRight ? overlapX + padding : -(overlapX + padding),
                dy: 0,
                description: moveRight ? 'Move right' : 'Move left'
            };
        } else {
            // Vertical separation is easier
            const moveDown = b.y > a.y;
            return {
                element: toMove.element,
                dx: 0,
                dy: moveDown ? overlapY + padding : -(overlapY + padding),
                description: moveDown ? 'Move down' : 'Move up'
            };
        }
    }
    
    detectOverflows() {
        // Find containers and their children
        const containers = this.svg.querySelectorAll('rect[data-container], g[data-container]');
        
        containers.forEach(container => {
            const containerBox = this.getAbsoluteBox(container);
            const children = container.querySelectorAll('*');
            
            children.forEach(child => {
                const childBox = this.getAbsoluteBox(child);
                if (!childBox) return;
                
                const overflow = this.computeOverflow(containerBox, childBox);
                if (overflow) {
                    this.issues.push({
                        type: 'overflow',
                        severity: overflow.severity,
                        container,
                        element: child,
                        containerBox,
                        childBox,
                        overflow,
                        repair: this.computeOverflowRepair(containerBox, childBox, overflow)
                    });
                }
            });
        });
    }
    
    computeOverflow(container, child) {
        let overflow = null;
        
        if (child.x < container.x) {
            overflow = { side: 'left', amount: container.x - child.x };
        }
        if (child.right > container.right) {
            const amount = child.right - container.right;
            if (!overflow || amount > overflow.amount) {
                overflow = { side: 'right', amount };
            }
        }
        if (child.y < container.y) {
            const amount = container.y - child.y;
            if (!overflow || amount > overflow.amount) {
                overflow = { side: 'top', amount };
            }
        }
        if (child.bottom > container.bottom) {
            const amount = child.bottom - container.bottom;
            if (!overflow || amount > overflow.amount) {
                overflow = { side: 'bottom', amount };
            }
        }
        
        if (overflow) {
            overflow.severity = overflow.amount > 20 ? 'high' : 'medium';
        }
        
        return overflow;
    }
    
    computeOverflowRepair(container, child, overflow) {
        switch (overflow.side) {
            case 'left':
                return { dx: overflow.amount + 4, dy: 0 };
            case 'right':
                return { dx: -(overflow.amount + 4), dy: 0 };
            case 'top':
                return { dx: 0, dy: overflow.amount + 4 };
            case 'bottom':
                return { dx: 0, dy: -(overflow.amount + 4) };
        }
    }
    
    detectOffCanvas() {
        const viewBox = this.svg.viewBox.baseVal;
        const canvas = {
            x: viewBox.x,
            y: viewBox.y,
            width: viewBox.width,
            height: viewBox.height,
            right: viewBox.x + viewBox.width,
            bottom: viewBox.y + viewBox.height
        };
        
        const elements = this.svg.querySelectorAll('rect, circle, text, path');
        
        elements.forEach(el => {
            const box = this.getAbsoluteBox(el);
            if (!box) return;
            
            const visible = this.computeVisibility(canvas, box);
            
            if (visible < 0.5) {
                this.issues.push({
                    type: 'off-canvas',
                    severity: visible < 0.1 ? 'high' : 'medium',
                    element: el,
                    box,
                    canvas,
                    visible,
                    repair: this.computeOffCanvasRepair(canvas, box)
                });
            }
        });
    }
    
    computeVisibility(canvas, box) {
        const intersection = this.computeOverlap(canvas, box);
        if (intersection.width <= 0 || intersection.height <= 0) {
            return 0;
        }
        const boxArea = box.width * box.height;
        return intersection.area / boxArea;
    }
    
    computeOffCanvasRepair(canvas, box) {
        let dx = 0, dy = 0;
        
        if (box.x < canvas.x) {
            dx = canvas.x - box.x + 10;
        } else if (box.right > canvas.right) {
            dx = canvas.right - box.right - 10;
        }
        
        if (box.y < canvas.y) {
            dy = canvas.y - box.y + 10;
        } else if (box.bottom > canvas.bottom) {
            dy = canvas.bottom - box.bottom - 10;
        }
        
        return { dx, dy };
    }
    
    getAbsoluteBox(element) {
        try {
            const bbox = element.getBBox();
            const ctm = element.getScreenCTM();
            const svg = element.ownerSVGElement;
            
            const pt1 = svg.createSVGPoint();
            pt1.x = bbox.x; pt1.y = bbox.y;
            const abs1 = pt1.matrixTransform(ctm);
            
            const pt2 = svg.createSVGPoint();
            pt2.x = bbox.x + bbox.width; pt2.y = bbox.y + bbox.height;
            const abs2 = pt2.matrixTransform(ctm);
            
            return {
                x: abs1.x,
                y: abs1.y,
                width: abs2.x - abs1.x,
                height: abs2.y - abs1.y,
                right: abs2.x,
                bottom: abs2.y
            };
        } catch (e) {
            return null;
        }
    }
}
```

---

## 14.5 Applying Repairs

### Method 1: Attribute Updates

For simple cases, update x/y directly:

```javascript
function applyRepair(repair) {
    const { element, dx, dy } = repair;
    
    if (element.tagName === 'text' || element.tagName === 'rect') {
        const currentX = parseFloat(element.getAttribute('x')) || 0;
        const currentY = parseFloat(element.getAttribute('y')) || 0;
        
        element.setAttribute('x', currentX + dx);
        element.setAttribute('y', currentY + dy);
    } else if (element.tagName === 'circle') {
        const cx = parseFloat(element.getAttribute('cx')) || 0;
        const cy = parseFloat(element.getAttribute('cy')) || 0;
        
        element.setAttribute('cx', cx + dx);
        element.setAttribute('cy', cy + dy);
    }
}
```

### Method 2: Transform Updates

Safer for elements that might have existing transforms:

```javascript
function applyRepairViaTransform(repair) {
    const { element, dx, dy } = repair;
    
    const existingTransform = element.getAttribute('transform') || '';
    const newTransform = `translate(${dx}, ${dy}) ${existingTransform}`;
    
    element.setAttribute('transform', newTransform);
}
```

### Method 3: Computing Local Coordinates

When elements are inside transformed groups:

```javascript
function applyRepairInLocalSpace(repair) {
    const { element, dx, dy } = repair;
    
    // Get parent's inverse transform
    const svg = element.ownerSVGElement;
    const parentCTM = element.parentNode.getScreenCTM();
    const inverseCTM = parentCTM.inverse();
    
    // Convert world-space delta to local-space delta
    const worldDelta = svg.createSVGPoint();
    worldDelta.x = dx;
    worldDelta.y = dy;
    
    const origin = svg.createSVGPoint();
    origin.x = 0;
    origin.y = 0;
    
    const localDelta = worldDelta.matrixTransform(inverseCTM);
    const localOrigin = origin.matrixTransform(inverseCTM);
    
    const localDx = localDelta.x - localOrigin.x;
    const localDy = localDelta.y - localOrigin.y;
    
    // Now apply the local delta
    const currentX = parseFloat(element.getAttribute('x')) || 0;
    const currentY = parseFloat(element.getAttribute('y')) || 0;
    
    element.setAttribute('x', currentX + localDx);
    element.setAttribute('y', currentY + localDy);
}
```

---

## 14.6 Verification

After applying repairs, verify they worked:

```javascript
function verifyRepairs(detector, originalIssues) {
    const newIssues = detector.detectAll();
    
    const fixed = [];
    const stillBroken = [];
    const newProblems = [];
    
    // Check which original issues are fixed
    for (const original of originalIssues) {
        const stillExists = newIssues.find(issue => 
            issue.type === original.type &&
            issue.elements?.some(el => original.elements?.includes(el))
        );
        
        if (stillExists) {
            stillBroken.push(original);
        } else {
            fixed.push(original);
        }
    }
    
    // Check for new problems (cascading issues)
    for (const issue of newIssues) {
        const isNew = !originalIssues.find(orig =>
            orig.type === issue.type &&
            orig.elements?.some(el => issue.elements?.includes(el))
        );
        
        if (isNew) {
            newProblems.push(issue);
        }
    }
    
    return {
        fixed,
        stillBroken,
        newProblems,
        success: stillBroken.length === 0 && newProblems.length === 0
    };
}
```

---

## 14.7 Repair Strategies

### Strategy 1: Minimal Movement

Move the smallest distance possible:

```javascript
function minimalRepair(a, b) {
    const overlap = computeOverlap(a, b);
    
    // Calculate the four possible separations
    const options = [
        { dx: overlap.width + 4, dy: 0, cost: overlap.width + 4 },   // Right
        { dx: -(overlap.width + 4), dy: 0, cost: overlap.width + 4 }, // Left
        { dx: 0, dy: overlap.height + 4, cost: overlap.height + 4 },  // Down
        { dx: 0, dy: -(overlap.height + 4), cost: overlap.height + 4 } // Up
    ];
    
    // Choose minimum cost
    options.sort((a, b) => a.cost - b.cost);
    return options[0];
}
```

### Strategy 2: Maintain Alignment

Prefer repairs that maintain existing alignments:

```javascript
function alignmentPreservingRepair(a, b, allElements) {
    const aAlignments = findAlignments(a, allElements);
    const bAlignments = findAlignments(b, allElements);
    
    const overlap = computeOverlap(a, b);
    
    // If b is vertically aligned with others, prefer horizontal movement
    if (bAlignments.verticalGroup.length > 1) {
        return {
            dx: overlap.width + 4,
            dy: 0,
            note: 'Preserved vertical alignment'
        };
    }
    
    // If b is horizontally aligned with others, prefer vertical movement
    if (bAlignments.horizontalGroup.length > 1) {
        return {
            dx: 0,
            dy: overlap.height + 4,
            note: 'Preserved horizontal alignment'
        };
    }
    
    // Default to minimal
    return minimalRepair(a, b);
}

function findAlignments(element, allElements, tolerance = 5) {
    const horizontalGroup = allElements.filter(other =>
        other !== element &&
        Math.abs(other.y - element.y) < tolerance
    );
    
    const verticalGroup = allElements.filter(other =>
        other !== element &&
        Math.abs(other.x - element.x) < tolerance
    );
    
    return { horizontalGroup, verticalGroup };
}
```

### Strategy 3: Cascade Prevention

Check if a repair would cause new overlaps:

```javascript
function safeRepair(element, repair, allElements) {
    // Simulate the repair
    const newPosition = {
        ...element,
        x: element.x + repair.dx,
        y: element.y + repair.dy,
        right: element.right + repair.dx,
        bottom: element.bottom + repair.dy
    };
    
    // Check for new collisions
    const newCollisions = allElements.filter(other =>
        other.element !== element.element &&
        boxesIntersect(newPosition, other)
    );
    
    if (newCollisions.length === 0) {
        return { ...repair, safe: true };
    }
    
    // Try alternative directions
    const alternatives = [
        { dx: repair.dx * 2, dy: repair.dy * 2 },  // Push further
        { dx: -repair.dx, dy: repair.dy },         // Opposite X
        { dx: repair.dx, dy: -repair.dy },         // Opposite Y
    ];
    
    for (const alt of alternatives) {
        const altPosition = {
            ...element,
            x: element.x + alt.dx,
            y: element.y + alt.dy,
            right: element.right + alt.dx,
            bottom: element.bottom + alt.dy
        };
        
        const altCollisions = allElements.filter(other =>
            other.element !== element.element &&
            boxesIntersect(altPosition, other)
        );
        
        if (altCollisions.length === 0) {
            return { ...alt, safe: true, wasAlternative: true };
        }
    }
    
    return { ...repair, safe: false, warning: 'May cause cascading issues' };
}
```

---

## 14.8 The Repair Pipeline

Complete repair workflow:

```javascript
class RepairPipeline {
    constructor(svg) {
        this.svg = svg;
        this.detector = new CollisionDetector(svg);
        this.maxIterations = 10;
    }
    
    run() {
        let iteration = 0;
        let allIssues = [];
        let repairs = [];
        
        while (iteration < this.maxIterations) {
            const issues = this.detector.detectAll();
            
            if (issues.length === 0) {
                break;
            }
            
            allIssues = allIssues.concat(issues);
            
            // Sort by severity
            issues.sort((a, b) => {
                const severityOrder = { high: 0, medium: 1, low: 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });
            
            // Apply repairs for high severity first
            const highSeverity = issues.filter(i => i.severity === 'high');
            
            for (const issue of highSeverity) {
                if (issue.repair) {
                    const safeRepair = this.makeSafe(issue.repair);
                    this.applyRepair(safeRepair);
                    repairs.push({
                        issue,
                        repair: safeRepair,
                        iteration
                    });
                }
            }
            
            iteration++;
        }
        
        return {
            iterations: iteration,
            issuesFound: allIssues.length,
            repairsApplied: repairs.length,
            repairs,
            remainingIssues: this.detector.detectAll()
        };
    }
    
    makeSafe(repair) {
        const allBoxes = this.getAllBoxes();
        return safeRepair(repair.element, repair, allBoxes);
    }
    
    getAllBoxes() {
        const elements = this.svg.querySelectorAll('rect, circle, text, path');
        return Array.from(elements).map(el => ({
            element: el,
            ...this.detector.getAbsoluteBox(el)
        })).filter(b => b.width && b.height);
    }
    
    applyRepair(repair) {
        applyRepairViaTransform(repair);
    }
}

// Usage
const pipeline = new RepairPipeline(document.querySelector('svg'));
const result = pipeline.run();
console.log(`Applied ${result.repairsApplied} repairs in ${result.iterations} iterations`);
```

---

## 14.9 Text-Specific Repairs

Text needs special handling:

```javascript
function repairTextOverflow(textElement, container) {
    const textBox = textElement.getBBox();
    const containerBox = container.getBBox();
    
    // Check if text fits
    if (textBox.width > containerBox.width - 16) {
        // Option 1: Truncate with ellipsis
        const fullText = textElement.textContent;
        const maxWidth = containerBox.width - 24;
        
        let truncated = fullText;
        while (textElement.getComputedTextLength() > maxWidth && truncated.length > 3) {
            truncated = truncated.slice(0, -1);
            textElement.textContent = truncated + '…';
        }
        
        return { type: 'truncate', original: fullText, result: truncated + '…' };
    }
    
    // Option 2: Wrap text
    // (See Chapter 9 for text wrapping implementation)
    
    return null;
}

function repairTextPosition(textElement, container, padding = 8) {
    const textBox = textElement.getBBox();
    const containerBox = container.getBBox();
    
    let dx = 0, dy = 0;
    
    // Left overflow
    if (textBox.x < containerBox.x + padding) {
        dx = containerBox.x + padding - textBox.x;
    }
    
    // Right overflow
    if (textBox.x + textBox.width > containerBox.x + containerBox.width - padding) {
        dx = (containerBox.x + containerBox.width - padding) - (textBox.x + textBox.width);
    }
    
    // Top overflow
    if (textBox.y < containerBox.y + padding) {
        dy = containerBox.y + padding - textBox.y;
    }
    
    // Bottom overflow
    if (textBox.y + textBox.height > containerBox.y + containerBox.height - padding) {
        dy = (containerBox.y + containerBox.height - padding) - (textBox.y + textBox.height);
    }
    
    if (dx !== 0 || dy !== 0) {
        const currentX = parseFloat(textElement.getAttribute('x')) || 0;
        const currentY = parseFloat(textElement.getAttribute('y')) || 0;
        textElement.setAttribute('x', currentX + dx);
        textElement.setAttribute('y', currentY + dy);
        
        return { dx, dy };
    }
    
    return null;
}
```

---

## 14.10 Container Expansion

Sometimes the fix is to grow the container:

```javascript
function expandContainer(container, requiredBox, padding = 8) {
    const containerBox = container.getBBox();
    
    let needsExpand = false;
    let newWidth = containerBox.width;
    let newHeight = containerBox.height;
    let newX = containerBox.x;
    let newY = containerBox.y;
    
    // Check left
    if (requiredBox.x < containerBox.x + padding) {
        const leftExpand = (containerBox.x + padding) - requiredBox.x;
        newX -= leftExpand;
        newWidth += leftExpand;
        needsExpand = true;
    }
    
    // Check right
    if (requiredBox.right > containerBox.x + containerBox.width - padding) {
        const rightExpand = requiredBox.right - (containerBox.x + containerBox.width - padding);
        newWidth += rightExpand;
        needsExpand = true;
    }
    
    // Check top
    if (requiredBox.y < containerBox.y + padding) {
        const topExpand = (containerBox.y + padding) - requiredBox.y;
        newY -= topExpand;
        newHeight += topExpand;
        needsExpand = true;
    }
    
    // Check bottom
    if (requiredBox.bottom > containerBox.y + containerBox.height - padding) {
        const bottomExpand = requiredBox.bottom - (containerBox.y + containerBox.height - padding);
        newHeight += bottomExpand;
        needsExpand = true;
    }
    
    if (needsExpand) {
        container.setAttribute('x', newX);
        container.setAttribute('y', newY);
        container.setAttribute('width', newWidth);
        container.setAttribute('height', newHeight);
        
        return { expanded: true, newX, newY, newWidth, newHeight };
    }
    
    return { expanded: false };
}
```

---

## 14.11 Repair Report Generation

Document what was fixed:

```javascript
function generateRepairReport(results) {
    const report = {
        summary: {
            issuesFound: results.issuesFound,
            repairsApplied: results.repairsApplied,
            iterations: results.iterations,
            remaining: results.remainingIssues.length,
            success: results.remainingIssues.length === 0
        },
        details: results.repairs.map(r => ({
            type: r.issue.type,
            severity: r.issue.severity,
            element: describeElement(r.issue.element || r.issue.elements?.[0]),
            repair: {
                dx: r.repair.dx,
                dy: r.repair.dy,
                description: r.repair.description
            }
        })),
        remaining: results.remainingIssues.map(i => ({
            type: i.type,
            severity: i.severity,
            element: describeElement(i.element || i.elements?.[0])
        }))
    };
    
    return report;
}

function describeElement(el) {
    if (!el) return 'unknown';
    
    return {
        tag: el.tagName,
        id: el.id || null,
        class: el.className?.baseVal || null,
        text: el.textContent?.slice(0, 30) || null
    };
}
```

---

## 14.12 Undo Support

Allow reverting repairs:

```javascript
class RepairHistory {
    constructor() {
        this.history = [];
    }
    
    record(element, before, after) {
        this.history.push({
            element,
            before: { ...before },
            after: { ...after },
            timestamp: Date.now()
        });
    }
    
    undo() {
        const last = this.history.pop();
        if (!last) return null;
        
        // Restore previous state
        const { element, before } = last;
        
        if (before.x !== undefined) element.setAttribute('x', before.x);
        if (before.y !== undefined) element.setAttribute('y', before.y);
        if (before.transform !== undefined) {
            element.setAttribute('transform', before.transform);
        }
        
        return last;
    }
    
    undoAll() {
        while (this.history.length > 0) {
            this.undo();
        }
    }
}

// Usage with repair pipeline
class RepairPipelineWithUndo extends RepairPipeline {
    constructor(svg) {
        super(svg);
        this.history = new RepairHistory();
    }
    
    applyRepair(repair) {
        const element = repair.element;
        
        const before = {
            x: element.getAttribute('x'),
            y: element.getAttribute('y'),
            transform: element.getAttribute('transform')
        };
        
        super.applyRepair(repair);
        
        const after = {
            x: element.getAttribute('x'),
            y: element.getAttribute('y'),
            transform: element.getAttribute('transform')
        };
        
        this.history.record(element, before, after);
    }
    
    undo() {
        return this.history.undo();
    }
}
```

---

## 14.13 Chapter Checklist

**Prevention**
- [ ] Use text-anchor appropriately for label positions
- [ ] Compute container sizes from content + padding
- [ ] Use algorithmic spacing (gaps, grids) instead of manual placement
- [ ] Position elements relative to their logical parents

**Detection & Repair**
- [ ] Implement collision detection
- [ ] Classify issue severity
- [ ] Compute repair vectors
- [ ] Apply repairs safely
- [ ] Verify repairs worked
- [ ] Handle cascading issues
- [ ] Support undo

---

## 14.14 Key Takeaways

1. **Prevent first**: Design layouts to avoid collisions from the start
2. **Use relative positioning**: Don't hardcode absolute coordinates
3. **Compute algorithmically**: Spacing, widths, and positions should be calculated
4. **Detect second**: Find all issues before fixing any
5. **Severity guides priority**: Fix high-severity first
6. **Minimal movement**: Move the least distance possible
7. **Check for cascades**: A fix might cause new problems
8. **Verify after**: Always check if the fix worked
9. **Support undo**: Users might prefer manual fixes

---

*Next: [Chapter 15: Recipes and Patterns](15-recipes-patterns.md)*
