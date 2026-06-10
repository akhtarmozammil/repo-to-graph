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
  Node as RFNode
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

const nodeTypes = {
  custom: CustomNode
};

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasContent {...props} />
    </ReactFlowProvider>
  );
}

function GraphCanvasContent({ nodes, edges, onSelectNode, selectedNodeId }: GraphCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const { fitView, getViewport, setViewport } = useReactFlow();

  // Hover states to highlight paths
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Fade out state for layout snap restoration
  const [isFadingOut, setIsFadingOut] = useState(false);

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
      type: 'smoothstep',
      animated: edge.type === 'CALLS' || edge.type === 'CALLS_API',
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

    // Trigger initial fitView focused on starting nodes (APIs, repo, folders, files with x <= 600)
    const timer = setTimeout(() => {
      const startingNodes = layoutNodes.filter(n =>
        n.data?.type === 'repo' ||
        n.data?.type === 'api' ||
        n.data?.type === 'folder' ||
        (n.data?.type === 'file' && n.position.x <= 600)
      );
      
      if (layoutNodes.length < 15) {
        // If it is a small focused graph, fit the entire graph in view
        fitView({ padding: 0.15, duration: 350 });
      } else if (startingNodes.length > 0) {
        // For a full graph, fit view to the leftmost starting nodes
        fitView({ 
          nodes: startingNodes, 
          padding: 0.2, 
          duration: 350 
        });
      } else {
        fitView({ padding: 0.15, duration: 350 });
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [nodes, edges, fitView]);

  // Keep references to the original layout elements to restore them
  const originalNodesRef = useRef<RFNode[]>([]);
  const originalEdgesRef = useRef<Edge[]>([]);

  // Ref to save the viewport before selecting a node
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);

  // fitView when selectedNodeId changes (isolation mode or restoring last position)
  useEffect(() => {
    if (!selectedNodeId) {
      // Selection cleared! Trigger quick fade-out
      setIsFadingOut(true);

      // Wait 100ms for fade-out to complete before snapping layout/viewport
      const timerSnap = setTimeout(() => {
        // 1. Snap camera back to saved viewport instantly
        if (savedViewportRef.current) {
          setViewport(savedViewportRef.current, { duration: 0 });
        } else {
          // Fallback: fit starting nodes instantly
          const startingNodes = originalNodesRef.current.filter(n =>
            n.data?.type === 'repo' ||
            n.data?.type === 'api' ||
            n.data?.type === 'folder' ||
            (n.data?.type === 'file' && n.position.x <= 600)
          );
          if (startingNodes.length > 0) {
            fitView({ nodes: startingNodes, padding: 0.2, duration: 0 });
          } else {
            fitView({ padding: 0.15, duration: 0 });
          }
        }

        // 2. Restore all nodes and edges instantly
        if (originalNodesRef.current.length > 0) {
          setRfNodes(originalNodesRef.current);
          setRfEdges(originalEdgesRef.current);
        }

        // 3. Trigger fade-in
        setIsFadingOut(false);
      }, 100);

      return () => clearTimeout(timerSnap);
    } else {
      // Node selected! Smoothly zoom in to the selection (no fade-out needed!)
      const timerFit = setTimeout(() => {
        savedViewportRef.current = getViewport();
        fitView({ padding: 0.2, duration: 250 });
      }, 50);

      return () => clearTimeout(timerFit);
    }
  }, [selectedNodeId, fitView, getViewport, setViewport]);

  // Selection Effect: Handles filtering and positioning when selectedNodeId changes
  useEffect(() => {
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
  }, [selectedNodeId]);

  // Handle path highlighting on hover
  const renderedEdges = useMemo(() => {
    if (!hoveredNodeId) return rfEdges;

    return rfEdges.map((edge) => {
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
  }, [rfEdges, hoveredNodeId]);

  // Handle node dimming on hover
  const renderedNodes = useMemo(() => {
    if (!hoveredNodeId) return rfNodes;

    const connectedNodeIds = new Set<string>([hoveredNodeId]);
    rfEdges.forEach((edge) => {
      if (edge.source === hoveredNodeId) {
        connectedNodeIds.add(edge.target);
      }
      if (edge.target === hoveredNodeId) {
        connectedNodeIds.add(edge.source);
      }
    });

    return rfNodes.map((node) => {
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
  }, [rfNodes, rfEdges, hoveredNodeId]);

  const onNodeClick = (_: any, node: RFNode) => {
    const rawNode = nodes.find(n => n.id === node.id);
    if (rawNode) {
      onSelectNode(rawNode);
    }
  };

  const onPaneClick = () => {
    onSelectNode(null);
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
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          fitView
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

      {/* Floating Legend */}
      <div className="absolute top-4 left-4 glass p-4 rounded-2xl border border-slate-800 text-[11px] font-bold text-slate-400 space-y-2 flex flex-col pointer-events-none">
        <span className="text-xs uppercase tracking-wider text-slate-300 border-b border-slate-850 pb-1.5 mb-1">
          Graph Legend
        </span>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-indigo-900 to-indigo-700 border border-indigo-500" />
          <span>Repository</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-amber-950 to-amber-800 border border-amber-500" />
          <span>Folder</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700" />
          <span>File</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-cyan-950 to-cyan-800 border border-cyan-500" />
          <span>Class</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-violet-950 to-violet-800 border border-violet-500" />
          <span>Function</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-rose-950 to-rose-800 border border-rose-500" />
          <span>API Route</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-md bg-gradient-to-r from-teal-950 to-teal-800 border border-teal-500" />
          <span>DB Table</span>
        </div>
      </div>
    </div>
  );
}
