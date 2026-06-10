'use client';

import { useState, useEffect } from 'react';
import { Search, AlertTriangle, BarChart3, HelpCircle, Layers, Sliders, RefreshCw, X, FolderTree } from 'lucide-react';

interface SidebarProps {
  repoId: string;
  onFocusNode: (nodeId: string | null) => void;
  focusedNodeId: string | null;
  graphNodes: any[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  focusDepth: number;
  setFocusDepth: (depth: number) => void;
}

interface CyclesData {
  file_cycles: any[][];
  function_cycles: any[][];
  total_cycles_count: number;
}

const API_BASE = 'http://localhost:8000/api';

export default function Sidebar({
  repoId,
  onFocusNode,
  focusedNodeId,
  graphNodes,
  searchQuery,
  setSearchQuery,
  focusDepth,
  setFocusDepth
}: SidebarProps) {
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [cycles, setCycles] = useState<CyclesData | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'search' | 'cycles'>('info');

  // Load circular dependency warnings
  useEffect(() => {
    const fetchCycles = async () => {
      try {
        const res = await fetch(`${API_BASE}/repositories/${repoId}/cycles`);
        if (res.ok) {
          const data = await res.json();
          setCycles(data);
        }
      } catch (err) {
        console.error('Failed to fetch cycles:', err);
      }
    };
    fetchCycles();
  }, [repoId]);

  // Handle live search
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_BASE}/repositories/${repoId}/search?q=${searchQuery}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, repoId]);

  // Compute metrics from graphNodes
  const metrics = {
    files: graphNodes.filter((n) => n.type === 'file').length,
    classes: graphNodes.filter((n) => n.type === 'class').length,
    functions: graphNodes.filter((n) => n.type === 'function').length,
    apis: graphNodes.filter((n) => n.type === 'api').length,
    tables: graphNodes.filter((n) => n.type === 'table').length,
    dependencies: graphNodes.length
  };

  return (
    <div className="w-[380px] h-full bg-slate-950/80 border-r border-slate-900 flex flex-col glass z-10 relative">
      
      {/* Sidebar Tabs */}
      <div className="flex border-b border-slate-900">
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 py-3 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'info' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Metrics
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-3 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'search' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <Search className="w-3.5 h-3.5" /> Search
        </button>
        <button
          onClick={() => setActiveTab('cycles')}
          className={`flex-1 py-3 text-xs uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition-all cursor-pointer ${
            activeTab === 'cycles' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Cycles
          {cycles && cycles.total_cycles_count > 0 && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        
        {/* Tab 1: Info & Metrics */}
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider font-extrabold mb-3">
                Repository Metrics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Files</span>
                  <span className="text-2xl font-bold text-slate-200">{metrics.files}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Classes</span>
                  <span className="text-2xl font-bold text-cyan-400">{metrics.classes}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Functions</span>
                  <span className="text-2xl font-bold text-violet-400">{metrics.functions}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-extrabold block">API Endpoints</span>
                  <span className="text-2xl font-bold text-rose-400">{metrics.apis}</span>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-900 col-span-2">
                  <span className="text-[10px] text-slate-500 uppercase font-extrabold block">Database Tables</span>
                  <span className="text-xl font-bold text-teal-400">{metrics.tables} Tables Scanned</span>
                </div>
              </div>
            </div>

            {/* Focus Controls */}
            <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-900 space-y-4">
              <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-cyan-400" /> Focus Controller
              </h4>
              
              {focusedNodeId ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-semibold">Depth Range:</span>
                    <span className="text-xs text-cyan-400 font-extrabold">{focusDepth} hop(s)</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={focusDepth}
                    onChange={(e) => setFocusDepth(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <button
                    onClick={() => onFocusNode(null)}
                    className="w-full bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Clear Focus Mode
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Click any node on the graph and use Focus Mode to filter the view to its surrounding dependencies.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Search */}
        {activeTab === 'search' && (
          <div className="space-y-4 flex flex-col h-full">
            <div className="relative">
              <input
                type="text"
                placeholder="Search functions, classes, tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-900 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200"
              />
              <Search className="w-4 h-4 text-slate-600 absolute left-3 top-2.5" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {searching ? (
                <div className="text-center py-8 text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Searching codebase...
                </div>
              ) : searchResults.length === 0 ? (
                searchQuery ? (
                  <div className="text-center py-8 text-xs text-slate-600">
                    No matching code symbols found.
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-600 italic">
                    Type a symbol name to search.
                  </div>
                )
              ) : (
                searchResults.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => onFocusNode(node.id)}
                    className="w-full text-left p-3 rounded-xl border border-slate-900 bg-slate-900/30 hover:bg-slate-900/60 hover:border-slate-800 transition-all flex flex-col gap-1 group cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-xs text-slate-200 group-hover:text-cyan-400 truncate">
                        {node.name}
                      </span>
                      <span className="text-[9px] uppercase font-bold text-slate-500 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-900">
                        {node.type}
                      </span>
                    </div>
                    {node.file_path && (
                      <span className="text-[10px] text-slate-500 truncate">
                        {node.file_path}:{node.start_line}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Cycles */}
        {activeTab === 'cycles' && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold text-rose-400 uppercase tracking-wider mb-1">
                  Circular Dependency Warnings
                </h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Imports or function calls that form circular loops. Cycles degrade architecture modularity and should be resolved.
                </p>
              </div>
            </div>

            {cycles && cycles.total_cycles_count === 0 ? (
              <div className="text-center py-12 text-xs text-teal-400 font-bold border border-teal-500/20 bg-teal-500/5 rounded-2xl">
                ✓ No circular dependencies detected!
              </div>
            ) : cycles ? (
              <div className="space-y-6">
                {/* File Cycles */}
                {cycles.file_cycles.length > 0 && (
                  <div>
                    <h5 className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 mb-2.5">
                      File Import Cycles ({cycles.file_cycles.length})
                    </h5>
                    <div className="space-y-2">
                      {cycles.file_cycles.map((cycle, idx) => (
                        <div key={idx} className="p-3 bg-slate-900/60 border border-slate-900 rounded-xl space-y-1">
                          <span className="text-[9px] font-extrabold text-rose-400 uppercase">Cycle #{idx + 1}</span>
                          <div className="text-xs text-slate-300 font-semibold space-y-1">
                            {cycle.map((node, nIdx) => (
                              <button
                                key={node.id}
                                onClick={() => onFocusNode(node.id)}
                                className="block text-left text-[11px] text-slate-400 hover:text-cyan-400 truncate w-full"
                              >
                                {nIdx + 1}. {node.name} <span className="text-[9px] text-slate-600">({node.file_path})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Function Cycles */}
                {cycles.function_cycles.length > 0 && (
                  <div>
                    <h5 className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 mb-2.5">
                      Function Call Loops ({cycles.function_cycles.length})
                    </h5>
                    <div className="space-y-2">
                      {cycles.function_cycles.map((cycle, idx) => (
                        <div key={idx} className="p-3 bg-slate-900/60 border border-slate-900 rounded-xl space-y-1">
                          <span className="text-[9px] font-extrabold text-amber-400 uppercase">Loop #{idx + 1}</span>
                          <div className="text-xs text-slate-300 font-semibold space-y-1">
                            {cycle.map((node, nIdx) => (
                              <button
                                key={node.id}
                                onClick={() => onFocusNode(node.id)}
                                className="block text-left text-[11px] text-slate-400 hover:text-cyan-400 truncate w-full"
                              >
                                {nIdx + 1}. {node.name}() <span className="text-[9px] text-slate-600">({node.file_path})</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-600 flex items-center justify-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing architecture...
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
