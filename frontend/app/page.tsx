'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { GitBranch, Folder, Play, Trash2, ArrowRight, Activity, Search, RefreshCw, Layers } from 'lucide-react';

interface Repository {
  id: string;
  name: string;
  url: string | null;
  local_path: string;
  created_at: string;
}

interface Scan {
  id: string;
  repository_id: string;
  status: string;
  error_message: string | null;
}

const API_BASE = 'http://localhost:8000/api';

export default function Dashboard() {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [scans, setScans] = useState<Record<string, Scan>>({});
  const [urlOrPath, setUrlOrPath] = useState('');
  const [repoName, setRepoName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch repositories and their latest scans
  const fetchData = async () => {
    try {
      const res = await fetch(`${API_BASE}/repositories`);
      if (!res.ok) throw new Error('Failed to fetch repositories');
      const data: Repository[] = await res.json();
      setRepos(data);

      // Fetch scans for each repo
      for (const repo of data) {
        fetchLatestScan(repo.id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchLatestScan = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/scans`);
      if (res.ok) {
        const data: Scan[] = await res.json();
        if (data.length > 0) {
          setScans((prev) => ({ ...prev, [repoId]: data[0] }));
        }
      }
    } catch (err) {
      console.error(`Error fetching scans for ${repoId}:`, err);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll for scan statuses every 3 seconds
    const interval = setInterval(() => {
      repos.forEach(repo => fetchLatestScan(repo.id));
    }, 3000);
    return () => clearInterval(interval);
  }, [repos.length]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlOrPath) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: repoName || null,
          url_or_path: urlOrPath,
        }),
      });

      if (!res.ok) {
        const detail = await res.json();
        throw new Error(detail.detail || 'Failed to import repository');
      }

      const newRepo = await res.json();
      setUrlOrPath('');
      setRepoName('');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerScan = async (repoId: string) => {
    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/scan`, {
        method: 'POST',
      });
      if (res.ok) {
        const scanData = await res.json();
        setScans((prev) => ({ ...prev, [repoId]: scanData }));
      }
    } catch (err: any) {
      alert(`Failed to trigger scan: ${err.message}`);
    }
  };

  const handleDeleteRepo = async (repoId: string) => {
    if (!confirm('Are you sure you want to delete this repository and all its graph index data?')) return;
    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRepos(repos.filter((r) => r.id !== repoId));
        setScans((prev) => {
          const next = { ...prev };
          delete next[repoId];
          return next;
        });
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <main className="flex-1 min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-zinc-950 to-black p-8 text-slate-100 flex flex-col items-center">
      
      {/* Title Header */}
      <div className="w-full max-w-5xl mb-12 text-center relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="flex items-center justify-center gap-3 mb-2">
          <Layers className="w-10 h-10 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-400 to-rose-400 bg-clip-text text-transparent">
            repo-to-graph
          </h1>
        </div>
        <p className="text-slate-400 text-lg md:text-xl font-medium max-w-xl mx-auto">
          Static code analysis and interactive dependency graph mapping for Python, Javascript, and TypeScript codebases.
        </p>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        
        {/* Left column: Import Form */}
        <div className="md:col-span-1 glass p-6 rounded-2xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-indigo-500/5 blur-[50px] rounded-full pointer-events-none" />
          
          <h2 className="text-xl font-bold mb-4 text-cyan-300 flex items-center gap-2">
            <GitBranch className="w-5 h-5" /> Import Repository
          </h2>
          
          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 font-bold">
                Repo Path or Git URL
              </label>
              <input
                type="text"
                placeholder="e.g. /local/path or https://github.com..."
                value={urlOrPath}
                onChange={(e) => setUrlOrPath(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400 transition-all text-slate-200 placeholder-slate-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 font-bold">
                Project Display Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. My Backend API"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-400 transition-all text-slate-200 placeholder-slate-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-800 text-slate-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg hover:shadow-cyan-500/20"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Importing...
                </>
              ) : (
                <>
                  Import Project <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Right column: Repository Grid List */}
        <div className="md:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
              <Folder className="w-5 h-5 text-indigo-400" /> Tracked Repositories
            </h2>
            <span className="text-xs px-2.5 py-1 bg-slate-900 border border-slate-800 text-slate-400 rounded-full font-semibold">
              {repos.length} Total
            </span>
          </div>

          {repos.length === 0 ? (
            <div className="glass p-12 rounded-2xl border border-slate-800/80 text-center flex flex-col items-center justify-center text-slate-400">
              <Layers className="w-12 h-12 text-slate-700 mb-4 animate-pulse" />
              <p className="text-lg font-bold mb-1 text-slate-300">No repositories registered yet.</p>
              <p className="text-sm max-w-xs text-slate-500">Provide a local directory path or remote Git URL in the sidebar to start parsing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {repos.map((repo) => {
                const scan = scans[repo.id];
                const isScanning = scan?.status === 'scanning' || scan?.status === 'pending';
                const isCompleted = scan?.status === 'completed';
                const isFailed = scan?.status === 'failed';

                return (
                  <div
                    key={repo.id}
                    className="glass-interactive p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-extrabold text-lg text-slate-200 tracking-tight line-clamp-1">
                          {repo.name}
                        </h3>
                        
                        {/* Scan status pill */}
                        <span
                          className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full border ${
                            isScanning
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                              : isCompleted
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                              : isFailed
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-slate-800/30 text-slate-400 border-slate-800'
                          }`}
                        >
                          {scan?.status || 'No Scan'}
                        </span>
                      </div>

                      {repo.url && (
                        <p className="text-xs text-slate-400 mb-2 truncate">
                          <span className="font-semibold text-slate-500">Source:</span> {repo.url}
                        </p>
                      )}
                      
                      <p className="text-xs text-slate-500 mb-4 truncate" title={repo.local_path}>
                        <span className="font-semibold text-slate-600">Local Path:</span> {repo.local_path}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900 pt-4 mt-2 gap-2">
                      <button
                        onClick={() => handleDeleteRepo(repo.id)}
                        className="text-slate-500 hover:text-rose-400 p-2 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                        title="Delete Repository"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-2">
                        {/* Scan / Re-scan button */}
                        <button
                          onClick={() => handleTriggerScan(repo.id)}
                          disabled={isScanning}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isScanning
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <Play className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                          {isCompleted ? 'Rescan' : isScanning ? 'Parsing' : 'Scan Code'}
                        </button>

                        {/* Explore Graph page Link */}
                        <Link
                          href={isCompleted ? `/repo/${repo.id}` : '#'}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                            isCompleted
                              ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold shadow-md shadow-cyan-500/10'
                              : 'bg-slate-900/40 text-slate-600 border border-slate-800/30 cursor-not-allowed'
                          }`}
                          onClick={(e) => {
                            if (!isCompleted) e.preventDefault();
                          }}
                        >
                          <Activity className="w-3.5 h-3.5" /> Explore
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
