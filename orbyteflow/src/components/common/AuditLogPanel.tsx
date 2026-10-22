// src/components/common/AuditLogPanel.tsx
import React, { useState, useMemo } from 'react';
import { Clock, Trash2, ShieldCheck, Search } from 'lucide-react';
import type { AuditLog, UserRole } from '../../types/vyte.ts';

interface AuditLogPanelProps {
    logs: AuditLog[];
    role: UserRole;
    onClearLogs?: () => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({
                                                                logs,
                                                                role,
                                                                onClearLogs,
                                                            }) => {
    const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            const matchRole = roleFilter === 'ALL' || log.role === roleFilter;
            const q = searchQuery.trim().toLowerCase();
            const matchQuery =
                !q ||
                log.module.toLowerCase().includes(q) ||
                log.detail.toLowerCase().includes(q) ||
                log.time.toLowerCase().includes(q);
            return matchRole && matchQuery;
        });
    }, [logs, roleFilter, searchQuery]);

    return (
        <div className="h-full flex flex-col space-y-3 min-h-[calc(100vh-140px)] select-none">
            {/* Top Filter Tabs & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/80 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setRoleFilter('ALL')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                            roleFilter === 'ALL'
                                ? 'bg-white text-slate-900 font-bold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        All Events ({logs.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setRoleFilter('SME_OWNER')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                            roleFilter === 'SME_OWNER'
                                ? 'bg-emerald-100 text-emerald-900 font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Owner ({logs.filter((l) => l.role === 'SME_OWNER').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setRoleFilter('MANAGER')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                            roleFilter === 'MANAGER'
                                ? 'bg-blue-100 text-blue-900 font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Manager ({logs.filter((l) => l.role === 'MANAGER').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setRoleFilter('OPERATIONS_STAFF')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                            roleFilter === 'OPERATIONS_STAFF'
                                ? 'bg-amber-100 text-amber-900 font-bold'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        Ops Staff ({logs.filter((l) => l.role === 'OPERATIONS_STAFF').length})
                    </button>
                </div>

                <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                        type="text"
                        placeholder="Search module, action or time..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-2xs"
                    />
                </div>
            </div>

            {/* Full-Page History Log Card */}
            <div className="flex-1 min-h-0 flex flex-col bg-slate-900 text-slate-100 rounded-2xl shadow-sm overflow-hidden border border-slate-800">
                <div className="px-6 py-4 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                            <Clock className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                            History Log
                        </h3>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Active Role:{' '}
                            <strong className="text-white">{role}</strong> ({filteredLogs.length}{' '}
                            recorded events)
                        </span>
                        {onClearLogs && logs.length > 0 && (
                            <button
                                type="button"
                                onClick={onClearLogs}
                                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Clear History
                            </button>
                        )}
                    </div>
                </div>

                {/* Table stretches to fill the entire remaining height of the page */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/90 sticky top-0 z-10 backdrop-blur-xs">
                            <th className="py-3 px-6 w-32">Time</th>
                            <th className="py-3 px-5 w-52">Source Module</th>
                            <th className="py-3 px-5 w-44">Role Permission</th>
                            <th className="py-3 px-6">Recorded Action &amp; Visible Outcome</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono">
                        {filteredLogs.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="py-24 text-center text-slate-500 font-sans"
                                >
                                    No history log entries match your filter.
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-800/40 transition">
                                    <td className="py-3 px-6 text-slate-400 whitespace-nowrap">
                                        {log.time}
                                    </td>
                                    <td className="py-3 px-5 whitespace-nowrap">
                                            <span className="px-2.5 py-1 bg-slate-800 text-emerald-300 rounded-md text-[11px] font-semibold border border-slate-700/60">
                                                {log.module}
                                            </span>
                                    </td>
                                    <td className="py-3 px-5 whitespace-nowrap">
                                            <span
                                                className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                                    log.role === 'SME_OWNER'
                                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                                        : log.role === 'MANAGER'
                                                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                                                }`}
                                            >
                                                {log.role}
                                            </span>
                                    </td>
                                    <td className="py-3 px-6 text-slate-200 font-sans leading-relaxed">
                                        {log.detail}
                                    </td>
                                </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};