// src/components/common/AuditLogPanel.tsx
import React from 'react';
import { Clock, Trash2, ShieldCheck } from 'lucide-react';
import type { AuditLog, UserRole } from '../../types/orbyte';

interface AuditLogPanelProps {
    logs: AuditLog[];
    role: UserRole;
    onClearLogs?: () => void;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ logs, role, onClearLogs }) => {
    return (
        <div className="bg-slate-900 text-slate-100 rounded-xl shadow-xs overflow-hidden border border-slate-800">
            <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        Step 5: Immutable Activity &amp; Audit Record (People Stay in Control)
                    </h4>
                </div>

                <div className="flex items-center gap-3 text-[11px]">
          <span className="text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Active Role:{' '}
              <strong className="text-white">{role}</strong> ({logs.length} events)
          </span>
                    {onClearLogs && logs.length > 0 && (
                        <button
                            type="button"
                            onClick={onClearLogs}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                        >
                            <Trash2 className="w-3 h-3" /> Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="max-h-36 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-900/90 sticky top-0">
                        <th className="py-1.5 px-4 w-24">Time</th>
                        <th className="py-1.5 px-3 w-44">Source Module</th>
                        <th className="py-1.5 px-3 w-36">Role Permission</th>
                        <th className="py-1.5 px-4">Recorded Action &amp; Visible Outcome</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono">
                    {logs.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="py-4 text-center text-slate-500 font-sans">
                                No actions recorded yet. Trigger an action above to see live audit logging.
                            </td>
                        </tr>
                    ) : (
                        logs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-800/40">
                                <td className="py-1.5 px-4 text-slate-400 whitespace-nowrap">{log.time}</td>
                                <td className="py-1.5 px-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-slate-800 text-emerald-300 rounded text-[10px] font-semibold">
                      {log.module}
                    </span>
                                </td>
                                <td className="py-1.5 px-3 whitespace-nowrap">
                    <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.role === 'SME_OWNER'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                    >
                      {log.role}
                    </span>
                                </td>
                                <td className="py-1.5 px-4 text-slate-200 font-sans">{log.detail}</td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};