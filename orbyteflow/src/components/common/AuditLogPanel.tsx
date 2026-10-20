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
        <div className="bg-slate-900 text-slate-100 p-5 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Vyte Immutable Activity &amp; Audit Log
                </h4>
                <span className="text-xs text-slate-400">Active Session Role: {role}</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto text-xs font-mono">
                {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 py-1 border-b border-slate-800">
                        <span className="text-slate-400">[{log.time}]</span>
                        <span className="px-2 py-0.5 bg-slate-800 text-emerald-300 rounded">{log.module}</span>
                        <span className="text-amber-300">({log.role})</span>
                        <span className="text-slate-200">{log.detail}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};