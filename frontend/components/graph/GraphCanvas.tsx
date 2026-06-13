'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  Edge,
  Node as RFNode,
  getSmoothStepPath,
  EdgeProps,
  applyNodeChanges,
  NodeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Cpu, Database, Folder, FileCode, Play, Terminal, Layers, Target } from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  type: string;
  file_path?: string;
  start_line?: number;
  end_line?: number;
  properties?: any;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode | null) => void;
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  onFocusNode: (nodeId: string | null) => void;
  loading: boolean;
}

// ----------------- CUSTOM NODE COMPONENTS -----------------

function CustomNode({ data }: { data: { name: string; type: string; isSelected: boolean } }) {
  const typeStyles: Record<string, { bg: string; border: string; text: string; icon: any }> = {
    repo: {
      bg: 'bg-gradient-to-r from-indigo-900/95 to-slate-900/95',
      border: 'border-indigo-500/80',
      text: 'text-indigo-300',
      icon: Layers
    },
    folder: {
      bg: 'bg-gradient-to-r from-amber-950/80 to-slate-950/80',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      icon: Folder
    },
    file: {
      bg: 'bg-gradient-to-r from-slate-900/95 to-slate-950/95',
      border: 'border-slate-700/80',
      text: 'text-slate-200',
      icon: FileCode
    },
    class: {
      bg: 'bg-gradient-to-r from-cyan-950/80 to-slate-950/80',
      border: 'border-cyan-500/60',
      text: 'text-cyan-400',
      icon: Cpu
    },
    function: {
      bg: 'bg-gradient-to-r from-violet-950/80 to-slate-950/80',
      border: 'border-violet-500/60',
      text: 'text-violet-400',
      icon: Terminal
    },
    api: {
      bg: 'bg-gradient-to-r from-rose-950/95 to-slate-950/95',
      border: 'border-rose-500/70',
      text: 'text-rose-400',
      icon: Play
    },
    table: {
      bg: 'bg-gradient-to-r from-teal-950/95 to-slate-950/95',
      border: 'border-teal-500/70',
      text: 'text-teal-400',
      icon: Database
    }
  };

  const current = typeStyles[data.type] || typeStyles.file;
  const Icon = current.icon;

  return (
    <div
      className={`px-4 py-2.5 rounded-xl border glass shadow-lg flex items-center gap-2.5 min-w-[150px] transition-all duration-300 ${
        current.bg
      } ${data.isSelected ? 'border-cyan-400 scale-105 shadow-cyan-500/20 ring-1 ring-cyan-500/30' : current.border}`}
    >
      {/* Input Handle (left) */}
      <Handle type="target" position={Position.Left} className="w-2 h-2" />

      <Icon className={`w-4 h-4 ${current.text} flex-shrink-0`} />
      <div className="flex flex-col text-left">
        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500">
          {data.type}
        </span>
        <span className="text-xs font-bold text-slate-100 max-w-[150px] truncate">
          {data.name}
        </span>
      </div>

      {/* Output Handle (right) */}
      <Handle type="source" position={Position.Right} className="w-2 h-2" />
    </div>
  );
}

function DistributeStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  animated
}: EdgeProps) {
  // Stagger the vertical line (centerX) based on the edge ID to prevent overlapping vertical lines.
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const midX = (sourceX + targetX) / 2;
  const deltaX = Math.abs(targetX - sourceX);
  
  // Stagger range: up to 25% of the horizontal distance in either direction
  const offset = ((hash % 9) - 4) * (deltaX * 0.05); 
  const centerX = midX + offset;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    centerX
  });

  return (
    <path
      id={id}
      style={style}
      className={`react-flow__edge-path ${animated ? 'animated' : ''}`}
      d={edgePath}
      markerEnd={markerEnd}
    />
  );
}

const nodeTypes = {
  custom: CustomNode
};

const edgeTypes = {
  customStep: DistributeStepEdge
};

class SpatialHashGrid {
  private cellSize: number;
  private grid: Map<string, RFNode[]>;

  constructor(cellSize = 800) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  clear() {
    this.grid.clear();
  }

  insert(node: RFNode) {
    const cellX = Math.floor(node.position.x / this.cellSize);
    const cellY = Math.floor(node.position.y / this.cellSize);
    const key = `${cellX},${cellY}`;
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(node);
  }

  insertAll(nodes: RFNode[]) {
    this.clear();
    nodes.forEach(n => this.insert(n));
  }

  query(minX: number, minY: number, maxX: number, maxY: number): RFNode[] {
    const startCellX = Math.floor(minX / this.cellSize);
    const endCellX = Math.floor(maxX / this.cellSize);
    const startCellY = Math.floor(minY / this.cellSize);
    const endCellY = Math.floor(maxY / this.cellSize);

    const result: RFNode[] = [];
    for (let cx = startCellX; cx <= endCellX; cx++) {
      for (let cy = startCellY; cy <= endCellY; cy++) {
        const key = `${cx},${cy}`;
        const cellNodes = this.grid.get(key);
        if (cellNodes) {
          result.push(...cellNodes);
        }
      }
    }
    return result;
  }
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasContent {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasContent({ nodes, edges, onSelectNode, selectedNodeId, focusedNodeId, onFocusNode, loading }: GraphCanvasProps) {
  const [rfNodes, setRfNodes] = useState<RFNode[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const { fitView, setCenter, getViewport } = useReactFlow();

  const containerRef = useRef<HTMLDivElement>(null);
  const spatialGridRef = useRef<SpatialHashGrid>(new SpatialHashGrid(800));
  const adjacencyMapRef = useRef<Map<string, Set<string>>>(new Map());

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Measure the container dynamically to handle initial loading and resizes
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Hover states to highlight paths
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Fade out state for layout snap restoration
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Active category filter selected from the legend
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);

  // Keep track of the last explored/scanned node
  const [lastExploredNode, setLastExploredNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    const activeId = selectedNodeId || focusedNodeId;
    if (activeId) {
      const found = nodes.find(n => n.id === activeId);
      if (found) {
        setLastExploredNode(found);
      }
    }
  }, [selectedNodeId, focusedNodeId, nodes]);

  // Keep references to the original layout elements to restore them
  const originalNodesRef = useRef<RFNode[]>([]);
  const originalEdgesRef = useRef<Edge[]>([]);

  // Ref to ignore selection change when legend is handling it
  const ignoreSelectionChangeRef = useRef(false);

  // Custom onNodesChange to support node dragging while virtualized
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        // Sync new positions back to the master list
        updated.forEach((node) => {
          const orig = originalNodesRef.current.find((n) => n.id === node.id);
          if (orig) {
            orig.position = node.position;
          }
        });
        return updated;
      });
    },
    []
  );

  // Custom onEdgesChange (no-op for read-only edges)
  const onEdgesChange = useCallback(
    (changes: any) => {},
    []
  );

  // Helper to update viewport-aware virtualized graph
  const updateVirtualGraph = useCallback((viewport?: { x: number; y: number; zoom: number }) => {
    if (focusedNodeId || selectedNodeId || activeLegendFilter) return;
    if (originalNodesRef.current.length === 0) return;

    const vp = viewport || getViewport();
    const width = containerSize.width || 800;
    const height = containerSize.height || 600;

    // Convert screen coordinates to graph coordinates with a 1-viewport buffer in all directions
    const minX = -vp.x / vp.zoom - width / vp.zoom;
    const minY = -vp.y / vp.zoom - height / vp.zoom;
    const maxX = (width - vp.x) / vp.zoom + width / vp.zoom;
    const maxY = (height - vp.y) / vp.zoom + height / vp.zoom;

    const visibleNodesList = spatialGridRef.current.query(minX, minY, maxX, maxY);
    const renderSet = new Set<string>();

    // Always render repository root node
    const repoNode = originalNodesRef.current.find(n => n.data?.type === 'repo');
    if (repoNode) renderSet.add(repoNode.id);

    visibleNodesList.forEach(node => {
      renderSet.add(node.id);
      const neighbors = adjacencyMapRef.current.get(node.id);
      if (neighbors) {
        neighbors.forEach(id => renderSet.add(id));
      }
    });

    const filteredNodes = originalNodesRef.current.filter(n => renderSet.has(n.id));
    const filteredEdges = originalEdgesRef.current.filter(e => 
      renderSet.has(e.source) && renderSet.has(e.target)
    );

    setRfNodes(filteredNodes);
    setRfEdges(filteredEdges);
  }, [focusedNodeId, selectedNodeId, getViewport, containerSize, activeLegendFilter]);

  const lastCenterRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });

  // Viewport change event listener
  const onMove = useCallback((event: any, viewport: { x: number; y: number; zoom: number }) => {
    if (focusedNodeId || selectedNodeId || activeLegendFilter) return;

    const width = containerSize.width || 800;
    const height = containerSize.height || 600;

    const centerX = (width / 2 - viewport.x) / viewport.zoom;
    const centerY = (height / 2 - viewport.y) / viewport.zoom;

    const dx = centerX - lastCenterRef.current.x;
    const dy = centerY - lastCenterRef.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const zoomRatio = viewport.zoom / lastCenterRef.current.zoom;

    // Recalculate virtual set only when user pans > 30% of screen width, or changes zoom > 20%
    if (distance > (0.3 * width) / viewport.zoom || zoomRatio < 0.8 || zoomRatio > 1.25) {
      lastCenterRef.current = { x: centerX, y: centerY, zoom: viewport.zoom };
      updateVirtualGraph(viewport);
    }
  }, [focusedNodeId, selectedNodeId, updateVirtualGraph, containerSize, activeLegendFilter]);

  // Helper to center the viewport directly on a node's coordinates using setCenter
  const centerOnNode = (nodeId: string, layoutList: RFNode[], duration = 350) => {
    let targetNode = layoutList.find(n => n.id === nodeId);
    
    // Fallback to parent file if node is hidden in high-level view
    if (!targetNode && lastExploredNode?.file_path) {
      const repoId = lastExploredNode.id.split(':')[0];
      const fileNodeId = `${repoId}:file:${lastExploredNode.file_path}`;
      targetNode = layoutList.find(n => n.id === fileNodeId);
    }

    if (targetNode) {
      // Center on target node coordinate (x + 90, y + 25)
      setCenter(targetNode.position.x + 90, targetNode.position.y + 25, { zoom: 0.75, duration });
      return true;
    }
    return false;
  };

  const handleRecenter = () => {
    if (lastExploredNode) {
      centerOnNode(lastExploredNode.id, rfNodes, 350);
    }
  };

  // Apply layout and transform to React Flow state
  useEffect(() => {
    const apis = nodes.filter(n => n.type === 'api');
    const tables = nodes.filter(n => n.type === 'table');
    const files = nodes.filter(n => n.type === 'file');
    const folders = nodes.filter(n => n.type === 'folder');
    const classes = nodes.filter(n => n.type === 'class');
    const functions = nodes.filter(n => n.type === 'function');
    const repo = nodes.find(n => n.type === 'repo');

    const layoutNodes: RFNode[] = [];
    const seenNodeIds = new Set<string>();

    const pushUniqueNode = (node: RFNode) => {
      if (!seenNodeIds.has(node.id)) {
        seenNodeIds.add(node.id);
        layoutNodes.push(node);
        return true;
      }
      return false;
    };

    let currentY = 0;
    const rowSpacing = 90;

    // 1. Position Repo node
    if (repo) {
      pushUniqueNode({
        id: repo.id,
        type: 'custom',
        position: { x: 300, y: -100 },
        data: { name: repo.name, type: 'repo', isSelected: selectedNodeId === repo.id }
      });
    }

    // 2. Position APIs on the extreme left (X = 0)
    apis.forEach((node, idx) => {
      pushUniqueNode({
        id: node.id,
        type: 'custom',
        position: { x: 0, y: idx * rowSpacing },
        data: { name: node.name, type: 'api', isSelected: selectedNodeId === node.id }
      });
    });

    // 3. Position Tables on the extreme right (X = 1500)
    tables.forEach((node, idx) => {
      pushUniqueNode({
        id: node.id,
        type: 'custom',
        position: { x: 1500, y: idx * rowSpacing },
        data: { name: node.name, type: 'table', isSelected: selectedNodeId === node.id }
      });
    });

    // 4. Align Folders, Files, Classes, and Functions hierarchically (Left to Right)
    // Group files by their parent folder
    const folderFilesMap: Record<string, typeof files> = { "": [] };
    
    // Initialize empty arrays for folders
    folders.forEach(f => {
      folderFilesMap[f.file_path || ""] = [];
    });

    // Distribute files to their parent folders
    files.forEach(file => {
      const parentDir = file.file_path ? file.file_path.substring(0, file.file_path.lastIndexOf('/')) : '';
      if (parentDir in folderFilesMap) {
        folderFilesMap[parentDir].push(file);
      } else {
        folderFilesMap[""].push(file);
      }
    });

    // Process folders and their files
    folders.forEach((folder) => {
      const folderFiles = folderFilesMap[folder.file_path || ""] || [];
      
      // Position folder node
      pushUniqueNode({
        id: folder.id,
        type: 'custom',
        position: { x: 300, y: currentY },
        data: { name: folder.name, type: 'folder', isSelected: selectedNodeId === folder.id }
      });

      if (folderFiles.length === 0) {
        currentY += rowSpacing;
        return;
      }

      // Position files under this folder
      folderFiles.forEach((file) => {
        pushUniqueNode({
          id: file.id,
          type: 'custom',
          position: { x: 600, y: currentY },
          data: { name: file.name, type: 'file', isSelected: selectedNodeId === file.id }
        });

        // Find classes and standalone functions for this file
        const fileClasses = classes.filter(c => c.file_path === file.file_path);
        const fileStandaloneFuncs = functions.filter(f => f.file_path === file.file_path && !f.properties?.class_name);

        if (fileClasses.length === 0 && fileStandaloneFuncs.length === 0) {
          currentY += rowSpacing;
          return;
        }

        // Place classes
        fileClasses.forEach((cls) => {
          pushUniqueNode({
            id: cls.id,
            type: 'custom',
            position: { x: 900, y: currentY },
            data: { name: cls.name, type: 'class', isSelected: selectedNodeId === cls.id }
          });

          // Find class methods
          const classMethods = functions.filter(f => f.file_path === file.file_path && f.properties?.class_name === cls.name);
          if (classMethods.length === 0) {
            currentY += rowSpacing;
          } else {
            classMethods.forEach((method) => {
              const added = pushUniqueNode({
                id: method.id,
                type: 'custom',
                position: { x: 1200, y: currentY },
                data: { name: method.name, type: 'function', isSelected: selectedNodeId === method.id }
              });
              if (added) {
                currentY += rowSpacing;
              }
            });
          }
        });

        // Place standalone functions
        fileStandaloneFuncs.forEach((func) => {
          const added = pushUniqueNode({
            id: func.id,
            type: 'custom',
            position: { x: 1200, y: currentY },
            data: { name: func.name, type: 'function', isSelected: selectedNodeId === func.id }
          });
          if (added) {
            currentY += rowSpacing;
          }
        });
      });
    });

    // Process files at the root level (no parent folder)
    const rootFiles = folderFilesMap[""] || [];
    rootFiles.forEach((file) => {
      pushUniqueNode({
        id: file.id,
        type: 'custom',
        position: { x: 600, y: currentY },
        data: { name: file.name, type: 'file', isSelected: selectedNodeId === file.id }
      });

      const fileClasses = classes.filter(c => c.file_path === file.file_path);
      const fileStandaloneFuncs = functions.filter(f => f.file_path === file.file_path && !f.properties?.class_name);

      if (fileClasses.length === 0 && fileStandaloneFuncs.length === 0) {
        currentY += rowSpacing;
        return;
      }

      fileClasses.forEach((cls) => {
        pushUniqueNode({
          id: cls.id,
          type: 'custom',
          position: { x: 900, y: currentY },
          data: { name: cls.name, type: 'class', isSelected: selectedNodeId === cls.id }
        });

        const classMethods = functions.filter(f => f.file_path === file.file_path && f.properties?.class_name === cls.name);
        if (classMethods.length === 0) {
          currentY += rowSpacing;
        } else {
          classMethods.forEach((method) => {
            const added = pushUniqueNode({
              id: method.id,
              type: 'custom',
              position: { x: 1200, y: currentY },
              data: { name: method.name, type: 'function', isSelected: selectedNodeId === method.id }
            });
            if (added) {
              currentY += rowSpacing;
            }
          });
        }
      });

      fileStandaloneFuncs.forEach((func) => {
        const added = pushUniqueNode({
          id: func.id,
          type: 'custom',
          position: { x: 1200, y: currentY },
          data: { name: func.name, type: 'function', isSelected: selectedNodeId === func.id }
        });
        if (added) {
          currentY += rowSpacing;
        }
      });
    });

    // Fallback: Position any leftover unplaced nodes
    nodes.forEach((node) => {
      if (!seenNodeIds.has(node.id)) {
        const hash = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const xOffset = (hash % 10) * 15;
        const yOffset = (hash % 5) * 15;
        pushUniqueNode({
          id: node.id,
          type: 'custom',
          position: { x: 600 + xOffset, y: currentY + yOffset },
          data: { name: node.name, type: node.type, isSelected: selectedNodeId === node.id }
        });
        currentY += rowSpacing;
      }
    });

    setRfNodes(layoutNodes);

    // Format edges for React Flow
    const layoutEdges = edges.map((edge, idx) => ({
      id: `edge-${idx}`,
      source: edge.source,
      target: edge.target,
      type: 'customStep',
      animated: (edge.type === 'CALLS' || edge.type === 'CALLS_API') && edges.length < 150,
      data: { type: edge.type },
      style: {
        stroke: edge.type === 'CALLS' ? '#8b5cf6' : edge.type === 'CALLS_API' ? '#ec4899' : edge.type === 'USES' ? '#14b8a6' : '#475569',
        strokeWidth: 1.5
      }
    }));

    setRfEdges(layoutEdges);

    // Store original layout configurations
    originalNodesRef.current = layoutNodes;
    originalEdgesRef.current = layoutEdges;

    // Build spatial grid and adjacency map
    spatialGridRef.current.insertAll(layoutNodes);
    
    const adj = new Map<string, Set<string>>();
    layoutEdges.forEach(edge => {
      if (!adj.has(edge.source)) adj.set(edge.source, new Set());
      if (!adj.has(edge.target)) adj.set(edge.target, new Set());
      adj.get(edge.source)!.add(edge.target);
      adj.get(edge.target)!.add(edge.source);
    });
    adjacencyMapRef.current = adj;

    // Initially fall back to full nodes/edges before size observer resolves
    setRfNodes(layoutNodes);
    setRfEdges(layoutEdges);
  }, [nodes, edges]);

  const initialFitDoneRef = useRef<string | null>(null);

  // Trigger virtualization and centering exactly once when container has measured dimensions
  useEffect(() => {
    if (containerSize.width === 0 || originalNodesRef.current.length === 0) return;

    const repoId = nodes[0]?.id.split(':')[0] || '';
    const graphStateKey = `${repoId}-${focusedNodeId || ''}-${nodes.length}`;

    if (initialFitDoneRef.current === graphStateKey) return;
    initialFitDoneRef.current = graphStateKey;

    const viewport = getViewport();
    const width = containerSize.width;
    const height = containerSize.height;

    const minX = -viewport.x / viewport.zoom - width / viewport.zoom;
    const minY = -viewport.y / viewport.zoom - height / viewport.zoom;
    const maxX = (width - viewport.x) / viewport.zoom + width / viewport.zoom;
    const maxY = (height - viewport.y) / viewport.zoom + height / viewport.zoom;

    const visible = spatialGridRef.current.query(minX, minY, maxX, maxY);
    const renderSet = new Set<string>();

    const repoNode = originalNodesRef.current.find(n => n.data?.type === 'repo');
    if (repoNode) renderSet.add(repoNode.id);

    const folderNodes = originalNodesRef.current.filter(n => n.data?.type === 'folder');
    if (folderNodes.length > 0) {
      renderSet.add(folderNodes[0].id);
    }

    visible.forEach(node => {
      renderSet.add(node.id);
      const neighbors = adjacencyMapRef.current.get(node.id);
      if (neighbors) {
        neighbors.forEach(id => renderSet.add(id));
      }
    });

    const initialNodes = originalNodesRef.current.filter(n => renderSet.has(n.id));
    const initialEdges = originalEdgesRef.current.filter(e => renderSet.has(e.source) && renderSet.has(e.target));

    setRfNodes(initialNodes);
    setRfEdges(initialEdges);

    const timer = setTimeout(() => {
      if (focusedNodeId) {
        centerOnNode(focusedNodeId, originalNodesRef.current, 0);
      } else if (lastExploredNode) {
        centerOnNode(lastExploredNode.id, originalNodesRef.current, 350);
      } else {
        const repoNode = originalNodesRef.current.find(n => n.data?.type === 'repo');
        const folderNodes = originalNodesRef.current.filter(n => n.data?.type === 'folder');
        const startingNodes = repoNode
          ? [repoNode, ...(folderNodes.length > 0 ? [folderNodes[0]] : [])]
          : (folderNodes.length > 0 ? [folderNodes[0]] : originalNodesRef.current.slice(0, 3));

        if (originalNodesRef.current.length < 15) {
          fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
        } else if (startingNodes.length > 0) {
          fitView({
            nodes: startingNodes,
            padding: 0.3,
            duration: 0,
            maxZoom: 0.75
          });
        } else {
          fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [containerSize, nodes, focusedNodeId, getViewport, fitView, lastExploredNode]);

  // Handle selectedNodeId changes (isolation mode and layout restorations)
  useEffect(() => {
    if (focusedNodeId || loading) {
      return;
    }

    if (!selectedNodeId) {
      if (ignoreSelectionChangeRef.current) {
        ignoreSelectionChangeRef.current = false;
        return;
      }

      // Selection cleared! Trigger quick fade-out
      setIsFadingOut(true);

      // Wait 100ms for fade-out to complete before restoring layout/viewport
      const timerSnap = setTimeout(() => {
        if (originalNodesRef.current.length > 0) {
          updateVirtualGraph(getViewport());
          
          if (lastExploredNode) {
            centerOnNode(lastExploredNode.id, originalNodesRef.current, 350);
          }
        }
        setIsFadingOut(false);
      }, 100);

      return () => clearTimeout(timerSnap);
    } else {
      // Node selected! Smoothly zoom in to the selection (no fade-out needed!)
      const timerFit = setTimeout(() => {
        fitView({ padding: 0.2, duration: 250, maxZoom: 0.75 });
      }, 50);

      return () => clearTimeout(timerFit);
    }
  }, [selectedNodeId, focusedNodeId, loading, fitView, getViewport, updateVirtualGraph]);

  // Selection Effect: Handles filtering and positioning when selectedNodeId changes
  useEffect(() => {
    if (focusedNodeId) {
      // Just update the isSelected flag in rfNodes state without client-side layout filtering
      setRfNodes((currentNodes) =>
        currentNodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            isSelected: n.id === selectedNodeId,
          },
        }))
      );
      return;
    }

    if (!selectedNodeId) {
      // Handled inside the fade-out timeout above to prevent double updates and pops!
      return;
    }

    // A node is selected! Find it in the master layout state to get its current position
    const selectedNode = originalNodesRef.current.find((n) => n.id === selectedNodeId);
    if (!selectedNode) return;

    const origPos = selectedNode.position;
    const incomingIds: string[] = [];
    const outgoingIds: string[] = [];

    // Check connections in the original layout edges
    originalEdgesRef.current.forEach((edge) => {
      if (edge.target === selectedNodeId && edge.source !== selectedNodeId) {
        incomingIds.push(edge.source);
      }
      if (edge.source === selectedNodeId && edge.target !== selectedNodeId) {
        outgoingIds.push(edge.target);
      }
    });

    // Extract connected nodes from original layout, but position them relative to current position
    const filteredNodes = originalNodesRef.current
      .filter((n) => n.id === selectedNodeId || incomingIds.includes(n.id) || outgoingIds.includes(n.id))
      .map((node) => {
        let position = { ...node.position };

        if (node.id === selectedNodeId) {
          position = { x: origPos.x, y: origPos.y };
        } else if (incomingIds.includes(node.id)) {
          const idx = incomingIds.indexOf(node.id);
          const yCenter = origPos.y + (idx - (incomingIds.length - 1) / 2) * 95;
          position = { x: origPos.x - 300, y: yCenter };
        } else if (outgoingIds.includes(node.id)) {
          const idx = outgoingIds.indexOf(node.id);
          const yCenter = origPos.y + (idx - (outgoingIds.length - 1) / 2) * 95;
          position = { x: origPos.x + 300, y: yCenter };
        }

        return {
          ...node,
          position,
          style: {
            ...node.style,
            opacity: 1
          },
          data: {
            ...node.data,
            isSelected: true
          }
        };
      });

    // Extract edges connecting the visible nodes
    const filteredEdges = originalEdgesRef.current
      .filter((edge) => {
        const hasSource = edge.source === selectedNodeId || incomingIds.includes(edge.source) || outgoingIds.includes(edge.source);
        const hasTarget = edge.target === selectedNodeId || incomingIds.includes(edge.target) || outgoingIds.includes(edge.target);
        return hasSource && hasTarget;
      })
      .map((edge) => {
        const isRelated = edge.source === selectedNodeId || edge.target === selectedNodeId;
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isRelated 
              ? (edge.data?.type === 'CALLS' ? '#a78bfa' : edge.data?.type === 'CALLS_API' ? '#f472b6' : '#2dd4bf')
              : 'rgba(34, 38, 63, 0.25)',
            strokeWidth: isRelated ? 3 : 1
          }
        };
      });

    setRfNodes(filteredNodes);
    setRfEdges(filteredEdges);
  }, [selectedNodeId, focusedNodeId]);

  // Clear legend filter when selectedNodeId is active
  useEffect(() => {
    if (selectedNodeId) {
      setActiveLegendFilter(null);
    }
  }, [selectedNodeId]);

  const handleLegendClick = (type: string) => {
    const nextFilter = activeLegendFilter === type ? null : type;

    // Trigger fade-out
    setIsFadingOut(true);

    if (selectedNodeId) {
      ignoreSelectionChangeRef.current = true;
      onSelectNode(null);
    }

    setTimeout(() => {
      if (nextFilter) {
        // Load all nodes so the column-filtering useMemo can run on the full set
        if (originalNodesRef.current.length > 0) {
          setRfNodes(originalNodesRef.current);
          setRfEdges(originalEdgesRef.current);
        }
      } else {
        // Restore virtualized view when legend filter is cleared
        updateVirtualGraph(getViewport());
      }
      
      // Clear the ignore ref
      ignoreSelectionChangeRef.current = false;

      // Apply the next filter
      setActiveLegendFilter(nextFilter);
    }, 80);
  };

  // Filter and layout nodes/edges by legend selection
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!activeLegendFilter) {
      return { filteredNodes: rfNodes, filteredEdges: rfEdges };
    }

    // 1. Filter nodes of the active category
    const baseNodes = rfNodes.filter((n) => n.data?.type === activeLegendFilter);
    const nodeIds = new Set(baseNodes.map((n) => n.id));

    // 2. Filter edges between these nodes
    const baseEdges = rfEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    // If there are no nodes, return empty
    if (baseNodes.length === 0) {
      return { filteredNodes: [], filteredEdges: [] };
    }

    // 3. Compute dynamic layout for filtered nodes to prevent vertical overlapping
    const layers: Record<string, number> = {};
    baseNodes.forEach((n) => {
      layers[n.id] = 0;
    });

    // Run passes to calculate layers
    const maxPasses = Math.min(5, baseNodes.length);
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false;
      baseEdges.forEach((edge) => {
        const srcLayer = layers[edge.source];
        const tgtLayer = layers[edge.target];
        if (tgtLayer <= srcLayer) {
          layers[edge.target] = srcLayer + 1;
          changed = true;
        }
      });
      if (!changed) break;
    }

    // Group nodes by layer
    const nodesByLayer: Record<number, typeof baseNodes> = {};
    baseNodes.forEach((node) => {
      const layer = layers[node.id] || 0;
      if (!nodesByLayer[layer]) {
        nodesByLayer[layer] = [];
      }
      nodesByLayer[layer].push(node);
    });

    const xSpacing = 300;
    const ySpacing = 95;

    const positionedNodes = baseNodes.map((node) => {
      const layer = layers[node.id] || 0;
      const nodesInLayer = nodesByLayer[layer];
      const indexInLayer = nodesInLayer.findIndex((n) => n.id === node.id);

      const totalHeight = (nodesInLayer.length - 1) * ySpacing;
      const yOffset = -totalHeight / 2;

      return {
        ...node,
        draggable: false, // Disable dragging in filtered view to preserve auto-layout
        position: {
          x: 150 + layer * xSpacing,
          y: yOffset + indexInLayer * ySpacing,
        },
      };
    });

    return { filteredNodes: positionedNodes, filteredEdges: baseEdges };
  }, [rfNodes, rfEdges, activeLegendFilter]);

  // Keep track of the last filter we fitted view for, to avoid double-fitting on same value
  const lastFittedFilterRef = useRef<string | null | undefined>(undefined);

  // fitView when activeLegendFilter changes
  useEffect(() => {
    if (lastFittedFilterRef.current === activeLegendFilter) return;
    lastFittedFilterRef.current = activeLegendFilter;

    // Only snap/fade-in if we are currently transitioning
    if (!isFadingOut) return;

    const timerFit = setTimeout(() => {
      if (activeLegendFilter) {
        // Fit view specifically to the filtered nodes of this category to center on the cluster
        if (filteredNodes.length > 0) {
          fitView({
            nodes: filteredNodes,
            padding: 0.2,
            duration: 0,
            maxZoom: 0.75
          });
        }
      } else {
        // Filter cleared! Snap back to repo main folder starting point
        const repoNode = originalNodesRef.current.find(n => n.data?.type === 'repo');
        const folderNodes = originalNodesRef.current.filter(n => n.data?.type === 'folder');
        const startingNodes = repoNode
          ? [repoNode, ...(folderNodes.length > 0 ? [folderNodes[0]] : [])]
          : (folderNodes.length > 0 ? [folderNodes[0]] : originalNodesRef.current.slice(0, 3));
          
        if (originalNodesRef.current.length < 15) {
          fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
        } else if (startingNodes.length > 0) {
          fitView({ nodes: startingNodes, padding: 0.3, duration: 0, maxZoom: 0.75 });
        } else {
          fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
        }
      }

      setIsFadingOut(false);
    }, 120); // 120ms to allow React Flow to layout and measure updated DOM coordinates

    return () => clearTimeout(timerFit);
  }, [activeLegendFilter, fitView, isFadingOut, filteredNodes]);

  // Handle path highlighting on hover
  const renderedEdges = useMemo(() => {
    if (!hoveredNodeId) return filteredEdges;

    return filteredEdges.map((edge) => {
      const isRelated = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
      return {
        ...edge,
        animated: edge.animated || isRelated,
        style: {
          ...edge.style,
          stroke: isRelated 
            ? (edge.data?.type === 'CALLS' ? '#a78bfa' : edge.data?.type === 'CALLS_API' ? '#f472b6' : '#2dd4bf')
            : 'rgba(34, 38, 63, 0.25)',
          strokeWidth: isRelated ? 3 : 1
        }
      };
    });
  }, [filteredEdges, hoveredNodeId]);

  // Handle node dimming on hover
  const renderedNodes = useMemo(() => {
    if (!hoveredNodeId) return filteredNodes;

    const connectedNodeIds = new Set<string>([hoveredNodeId]);
    filteredEdges.forEach((edge) => {
      if (edge.source === hoveredNodeId) {
        connectedNodeIds.add(edge.target);
      }
      if (edge.target === hoveredNodeId) {
        connectedNodeIds.add(edge.source);
      }
    });

    return filteredNodes.map((node) => {
      const isConnected = connectedNodeIds.has(node.id);
      return {
        ...node,
        style: {
          ...node.style,
          opacity: isConnected ? 1 : 0.15,
          transition: 'opacity 0.25s ease-in-out'
        }
      };
    });
  }, [filteredNodes, filteredEdges, hoveredNodeId]);

  const onNodeClick = (_: any, node: RFNode) => {
    const rawNode = nodes.find(n => n.id === node.id);
    if (rawNode) {
      onSelectNode(rawNode);
    }
  };

  const onPaneClick = () => {
    onSelectNode(null);
    if (focusedNodeId) {
      onFocusNode(null);
    }
    if (activeLegendFilter) {
      setIsFadingOut(true);
      setTimeout(() => {
        if (originalNodesRef.current.length > 0) {
          setRfNodes(originalNodesRef.current);
          setRfEdges(originalEdgesRef.current);
        }
        setActiveLegendFilter(null);
      }, 80);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ background: '#090a10' }}>
      <div className={`w-full h-full transition-all ease-in-out ${isFadingOut ? 'opacity-0 scale-[0.985] duration-100' : 'opacity-100 scale-100 duration-200'}`}>
        <ReactFlow
          nodes={renderedNodes}
          edges={renderedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onMove={onMove}
          fitViewOptions={{ maxZoom: 0.75 }}
          onlyRenderVisibleElements={true}
        >
          <Background color="#22263f" gap={20} size={1} />
          <Controls position="bottom-right" />
          <MiniMap 
            bgColor="#0c0d15" 
            nodeColor={(n) => {
              const type = (n.data as any)?.type;
              if (type === 'api') return '#ec4899';
              if (type === 'table') return '#14b8a6';
              if (type === 'function') return '#8b5cf6';
              if (type === 'class') return '#06b6d4';
              return '#475569';
            }}
            style={{ background: '#0c0d15', border: '1px solid #22263f' }}
          />
        </ReactFlow>
      </div>

      {/* Floating Interactive Legend */}
      <div className="absolute top-4 left-4 glass p-4 rounded-2xl border border-slate-800 text-[11px] font-bold text-slate-400 space-y-2.5 flex flex-col z-10 w-[160px]">
        <span className="text-xs uppercase tracking-wider text-slate-300 border-b border-slate-850 pb-1.5 mb-1 block">
          Graph Legend
        </span>
        <button
          onClick={() => handleLegendClick('repo')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'repo'
              ? 'bg-indigo-500/20 ring-1 ring-indigo-500/50 text-indigo-300'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-indigo-900 to-indigo-700 border border-indigo-500 flex-shrink-0" />
          <span>Repository</span>
        </button>
        <button
          onClick={() => handleLegendClick('folder')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'folder'
              ? 'bg-amber-500/20 ring-1 ring-amber-500/50 text-amber-400'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-amber-950 to-amber-800 border border-amber-500 flex-shrink-0" />
          <span>Folder</span>
        </button>
        <button
          onClick={() => handleLegendClick('file')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'file'
              ? 'bg-slate-500/20 ring-1 ring-slate-500/50 text-slate-200'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700 flex-shrink-0" />
          <span>File</span>
        </button>
        <button
          onClick={() => handleLegendClick('class')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'class'
              ? 'bg-cyan-500/20 ring-1 ring-cyan-500/50 text-cyan-400'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-cyan-950 to-cyan-800 border border-cyan-500 flex-shrink-0" />
          <span>Class</span>
        </button>
        <button
          onClick={() => handleLegendClick('function')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'function'
              ? 'bg-violet-500/20 ring-1 ring-violet-500/50 text-violet-400'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-violet-950 to-violet-800 border border-violet-500 flex-shrink-0" />
          <span>Function</span>
        </button>
        <button
          onClick={() => handleLegendClick('api')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'api'
              ? 'bg-rose-500/20 ring-1 ring-rose-500/50 text-rose-400'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-rose-950 to-rose-800 border border-rose-500 flex-shrink-0" />
          <span>API Route</span>
        </button>
        <button
          onClick={() => handleLegendClick('table')}
          className={`flex items-center gap-2 cursor-pointer w-full text-left py-1 px-1.5 rounded-lg transition-all ${
            activeLegendFilter === 'table'
              ? 'bg-teal-500/20 ring-1 ring-teal-500/50 text-teal-400'
              : activeLegendFilter
              ? 'opacity-40 hover:opacity-80'
              : 'hover:bg-slate-900/50'
          }`}
        >
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-teal-950 to-teal-800 border border-teal-500 flex-shrink-0" />
          <span>DB Table</span>
        </button>
      </div>

      {/* Floating Recenter Button */}
      {lastExploredNode && (
        <button
          onClick={handleRecenter}
          className="absolute top-4 right-4 glass px-4 py-2.5 rounded-2xl border border-slate-800 text-[11px] font-extrabold text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/30 flex items-center gap-2 cursor-pointer z-10 transition-all shadow-lg hover:shadow-cyan-500/5 animate-fade-in"
        >
          <Target className="w-4 h-4" />
          <span>Recenter on {lastExploredNode.name}</span>
        </button>
      )}
    </div>
  );
}
