```markdown
# Chapter 12: Tree and Graph Layouts

*Spatial reasoning for hierarchical and connected data.*

---

## 12.1 The Challenge of Tree Layouts

Trees are hierarchies: parent nodes with children. The spatial challenges:
- Nodes must not overlap
- Edges must be clear
- Hierarchy must be visually obvious
- Space must be used efficiently

---

## 12.2 Tree Terminology

```
        ROOT
       /    \
    NODE    NODE
    /  \      |
 LEAF  LEAF  LEAF
```

- **Root**: Top/starting node (depth 0)
- **Node**: Any element in the tree
- **Leaf**: Node with no children
- **Depth**: Distance from root
- **Height**: Longest path from node to leaf
- **Subtree**: Node and all its descendants

---

## 12.3 Simple Top-Down Tree

The most basic tree layout:

```javascript
function simpleTreeLayout(root, nodeWidth, nodeHeight, levelGap, siblingGap) {
    const positions = new Map();
    
    // First pass: assign levels
    function assignLevels(node, level) {
        node.level = level;
        for (const child of node.children || []) {
            assignLevels(child, level + 1);
        }
    }
    
    // Second pass: count leaves at each level to determine width
    function countLeaves(node) {
        if (!node.children || node.children.length === 0) {
            return 1;
        }
        return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
    }
    
    // Third pass: position nodes
    function positionNode(node, leftBound, rightBound) {
        const centerX = (leftBound + rightBound) / 2;
        const y = node.level * (nodeHeight + levelGap);
        
        positions.set(node, { x: centerX - nodeWidth / 2, y });
        
        if (node.children && node.children.length > 0) {
            const totalLeaves = countLeaves(node);
            const widthPerLeaf = (rightBound - leftBound) / totalLeaves;
            
            let currentLeft = leftBound;
            for (const child of node.children) {
                const childLeaves = countLeaves(child);
                const childRight = currentLeft + childLeaves * widthPerLeaf;
                positionNode(child, currentLeft, childRight);
                currentLeft = childRight;
            }
        }
    }
    
    assignLevels(root, 0);
    const totalLeaves = countLeaves(root);
    const totalWidth = totalLeaves * (nodeWidth + siblingGap) - siblingGap;
    positionNode(root, 0, totalWidth);
    
    return positions;
}
```

---

## 12.4 Reingold-Tilford Algorithm (Improved)

The standard algorithm for aesthetically pleasing trees:

### Principles

1. Nodes at same depth should be on the same horizontal level
2. A parent should be centered over its children
3. Subtrees should be drawn identically regardless of position
4. Subtrees should be as close as possible without overlapping

### Simplified Implementation

```javascript
function reingoldTilfordLayout(root, nodeWidth, nodeHeight, horizontalGap, verticalGap) {
    const positions = new Map();
    
    // Assign preliminary x coordinates
    function firstPass(node, depth = 0) {
        node.depth = depth;
        node.mod = 0;
        
        if (!node.children || node.children.length === 0) {
            node.preliminary = 0;
            return;
        }
        
        for (const child of node.children) {
            firstPass(child, depth + 1);
        }
        
        // Space out children
        let nextX = 0;
        for (const child of node.children) {
            child.preliminary = nextX;
            nextX += nodeWidth + horizontalGap;
        }
        
        // Center parent over children
        const first = node.children[0].preliminary;
        const last = node.children[node.children.length - 1].preliminary;
        node.preliminary = (first + last) / 2;
    }
    
    // Compute final positions
    function secondPass(node, modSum = 0) {
        const x = node.preliminary + modSum;
        const y = node.depth * (nodeHeight + verticalGap);
        positions.set(node, { x, y });
        
        for (const child of node.children || []) {
            secondPass(child, modSum + node.mod);
        }
    }
    
    // Separate overlapping subtrees (simplified)
    function separateSubtrees(node) {
        if (!node.children || node.children.length < 2) return;
        
        for (let i = 1; i < node.children.length; i++) {
            let separation = 0;
            // Check for overlaps with all previous siblings
            for (let j = 0; j < i; j++) {
                const required = computeRequiredSeparation(
                    node.children[j], 
                    node.children[i],
                    horizontalGap
                );
                separation = Math.max(separation, required);
            }
            
            if (separation > 0) {
                // Shift this child and all subsequent children
                for (let k = i; k < node.children.length; k++) {
                    node.children[k].preliminary += separation;
                    node.children[k].mod += separation;
                }
            }
        }
        
        // Recurse
        for (const child of node.children) {
            separateSubtrees(child);
        }
    }
    
    firstPass(root);
    separateSubtrees(root);
    secondPass(root);
    
    // Normalize to positive coordinates
    let minX = Infinity;
    for (const pos of positions.values()) {
        minX = Math.min(minX, pos.x);
    }
    for (const [node, pos] of positions) {
        positions.set(node, { x: pos.x - minX, y: pos.y });
    }
    
    return positions;
}

function computeRequiredSeparation(leftTree, rightTree, gap) {
    // Find rightmost points of left tree and leftmost points of right tree
    // at each level, compute required shift
    // (Simplified: just use the root position difference)
    const diff = rightTree.preliminary - leftTree.preliminary;
    const needed = nodeWidth + gap;
    return needed - diff;
}
```

---

## 12.5 Horizontal Tree Layout

Sometimes trees flow left-to-right:

```javascript
function horizontalTreeLayout(root, nodeWidth, nodeHeight, horizontalGap, verticalGap) {
    // Same as vertical, but swap x/y
    const verticalPositions = reingoldTilfordLayout(
        root, nodeHeight, nodeWidth, verticalGap, horizontalGap
    );
    
    const positions = new Map();
    for (const [node, pos] of verticalPositions) {
        positions.set(node, { x: pos.y, y: pos.x });
    }
    
    return positions;
}
```

---

## 12.6 Drawing Tree Edges

### Straight Lines

```javascript
function straightEdge(parent, child, nodeWidth, nodeHeight) {
    const x1 = parent.x + nodeWidth / 2;
    const y1 = parent.y + nodeHeight;
    const x2 = child.x + nodeWidth / 2;
    const y2 = child.y;
    
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}
```

### Orthogonal (Right-Angle) Edges

```javascript
function orthogonalEdge(parent, child, nodeWidth, nodeHeight) {
    const x1 = parent.x + nodeWidth / 2;
    const y1 = parent.y + nodeHeight;
    const x2 = child.x + nodeWidth / 2;
    const y2 = child.y;
    const midY = (y1 + y2) / 2;
    
    return `<path d="M ${x1} ${y1} V ${midY} H ${x2} V ${y2}" fill="none"/>`;
}
```

### Curved Edges (Most Aesthetic)

```javascript
function curvedEdge(parent, child, nodeWidth, nodeHeight) {
    const x1 = parent.x + nodeWidth / 2;
    const y1 = parent.y + nodeHeight;
    const x2 = child.x + nodeWidth / 2;
    const y2 = child.y;
    
    const dy = y2 - y1;
    const cp1y = y1 + dy * 0.5;
    const cp2y = y2 - dy * 0.5;
    
    return `<path d="M ${x1} ${y1} C ${x1} ${cp1y} ${x2} ${cp2y} ${x2} ${y2}" fill="none"/>`;
}
```

---

## 12.7 Graph Layouts (Non-Hierarchical)

Graphs have nodes and edges without hierarchy. Common layouts:

### Force-Directed Layout

Nodes repel each other; edges pull connected nodes together:

```javascript
function forceDirectedLayout(nodes, edges, iterations = 100) {
    // Initialize random positions
    for (const node of nodes) {
        node.x = Math.random() * 500;
        node.y = Math.random() * 500;
        node.vx = 0;
        node.vy = 0;
    }
    
    const repulsion = 5000;
    const attraction = 0.01;
    const damping = 0.8;
    
    for (let i = 0; i < iterations; i++) {
        // Repulsion between all pairs
        for (let a = 0; a < nodes.length; a++) {
            for (let b = a + 1; b < nodes.length; b++) {
                const dx = nodes[b].x - nodes[a].x;
                const dy = nodes[b].y - nodes[a].y;
                const dist = Math.sqrt(dx * dx + dy * dy) + 1;
                
                const force = repulsion / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                nodes[a].vx -= fx;
                nodes[a].vy -= fy;
                nodes[b].vx += fx;
                nodes[b].vy += fy;
            }
        }
        
        // Attraction along edges
        for (const edge of edges) {
            const a = edge.source;
            const b = edge.target;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const force = dist * attraction;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }
        
        // Apply velocities with damping
        for (const node of nodes) {
            node.x += node.vx;
            node.y += node.vy;
            node.vx *= damping;
            node.vy *= damping;
        }
    }
    
    return nodes;
}
```

### Circular Layout

Simple layout for connected graphs:

```javascript
function circularLayout(nodes, centerX, centerY, radius) {
    const angleStep = (2 * Math.PI) / nodes.length;
    
    return nodes.map((node, i) => ({
        ...node,
        x: centerX + radius * Math.cos(i * angleStep - Math.PI / 2),
        y: centerY + radius * Math.sin(i * angleStep - Math.PI / 2)
    }));
}
```

---

## 12.8 Edge Routing

When edges might cross nodes, route around them:

### Simple Avoidance

```javascript
function routeEdgeAroundNodes(start, end, obstacles, padding = 10) {
    // Simple approach: add waypoints if direct line crosses obstacles
    const directPath = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    
    const blockers = obstacles.filter(obs => 
        lineIntersectsRect(directPath, obs, padding)
    );
    
    if (blockers.length === 0) {
        return [start, end]; // Direct line is fine
    }
    
    // Route around the first blocker (simplified)
    const blocker = blockers[0];
    const midY = (start.y + end.y) / 2;
    
    // Go above or below the blocker
    const goAbove = midY < blocker.y + blocker.height / 2;
    const waypointY = goAbove 
        ? blocker.y - padding 
        : blocker.y + blocker.height + padding;
    
    return [
        start,
        { x: start.x, y: waypointY },
        { x: end.x, y: waypointY },
        end
    ];
}
```

---

## 12.9 Avoiding Edge-Node Overlaps

Detect when edges pass through nodes:

```javascript
function edgeCrossesNode(edge, node, margin = 5) {
    const nodeBbox = {
        x: node.x - margin,
        y: node.y - margin,
        width: node.width + 2 * margin,
        height: node.height + 2 * margin
    };
    
    // Check if line segment intersects rectangle
    return lineIntersectsRect(edge, nodeBbox);
}

function lineIntersectsRect(line, rect) {
    // Cohen-Sutherland or simpler rectangle-line intersection
    const { x1, y1, x2, y2 } = line;
    
    // Check if line endpoints are inside
    if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) {
        return true;
    }
    
    // Check if line crosses any edge of rectangle
    const edges = [
        { x1: rect.x, y1: rect.y, x2: rect.x + rect.width, y2: rect.y },
        { x1: rect.x + rect.width, y1: rect.y, x2: rect.x + rect.width, y2: rect.y + rect.height },
        { x1: rect.x + rect.width, y1: rect.y + rect.height, x2: rect.x, y2: rect.y + rect.height },
        { x1: rect.x, y1: rect.y + rect.height, x2: rect.x, y2: rect.y }
    ];
    
    return edges.some(edge => linesIntersect(line, edge));
}
```

---

## 12.10 Decision Tree Specific Layout

For decision trees (like flowcharts), often need fixed shapes:

```javascript
function decisionTreeLayout(tree, config) {
    const {
        questionWidth = 200,
        questionHeight = 80,
        answerWidth = 150,
        answerHeight = 50,
        levelGap = 80,
        siblingGap = 40
    } = config;
    
    const positions = new Map();
    
    function layout(node, x, y, availableWidth) {
        const width = node.type === 'question' ? questionWidth : answerWidth;
        const height = node.type === 'question' ? questionHeight : answerHeight;
        
        positions.set(node, {
            x: x + (availableWidth - width) / 2,
            y,
            width,
            height
        });
        
        if (node.children && node.children.length > 0) {
            const childWidth = availableWidth / node.children.length;
            let childX = x;
            
            for (const child of node.children) {
                layout(child, childX, y + height + levelGap, childWidth);
                childX += childWidth;
            }
        }
    }
    
    // Estimate total width needed
    function countLeaves(node) {
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
    }
    
    const leaves = countLeaves(tree);
    const totalWidth = leaves * (Math.max(questionWidth, answerWidth) + siblingGap);
    
    layout(tree, 0, 0, totalWidth);
    
    return positions;
}
```

---

## 12.11 Org Chart Layout

Organizational charts have special requirements:

```javascript
function orgChartLayout(root, config) {
    const {
        nodeWidth = 150,
        nodeHeight = 60,
        horizontalGap = 30,
        verticalGap = 50,
        assistantGap = 20
    } = config;
    
    // Use standard tree layout as base
    const positions = reingoldTilfordLayout(root, nodeWidth, nodeHeight, horizontalGap, verticalGap);
    
    // Handle assistants (nodes that appear beside their manager, not below)
    for (const [node, pos] of positions) {
        if (node.isAssistant && node.parent) {
            const parentPos = positions.get(node.parent);
            positions.set(node, {
                x: parentPos.x + nodeWidth + assistantGap,
                y: parentPos.y
            });
        }
    }
    
    return positions;
}
```

---

## 12.12 Collapse/Expand Handling

Trees often have collapsible sections:

```javascript
function layoutWithCollapse(root, expandedNodes, config) {
    // Create a filtered tree with only visible nodes
    function filterTree(node) {
        if (!node.children) return { ...node, children: [] };
        
        if (!expandedNodes.has(node.id)) {
            return { ...node, children: [], isCollapsed: true };
        }
        
        return {
            ...node,
            children: node.children.map(filterTree)
        };
    }
    
    const visibleTree = filterTree(root);
    return decisionTreeLayout(visibleTree, config);
}
```

---

## 12.13 Formula Reference

### Tree Width Estimation
```
width ≈ leafCount × (nodeWidth + siblingGap)
```

### Tree Height Estimation
```
height ≈ maxDepth × (nodeHeight + levelGap)
```

### Centered Parent Position
```
parentX = (firstChild.x + lastChild.x) / 2
```

### Force-Directed Repulsion
```
force = k² / distance  (Fruchterman-Reingold)
```

### Radial Tree Position
```
x = centerX + (depth × radiusStep) × cos(angle)
y = centerY + (depth × radiusStep) × sin(angle)
```

---

## 12.14 Chapter Checklist

- [ ] Compute simple tree layout positions
- [ ] Draw straight/orthogonal/curved edges
- [ ] Implement force-directed graph layout
- [ ] Route edges around obstacles
- [ ] Handle collapsed/expanded subtrees
- [ ] Create org chart with assistants

---

## 12.15 Key Takeaways

1. **Same depth = same Y**: Fundamental tree principle
2. **Center parents over children**: Looks balanced
3. **Curved edges look best**: Especially for diagrams
4. **Force-directed for graphs**: When hierarchy is unclear
5. **Edge routing prevents overlap**: Essential for complex diagrams
6. **Collapse affects layout**: Filter tree before computing positions

---

*Next: [Chapter 13: Layer Order and Z-Index](13-layer-order.md)*

```