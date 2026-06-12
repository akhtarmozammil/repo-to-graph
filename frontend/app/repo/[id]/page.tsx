'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, LayoutDashboard, Database, AlertCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/graph/Sidebar';
import NodeDetails from '@/components/graph/NodeDetails';
import ChatWindow from '@/components/chat/ChatWindow';

const GraphCanvas = dynamic(() => import('@/components/graph/GraphCanvas'), { ssr: false });


interface RepoPageProps {
  params: Promise<{ id: string }>;
}

interface RepoDetails {
  id: string;
  name: string;
  url: string | null;
  local_path: string;
}

const API_BASE = 'http://localhost:8000/api';

export default function RepositoryExplorer({ params }: RepoPageProps) {
  // Resolve params promise for Next.js 15
  const resolvedParams = use(params);
  const repoId = resolvedParams.id;

  const [repo, setRepo] = useState<RepoDetails | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [edges, setEdges] = useState<any[]>([]);
  
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [highLevelView, setHighLevelView] = useState(false);
  const [repoMetrics, setRepoMetrics] = useState<any | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States for page initial load overlay
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLoader, setShowLoader] = useState(true);
  const [loaderOpacity, setLoaderOpacity] = useState(1);

  // 1. Fetch Repository Details
  useEffect(() => {
    const fetchRepoDetails = async () => {
      try {
        const res = await fetch(`${API_BASE}/repositories/${repoId}`);
        if (!res.ok) throw new Error('Repository details not found');
        const data = await res.json();
        setRepo(data);
      } catch (err: any) {
        setError(err.message);
      }
    };
    fetchRepoDetails();
  }, [repoId]);

  // 2. Fetch Graph Data (runs when focus states change)
  const fetchGraphData = async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/repositories/${repoId}/graph`;
      const params = new URLSearchParams();
      
      if (focusedNodeId) {
        params.append('focus_node_id', focusedNodeId);
        params.append('depth', focusDepth.toString());
      }
      
      const queryStr = params.toString();
      if (queryStr) {
        url += `?${queryStr}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch graph data');
      const data = await res.json();
      
      setNodes(data.nodes);
      setEdges(data.edges);
      setHighLevelView(!!data.high_level_view);
      setRepoMetrics(data.metrics || null);
      setError(null);

      // Post-fetch node selection adjustment
      if (focusedNodeId) {
        const targetNode = data.nodes.find((n: any) => n.id === focusedNodeId);
        if (targetNode) {
          setSelectedNode(targetNode);
        }
      } else if (selectedNode) {
        // If focus was cleared, check if the previously selected node is still in the loaded graph.
        // If it's not, clear the selection.
        const isStillPresent = data.nodes.some((n: any) => n.id === selectedNode.id);
        if (!isStillPresent) {
          setSelectedNode(null);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      // Fade out initial loader on first successful load
      if (isInitialLoad) {
        setLoaderOpacity(0);
        setTimeout(() => setShowLoader(false), 500);
        setIsInitialLoad(false);
      }
    }
  };

  useEffect(() => {
    fetchGraphData();
  }, [repoId, focusedNodeId, focusDepth]);

  // Handle focusing node from search click or graph click
  const handleFocusNode = (nodeId: string | null) => {
    setFocusedNodeId(nodeId);
    if (nodeId) {
      setFocusDepth(2); // Reset depth range to default 2 hops when focusing a new node
      // Find node details to select it as well in details panel
      const targetNode = nodes.find(n => n.id === nodeId);
      if (targetNode) {
        setSelectedNode(targetNode);
      }
    } else {
      setSelectedNode(null);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex-col">
      
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-900 bg-slate-950/80 px-6 flex items-center justify-between glass z-20">
        <div className="flex items-center gap-4 text-left">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-900 border border-slate-850 px-3.5 py-2 rounded-xl transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <div className="h-6 w-[1px] bg-slate-800" />
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.3)]" />
            <div>
              <h1 className="font-extrabold text-sm text-slate-100 tracking-tight">
                {repo ? repo.name : 'Loading project...'}
              </h1>
              {repo && (
                <span className="text-[10px] text-slate-500 font-bold block max-w-[280px] truncate" title={repo.local_path}>
                  {repo.local_path}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sync Indicator */}
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-bold animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> Loading graph...
            </span>
          )}
          {focusedNodeId && (
            <span className="text-[10px] uppercase font-extrabold px-3 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full flex items-center gap-1.5 animate-pulse">
              Focus Active
            </span>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-2xl flex items-center gap-2.5 text-xs shadow-2xl glass max-w-md text-left">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="font-bold block">Explorer Error</span>
              <span className="font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* 1. Left Sidebar: Metrics, Search, Cycles */}
        <Sidebar
          repoId={repoId}
          onFocusNode={handleFocusNode}
          focusedNodeId={focusedNodeId}
          selectedNodeId={selectedNode ? selectedNode.id : null}
          graphNodes={nodes}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          focusDepth={focusDepth}
          setFocusDepth={setFocusDepth}
          highLevelView={highLevelView}
          repoMetrics={repoMetrics}
        />

        {/* 2. Center: React Flow Canvas */}
        <div className="flex-1 h-full relative">
          {showLoader && (
            <div 
              style={{ opacity: loaderOpacity }}
              className="absolute inset-0 bg-[#090a10] z-50 flex flex-col items-center justify-center gap-4 transition-opacity duration-500 pointer-events-none"
            >
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                <div className="absolute inset-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 animate-pulse flex items-center justify-center">
                  <Database className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs uppercase tracking-widest font-extrabold text-slate-400 animate-pulse">
                  Analyzing Codebase
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  Extracting symbols and building dependency graph...
                </span>
              </div>
            </div>
          )}

          {nodes.length === 0 && !loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 text-slate-400">
              <LayoutDashboard className="w-12 h-12 text-slate-800 mb-4 animate-bounce" />
              <p className="text-base font-bold mb-1 text-slate-300">Graph Not Generated</p>
              <p className="text-xs max-w-xs text-slate-500 leading-relaxed">
                We couldn't load any nodes. Try scanning or re-scanning the project repository from the dashboard!
              </p>
            </div>
          ) : (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              onSelectNode={setSelectedNode}
              selectedNodeId={selectedNode ? selectedNode.id : null}
              focusedNodeId={focusedNodeId}
              onFocusNode={handleFocusNode}
              loading={loading}
            />
          )}
        </div>

        {/* 3. Right Sidebar: Selected Node Details & Code Snippet */}
        {selectedNode && (
          <NodeDetails
            repoId={repoId}
            node={selectedNode}
            onFocusNode={handleFocusNode}
            onClose={() => {
              setSelectedNode(null);
              if (focusedNodeId) {
                handleFocusNode(null);
              }
            }}
          />
        )}
      </div>

      {/* 4. Repository AI Chatbot Widget */}
      <ChatWindow repoId={repoId} />
    </div>
  );
}
