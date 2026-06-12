'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  Edge,
  Node as RFNode,
  getSmoothStepPath,
  EdgeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Cpu, Database, Folder, FileCode, Play, Terminal, Layers } from 'lucide-react';

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

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasContent {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasContent({ nodes, edges, onSelectNode, selectedNodeId, focusedNodeId }: GraphCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { fitView, getViewport, setViewport } = useReactFlow();

  // Hover states to highlight paths
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Fade out state for layout snap restoration
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Active category filter selected from the legend
  const [activeLegendFilter, setActiveLegendFilter] = useState<string | null>(null);

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
    let currentY = 0;
    const rowSpacing = 90;

    // 1. Position Repo node
    if (repo) {
      layoutNodes.push({
        id: repo.id,
        type: 'custom',
        position: { x: 300, y: -100 },
        data: { name: repo.name, type: 'repo', isSelected: selectedNodeId === repo.id }
      });
    }

    // 2. Position APIs on the extreme left (X = 0)
    apis.forEach((node, idx) => {
      layoutNodes.push({
        id: node.id,
        type: 'custom',
        position: { x: 0, y: idx * rowSpacing },
        data: { name: node.name, type: 'api', isSelected: selectedNodeId === node.id }
      });
    });

    // 3. Position Tables on the extreme right (X = 1500)
    tables.forEach((node, idx) => {
      layoutNodes.push({
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
      layoutNodes.push({
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
        layoutNodes.push({
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
          layoutNodes.push({
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
              layoutNodes.push({
                id: method.id,
                type: 'custom',
                position: { x: 1200, y: currentY },
                data: { name: method.name, type: 'function', isSelected: selectedNodeId === method.id }
              });
              currentY += rowSpacing;
            });
          }
        });

        // Place standalone functions
        fileStandaloneFuncs.forEach((func) => {
          layoutNodes.push({
            id: func.id,
            type: 'custom',
            position: { x: 1200, y: currentY },
            data: { name: func.name, type: 'function', isSelected: selectedNodeId === func.id }
          });
          currentY += rowSpacing;
        });
      });
    });

    // Process files at the root level (no parent folder)
    const rootFiles = folderFilesMap[""] || [];
    rootFiles.forEach((file) => {
      layoutNodes.push({
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
        layoutNodes.push({
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
            layoutNodes.push({
              id: method.id,
              type: 'custom',
              position: { x: 1200, y: currentY },
              data: { name: method.name, type: 'function', isSelected: selectedNodeId === method.id }
            });
            currentY += rowSpacing;
          });
        }
      });

      fileStandaloneFuncs.forEach((func) => {
        layoutNodes.push({
          id: func.id,
          type: 'custom',
          position: { x: 1200, y: currentY },
          data: { name: func.name, type: 'function', isSelected: selectedNodeId === func.id }
        });
        currentY += rowSpacing;
      });
    });

    // Fallback: Position any leftover unplaced nodes
    const processedIds = new Set(layoutNodes.map(n => n.id));
    nodes.forEach((node) => {
      if (!processedIds.has(node.id)) {
        const hash = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const xOffset = (hash % 10) * 15;
        const yOffset = (hash % 5) * 15;
        layoutNodes.push({
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

    // Trigger initial fitView focused on starting nodes or focused node
    const timer = setTimeout(() => {
      const focusedNode = layoutNodes.find(n => n.id === focusedNodeId);
      if (focusedNode) {
        // Center on the focused node!
        fitView({ nodes: [focusedNode], padding: 0.4, duration: 350, maxZoom: 0.75 });
      } else {
        const repoNode = layoutNodes.find(n => n.data?.type === 'repo');
        const folderNodes = layoutNodes.filter(n => n.data?.type === 'folder');
        const startingNodes = repoNode
          ? [repoNode, ...(folderNodes.length > 0 ? [folderNodes[0]] : [])]
          : (folderNodes.length > 0 ? [folderNodes[0]] : layoutNodes.slice(0, 3));
        
        if (layoutNodes.length < 15) {
          // If it is a small focused graph, fit the entire graph in view
          fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
        } else if (startingNodes.length > 0) {
          // Focus on repo main folder starting point (snap instantly)
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
    }, 120);

    return () => clearTimeout(timer);
  }, [nodes, edges, focusedNodeId, fitView]);

  // Keep references to the original layout elements to restore them
  const originalNodesRef = useRef<RFNode[]>([]);
  const originalEdgesRef = useRef<Edge[]>([]);

  // Ref to track the last selected node ID to focus on when clearing selection
  const lastSelectedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedNodeId) {
      lastSelectedNodeIdRef.current = selectedNodeId;
    }
  }, [selectedNodeId]);

  // Ref to save the viewport before selecting a node
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

  // Ref to ignore selection change when legend is handling it
  const ignoreSelectionChangeRef = useRef(false);

  // fitView when selectedNodeId changes (isolation mode or restoring last position)
  useEffect(() => {
    // If Focus Mode is active, we let the Focus Controller manage the viewport
    // and skip client-side selection transition animations.
    if (focusedNodeId) {
      return;
    }

    if (!selectedNodeId) {
      // If we should ignore this selection change (because legend filter is handling it), return!
      if (ignoreSelectionChangeRef.current) {
        ignoreSelectionChangeRef.current = false;
        return;
      }

      // Selection cleared! Trigger quick fade-out
      setIsFadingOut(true);

      // Wait 100ms for fade-out to complete before snapping layout/viewport
      const timerSnap = setTimeout(() => {
        // 1. Restore all nodes and edges instantly first so fitView measures the correct nodes
        if (originalNodesRef.current.length > 0) {
          setRfNodes(originalNodesRef.current);
          setRfEdges(originalEdgesRef.current);
        }

        // 2. Center/focus on the previously selected node in the full graph!
        const lastSelectedNode = originalNodesRef.current.find(n => n.id === lastSelectedNodeIdRef.current);
        if (lastSelectedNode) {
          fitView({ nodes: [lastSelectedNode], padding: 0.4, duration: 0, maxZoom: 0.75 });
        } else if (savedViewportRef.current) {
          setViewport(savedViewportRef.current, { duration: 0 });
        } else {
          // Fallback: fit starting nodes instantly
          const repoNode = originalNodesRef.current.find(n => n.data?.type === 'repo');
          const folderNodes = originalNodesRef.current.filter(n => n.data?.type === 'folder');
          const startingNodes = repoNode
            ? [repoNode, ...(folderNodes.length > 0 ? [folderNodes[0]] : [])]
            : (folderNodes.length > 0 ? [folderNodes[0]] : originalNodesRef.current.slice(0, 3));
          if (startingNodes.length > 0) {
            fitView({ nodes: startingNodes, padding: 0.3, duration: 0, maxZoom: 0.75 });
          } else {
            fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
          }
        }

        // 3. Trigger fade-in
        setIsFadingOut(false);
      }, 100);

      return () => clearTimeout(timerSnap);
    } else {
      // Node selected! Smoothly zoom in to the selection (no fade-out needed!)
      const timerFit = setTimeout(() => {
        savedViewportRef.current = getViewport();
        fitView({ padding: 0.2, duration: 250, maxZoom: 0.75 });
      }, 50);

      return () => clearTimeout(timerFit);
    }
  }, [selectedNodeId, focusedNodeId, fitView, getViewport, setViewport]);

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

    // A node is selected! Find it in the CURRENT state to get its current position
    const selectedNode = rfNodes.find((n) => n.id === selectedNodeId);
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
      // Restore original nodes/edges
      if (originalNodesRef.current.length > 0) {
        setRfNodes(originalNodesRef.current);
        setRfEdges(originalEdgesRef.current);
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
        // Fit view to all currently rendered nodes (which are the filtered nodes)
        // Calling fitView without specifying the nodes option ensures React Flow
        // dynamically centers on whatever is rendered in the canvas, using updated DOM coordinates.
        fitView({ padding: 0.15, duration: 0, maxZoom: 0.75 });
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
  }, [activeLegendFilter, fitView, isFadingOut]);

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
    <div className="w-full h-full relative overflow-hidden" style={{ background: '#090a10' }}>
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
    </div>
  );
}
