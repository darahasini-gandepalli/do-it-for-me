import React, { useState } from 'react';
import { Plus, Sparkles, AlertCircle, Trash2, ArrowRight, CheckCircle2, ListTodo, Check, X, Bot } from 'lucide-react';
import type { UserTask } from '../types/index';

interface HomeScreenProps {
  tasks?: UserTask[];
  onSelectTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string, e?: React.MouseEvent) => void;
  onOpenCreateModal: () => void;
  onQuickCreate: (title: string) => Promise<void>;
  isCreating: boolean;
  hasTasks: boolean;
  aiChatMessage?: { query: string; message: string } | null;
  onClearAiChatMessage?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  tasks = [],
  onSelectTask,
  onDeleteTask,
  onOpenCreateModal,
  onQuickCreate,
  isCreating,
  hasTasks,
  aiChatMessage,
  onClearAiChatMessage,
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || isCreating) return;
    setError(null);
    try {
      await onQuickCreate(quickInput.trim());
      setQuickInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to create plan.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 text-center">
      {/* Title & Subtitle */}
      <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
        DO IT FOR ME
      </h1>
      <p className="mt-2 text-base text-slate-500 font-medium">
        Tell me what you need to get done.
      </p>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-8">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-200 shadow-sm focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5 transition-all text-left">
          <input
            type="text"
            value={quickInput}
            onChange={(e) => {
              setQuickInput(e.target.value);
              if (error) setError(null);
            }}
            disabled={isCreating}
            placeholder="What would you like done today? (e.g. Plan a Garba Night...)"
            className="flex-1 px-3 py-2 text-sm sm:text-base text-slate-900 placeholder-slate-400 bg-transparent border-none focus:outline-none"
          />

          <div className="flex items-center gap-1.5 justify-end">
            <button
              type="submit"
              disabled={!quickInput.trim() || isCreating}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white font-semibold text-xs hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {isCreating ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Planning...</span>
                </>
              ) : (
                <span>Create Task</span>
              )}
            </button>

            {/* Small + button */}
            <button
              type="button"
              onClick={onOpenCreateModal}
              title="Open task creation modal"
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}
      </form>

      {/* AI Assistant Chat / Greeting Response Card */}
      {aiChatMessage && (
        <div className="mt-6 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm text-left animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <Bot className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">AI Assistant</span>
                <span className="text-[10px] text-slate-400">Response to "{aiChatMessage.query}"</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearAiChatMessage}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap mt-2">
            {aiChatMessage.message}
          </p>

          {/* Quick Suggestions Chips */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Try a plan prompt:
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                'Plan a Garba Night',
                'Prepare for a job interview',
                'Organize a weekend hiking trip',
                'Set up a home office workspace',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onQuickCreate(suggestion)}
                  disabled={isCreating}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
                >
                  ✨ {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Existing Tasks List with Quick Deletion */}
      {hasTasks && tasks.length > 0 && (
        <div className="mt-12 text-left">
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Your Tasks ({tasks.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
            >
              + New Task
            </button>
          </div>

          <div className="space-y-2.5">
            {tasks.map((task) => {
              const completedCount = task.steps.filter((s) => s.completed).length;
              const totalCount = task.steps.length;
              const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

              return (
                <div
                  key={task.id}
                  className="group flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all"
                >
                  <div
                    onClick={() => onSelectTask?.(task.id)}
                    className="flex-1 min-w-0 pr-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {task.title}
                      </h3>
                      {percent === 100 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Done
                        </span>
                      )}
                    </div>

                    {task.summary && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                        {task.summary}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 max-w-xs bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            percent === 100 ? 'bg-emerald-500' : 'bg-slate-900'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                        {completedCount} / {totalCount} steps ({percent}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectTask?.(task.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <span>Open Plan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>

                    {confirmDeleteId === task.id ? (
                      <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask?.(task.id, e);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(task.id);
                        }}
                        title="Delete task"
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state when user has not created any task yet */}
      {!hasTasks && (
        <div className="mt-16 py-12 px-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-sm text-slate-400 font-medium">No tasks yet</p>
          <button
            onClick={onOpenCreateModal}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create your first task</span>
          </button>
        </div>
      )}
    </div>
  );
};
