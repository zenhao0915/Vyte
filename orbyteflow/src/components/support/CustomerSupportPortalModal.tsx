// src/components/support/CustomerSupportPortalModal.tsx
import React, { useState, useEffect } from 'react';
import {
    Headset,
    MessageSquare,
    Wrench,
    CheckCircle2,
    Clock,
    ShieldCheck,
    Send,
    X,
    Activity,
    PhoneCall,
    Sparkles,
} from 'lucide-react';
import type { SupportTicket, UserSession } from '../../types/vyte.ts';
import { INITIAL_SUPPORT_TICKETS } from '../../data/mockData';

interface CustomerSupportPortalModalProps {
    isOpen: boolean;
    onClose: () => void;
    userSession: UserSession | null;
    onLogAction: (module: string, detail: string) => void;
    onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

const SUPPORT_TICKETS_KEY = 'vyte_after_sales_tickets_v2';

export const CustomerSupportPortalModal: React.FC<CustomerSupportPortalModalProps> = ({
                                                                                          isOpen,
                                                                                          onClose,
                                                                                          userSession,
                                                                                          onLogAction,
                                                                                          onNotify,
                                                                                      }) => {
    const [tickets, setTickets] = useState<SupportTicket[]>(() => {
        try {
            const raw = localStorage.getItem(SUPPORT_TICKETS_KEY);
            return raw ? JSON.parse(raw) : INITIAL_SUPPORT_TICKETS;
        } catch {
            return INITIAL_SUPPORT_TICKETS;
        }
    });

    const [subject, setSubject] = useState('');
    const [category, setCategory] = useState<SupportTicket['category']>('HARDWARE_SCANNER');
    const [priority, setPriority] = useState<SupportTicket['priority']>('HIGH');
    const [details, setDetails] = useState('');

    useEffect(() => {
        localStorage.setItem(SUPPORT_TICKETS_KEY, JSON.stringify(tickets));
    }, [tickets]);

    if (!isOpen) return null;

    const handleCreateTicket = (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim()) return;

        const newTicket: SupportTicket = {
            ticketId: `SRV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
            subject: subject.trim(),
            category,
            priority,
            status: 'OPEN_ASSIGNED',
            createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            assignedEngineer:
                category === 'HARDWARE_SCANNER' || category === 'ON_SITE_MAINTENANCE'
                    ? 'Aiman Razak (Field Engineer)'
                    : 'Jason Lim (Support Specialist)',
            resolutionNote:
                details.trim() ||
                'Ticket logged. An assigned engineer will contact you shortly.',
        };

        setTickets((prev) => [newTicket, ...prev]);
        onLogAction(
            'Technical Support',
            `Submitted support ticket ${newTicket.ticketId} (${newTicket.subject}) [${newTicket.priority}].`
        );
        onNotify(
            'success',
            `Ticket ${newTicket.ticketId} assigned to ${newTicket.assignedEngineer}.`
        );
        setSubject('');
        setDetails('');
    };

    const handleOpenWhatsAppSupport = () => {
        const msg = `Hi Support Team, I need assistance for workspace "${
            userSession?.companyName || 'Vyte SME'
        }" (User: ${userSession?.userName || 'Owner'} / ID: ${
            userSession?.userID || 'M067'
        }). Issue: ${subject || 'Technical Support'}`;
        window.open(
            `https://wa.me/60123456789?text=${encodeURIComponent(msg)}`,
            '_blank',
            'noopener,noreferrer'
        );
        onLogAction(
            'Technical Support',
            'Initiated WhatsApp support conversation.'
        );
    };

    return (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#2BB656] flex items-center justify-center">
                            <Headset className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-slate-900">
                                    Support &amp; Maintenance Portal
                                </h3>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    All Systems Operational
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Direct assistance for hardware setup, data synchronization, and platform operations.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* 3 Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5" /> System Status
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                Operational
                            </span>
                        </div>
                        <p className="font-bold text-xs pt-1">Inventory &amp; Order Services: Online</p>
                        <p className="text-[11px] text-slate-400">
                            Scheduled Backup: Sunday at 03:00 AM
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                        <div>
                            <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Live WhatsApp Support
                            </p>
                            <p className="text-[11px] text-emerald-800 mt-0.5">
                                Average response time: <strong>&lt; 15 mins</strong>
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleOpenWhatsAppSupport}
                            className="mt-2.5 w-full py-1.5 px-3 bg-[#25D366] hover:bg-[#1fb858] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
                        >
                            <PhoneCall className="w-3.5 h-3.5" /> Start WhatsApp Chat
                        </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col justify-between">
                        <div>
                            <p className="font-bold text-blue-950 flex items-center gap-1.5">
                                <Wrench className="w-3.5 h-3.5 text-blue-600" /> System Diagnostics
                            </p>
                            <p className="text-[11px] text-blue-800 mt-0.5">
                                Run self-checks on catalog sync, thresholds, and integrations.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                onLogAction(
                                    'Technical Support',
                                    'Ran automated system diagnostics.'
                                );
                                onNotify(
                                    'info',
                                    'Diagnostics complete: All services and connectors are healthy.'
                                );
                            }}
                            className="mt-2.5 w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Run Diagnostics
                        </button>
                    </div>
                </div>

                {/* Ticket Form */}
                <form
                    onSubmit={handleCreateTicket}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
                >
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-emerald-600" /> Submit Support Ticket
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                <option value="HARDWARE_SCANNER">Hardware &amp; Scanner</option>
                                <option value="INVENTORY_ENGINE">Inventory &amp; Automation</option>
                                <option value="DATA_MIGRATION">Data Import &amp; Migration</option>
                                <option value="ON_SITE_MAINTENANCE">On-Site Technical Visit</option>
                            </select>
                        </div>

                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                <option value="URGENT_SLA">Urgent (&lt; 15m response)</option>
                                <option value="HIGH">High (Same-day response)</option>
                                <option value="NORMAL">Standard (Scheduled)</option>
                            </select>
                        </div>

                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">Subject *</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Scanner calibration issue"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <input
                            type="text"
                            placeholder="Additional details, error messages, or contact preference (optional)..."
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                        >
                            <Send className="w-3.5 h-3.5" /> Submit Ticket
                        </button>
                    </div>
                </form>

                {/* Ticket History */}
                <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Recent Support Tickets ({tickets.length})
                    </h4>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {tickets.map((t) => (
                            <div
                                key={t.ticketId}
                                className="p-3 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                                <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                            {t.ticketId}
                                        </span>
                                        <span className="font-bold text-slate-900">{t.subject}</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                                            {t.category.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500">
                                        Assigned: <strong>{t.assignedEngineer}</strong> • {t.resolutionNote}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {t.status === 'RESOLVED' ? (
                                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Resolved
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setTickets((prev) =>
                                                    prev.map((x) =>
                                                        x.ticketId === t.ticketId ? { ...x, status: 'RESOLVED' } : x
                                                    )
                                                )
                                            }
                                            className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-emerald-100 text-amber-900 hover:text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer transition"
                                        >
                                            <Clock className="w-3 h-3" /> In Progress (Mark Resolved)
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Included in your subscription: Automated cloud backups and 24/7 technical support.
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};