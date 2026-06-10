'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, RefreshCw, Sparkles } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatWindowProps {
  repoId: string;
}

const API_BASE = 'http://localhost:8000/api';

export default function ChatWindow({ repoId }: ChatWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your AI repository assistant. Ask me anything about this codebase, such as "Where is user creation logic?" or "How is database access implemented?"'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      });

      if (!res.ok) throw new Error('Chat API returned an error');
      
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold p-4 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 group relative border border-cyan-400/30"
        >
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
          </span>
          <MessageSquare className="w-6 h-6 group-hover:rotate-6 transition-all" />
        </button>
      )}

      {/* Chat Drawer */}
      {isOpen && (
        <div className="w-[400px] h-[500px] bg-slate-950/85 border border-slate-900 rounded-3xl shadow-2xl flex flex-col glass overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          
          {/* Header */}
          <div className="p-4 bg-slate-950 border-b border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2 text-left">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-200">Repository AI Chat</h3>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Powered by Gemini</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-500 hover:text-slate-300 p-1.5 hover:bg-slate-900 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={idx}
                  className={`flex gap-2.5 max-w-[85%] text-left ${
                    isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-slate-900 ${
                      isAssistant ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' : 'bg-slate-900 border border-slate-800 text-slate-300'
                    }`}
                  >
                    {isAssistant ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed font-medium ${
                      isAssistant
                        ? 'bg-slate-900/40 border border-slate-900 text-slate-300'
                        : 'bg-cyan-500 text-slate-950 font-semibold'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
            
            {loading && (
              <div className="flex gap-2.5 max-w-[85%] text-left mr-auto">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-3 rounded-2xl text-xs bg-slate-900/40 border border-slate-900 text-slate-500 flex items-center gap-1.5 italic font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Gemini is analyzing codebase...
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-3 border-t border-slate-900 bg-slate-950 flex gap-2">
            <input
              type="text"
              placeholder="Ask about auth, database tables, order endpoints..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-slate-900/80 border border-slate-900 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200 placeholder-slate-600"
              disabled={loading}
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-800 text-slate-950 p-2.5 rounded-xl flex items-center justify-center cursor-pointer transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

        </div>
      )}

    </div>
  );
}
