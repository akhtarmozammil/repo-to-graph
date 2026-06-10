'use client';

import { useState, useEffect } from 'react';
import { Play, Sparkles, X, Code, FileText, Share2, HelpCircle, Layers, RefreshCw } from 'lucide-react';

interface NodeDetailsProps {
  repoId: string;
  node: {
    id: string;
    name: string;
    type: string;
    file_path?: string;
    start_line?: number;
    end_line?: number;
    properties?: any;
  } | null;
  onClose: () => void;
}

interface ImpactData {
  metrics: {
    affected_files_count: number;
    affected_classes_count: number;
    affected_functions_count: number;
    impact_score: number;
  };
  upstream: any[];
  downstream: any[];
}

const API_BASE = 'http://localhost:8000/api';

export default function NodeDetails({ repoId, node, onClose }: NodeDetailsProps) {
  const [fileContent, setFileContent] = useState<string>('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);

  // Load Source Code & Impact Analysis when node changes
  useEffect(() => {
    if (!node) return;

    setFileContent('');
    setAiExplanation('');
    setImpact(null);

    // Fetch Impact Analysis
    const fetchImpact = async () => {
      setImpactLoading(true);
      try {
        const res = await fetch(`${API_BASE}/repositories/${repoId}/impact?node_id=${node.id}`);
        if (res.ok) {
          const data = await res.json();
          setImpact(data);
        }
      } catch (err) {
        console.error('Impact analysis fetch failed:', err);
      } finally {
        setImpactLoading(false);
      }
    };
    fetchImpact();

    // Fetch File Content if it is a file/class/function/api with a file_path
    if (node.file_path) {
      const fetchFile = async () => {
        setSourceLoading(true);
        try {
          const res = await fetch(`${API_BASE}/repositories/${repoId}/file-content?file_path=${node.file_path}`);
          if (res.ok) {
            const data = await res.json();
            
            // Slice to snippet if start/end line are present
            if (node.start_line && node.end_line) {
              const lines = data.content.split('\n');
              const snippet = lines.slice(Math.max(0, node.start_line - 5), Math.min(lines.length, node.end_line + 5)); // add a few context lines
              setFileContent(snippet.join('\n'));
            } else {
              setFileContent(data.content);
            }
          }
        } catch (err) {
          console.error('File content fetch failed:', err);
        } finally {
          setSourceLoading(false);
        }
      };
      fetchFile();
    }
  }, [node, repoId]);

  const handleAskAI = async () => {
    if (!node) return;
    setAiLoading(true);
    setAiExplanation('');
    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/explain?node_id=${node.id}`);
      if (res.ok) {
        const data = await res.json();
        setAiExplanation(data.explanation);
      } else {
        throw new Error('AI Explanations error');
      }
    } catch (err: any) {
      setAiExplanation(`Failed to retrieve AI explanation: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (!node) return null;

  return (
    <div className="w-[450px] h-full bg-slate-950/85 border-l border-slate-900 flex flex-col glass z-10">
      
      {/* Title & Close Header */}
      <div className="p-4 border-b border-slate-900 flex items-center justify-between">
        <div className="flex flex-col text-left">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-cyan-400">
            Node Inspector ({node.type})
          </span>
          <h2 className="text-base font-bold text-slate-100 truncate max-w-[320px]" title={node.name}>
            {node.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-300 p-1.5 hover:bg-slate-900 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {/* Basic Properties */}
        <div className="space-y-2.5">
          {node.file_path && (
            <div className="bg-slate-900/40 p-3.5 rounded-2xl border border-slate-900 text-xs">
              <span className="text-slate-500 font-semibold block mb-1">Declared in:</span>
              <span className="font-mono text-slate-300 break-all">{node.file_path}</span>
              {node.start_line && (
                <span className="text-slate-500 block mt-1">
                  Lines {node.start_line} – {node.end_line}
                </span>
              )}
            </div>
          )}
        </div>

        {/* AI Explanations */}
        <div className="space-y-3">
          <button
            onClick={handleAskAI}
            disabled={aiLoading}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-800 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg hover:shadow-cyan-500/10 text-xs"
          >
            <Sparkles className="w-4 h-4" /> 
            {aiLoading ? 'Asking Gemini AI...' : 'Explain with Gemini AI'}
          </button>

          {(aiExplanation || aiLoading) && (
            <div className="p-4 bg-slate-900/60 border border-slate-900 rounded-2xl text-xs text-slate-300 leading-relaxed text-left max-h-[200px] overflow-y-auto">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-slate-500 italic">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Thinking...
                </div>
              ) : (
                <div className="whitespace-pre-line font-medium text-slate-300">{aiExplanation}</div>
              )}
            </div>
          )}
        </div>

        {/* Impact Analysis Details */}
        <div className="space-y-3">
          <h3 className="text-slate-400 text-xs uppercase tracking-wider font-extrabold flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-violet-400" /> Impact Analysis
          </h3>

          {impactLoading ? (
            <div className="text-center py-4 text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing blast radius...
            </div>
          ) : impact ? (
            <div className="space-y-3">
              {/* Score card */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-900">
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Affected Files</span>
                  <span className="text-sm font-extrabold text-slate-200">{impact.metrics.affected_files_count}</span>
                </div>
                <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-900">
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Classes</span>
                  <span className="text-sm font-extrabold text-cyan-400">{impact.metrics.affected_classes_count}</span>
                </div>
                <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-900">
                  <span className="text-[9px] text-slate-500 uppercase block font-bold">Functions</span>
                  <span className="text-sm font-extrabold text-violet-400">{impact.metrics.affected_functions_count}</span>
                </div>
              </div>
              
              <div className="bg-slate-900/30 px-4 py-3 rounded-2xl border border-slate-900 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold">Refactoring Impact Score:</span>
                <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded border ${
                  impact.metrics.impact_score > 30 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                    : impact.metrics.impact_score > 10 
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                    : 'bg-teal-500/10 text-teal-400 border-teal-500/30'
                }`}>
                  {impact.metrics.impact_score} (
                  {impact.metrics.impact_score > 30 ? 'High' : impact.metrics.impact_score > 10 ? 'Medium' : 'Low'}
                  )
                </span>
              </div>

              {/* Upstream / Downstream lists */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[9px] uppercase font-extrabold text-slate-500 block mb-1.5">Upstream (Who calls this?)</span>
                  <div className="max-h-[100px] overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-900">
                    {impact.upstream.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block">None</span>
                    ) : (
                      impact.upstream.map((u) => (
                        <span key={u.id} className="text-[10px] text-slate-400 truncate block font-medium" title={u.name}>
                          {u.name}()
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] uppercase font-extrabold text-slate-500 block mb-1.5">Downstream (Who I call)</span>
                  <div className="max-h-[100px] overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-900">
                    {impact.downstream.length === 0 ? (
                      <span className="text-[10px] text-slate-600 italic block">None</span>
                    ) : (
                      impact.downstream.map((d) => (
                        <span key={d.id} className="text-[10px] text-slate-400 truncate block font-medium" title={d.name}>
                          {d.name}()
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Source Code Snippet Viewer */}
        {node.file_path && (
          <div className="space-y-3 flex flex-col">
            <h3 className="text-slate-400 text-xs uppercase tracking-wider font-extrabold flex items-center gap-1.5">
              <Code className="w-4 h-4 text-cyan-400" /> Code Viewer
            </h3>

            <div className="relative border border-slate-900 rounded-2xl overflow-hidden bg-slate-950 text-left">
              <div className="absolute top-2 right-2 text-[9px] uppercase font-bold text-slate-600 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
                {node.file_path.split('.').pop() || 'code'}
              </div>

              {sourceLoading ? (
                <div className="p-8 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading source snippet...
                </div>
              ) : fileContent ? (
                <pre className="p-4 overflow-x-auto text-[11px] font-mono leading-relaxed text-slate-300 max-h-[300px]">
                  <code>{fileContent}</code>
                </pre>
              ) : (
                <div className="p-8 text-center text-xs text-slate-600 italic">
                  Source code not available for this node.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
