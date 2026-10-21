// src/components/common/AuditLogPanel.tsx
import React from 'react';
import { Clock } from 'lucide-react';
import type { AuditLog, UserRole } from '../../types/orbyte';

interface AuditLogPanelProps {
    logs: AuditLog[];
    role: UserRole;
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ logs, role }) => {
    return (
        <div className="bg-slate-900 text-slate-100 px-4 py-3 rounded-xl shadow-xs">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Step 5: Immutable Activity &amp; Audit Record (People Stay in Control)
                </h4>
                <span className="text-[11px] text-slate-400">
          Active Role: <strong className="text-white">{role}</strong> ({logs.length} events recorded)
        </span>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto text-[11px] font-mono">
                {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2.5 py-0.5 border-b border-slate-800/80">
                        <span className="text-slate-400 shrink-0">[{log.time}]</span>
                        <span className="px-1.5 py-0.2 bg-slate-800 text-emerald-300 rounded shrink-0">{log.module}</span>
                        <span className="text-amber-300 shrink-0">({log.role})</span>
                        <span className="text-slate-200 truncate">{log.detail}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};