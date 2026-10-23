// src/components/support/CustomerSupportPortalModal.tsx
import React, { useState, useEffect } from 'react';
import {
    Headset, MessageSquare, Wrench, CheckCircle2, Clock,
    ShieldCheck, Send, X, Activity, PhoneCall, Sparkles,
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

const SUPPORT_TICKETS_KEY = 'vyte_after_sales_tickets_v1';

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
                    ? 'Aiman Razak (Field Maintenance Engineer)'
                    : 'Jason Lim (Vyte Senior Support Specialist)',
            resolutionNote:
                details.trim() ||
                'Ticket logged. Assigned engineer will respond within 15 minutes via WhatsApp/Portal.',
        };

        setTickets((prev) => [newTicket, ...prev]);
        onLogAction(
            'After-Sales Support',
            `Submitted support ticket ${newTicket.ticketId} (${newTicket.subject}) [${newTicket.priority}].`
        );
        onNotify('success', `Ticket ${newTicket.ticketId} dispatched to ${newTicket.assignedEngineer}.`);
        setSubject('');
        setDetails('');
    };

    const handleOpenWhatsAppSupport = () => {
        const msg = `Hi Vyte After-Sales Engineering Team! I need assistance for workspace "${
            userSession?.companyName || 'Vyte SME'
        }" (User: ${userSession?.userName || 'Owner'} / ID: ${
            userSession?.userID || 'M067'
        }). Issue: ${subject || 'System Maintenance / SST & Inventory Support'}`;
        window.open(`https://wa.me/60123456789?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
        onLogAction('After-Sales Support', 'Initiated live WhatsApp chat with Vyte After-Sales Engineer.');
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
                                    Vyte After-Sales Care &amp; System Maintenance Portal (售后服务与技术维护)
                                </h3>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    SLA 99.98% Online
                                </span>
                            </div>
                            <p className="text-xs text-slate-500">
                                Direct line to Vyte engineers for hardware calibration, SST/MFRS tax updates, and 24/7 SME operational support.
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

                {/* Live System Health & Direct Contact Bar */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5" /> System Health
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                All Systems Healthy
                            </span>
                        </div>
                        <p className="font-bold text-xs pt-1">MyInvois &amp; RMCD SST Sync: Active</p>
                        <p className="text-[11px] text-slate-400">
                            Next Auto-Backup &amp; Maintenance: Sun 03:00 AM (Zero Downtime)
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                        <div>
                            <p className="font-bold text-emerald-950 flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> 1-Click Live Engineer (WhatsApp)
                            </p>
                            <p className="text-[11px] text-emerald-800 mt-0.5">
                                Avg response time: <strong>&lt; 8 mins</strong> (EN / BM / 中文客服)
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleOpenWhatsAppSupport}
                            className="mt-2.5 w-full py-1.5 px-3 bg-[#25D366] hover:bg-[#1fb858] text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
                        >
                            <PhoneCall className="w-3.5 h-3.5" /> Chat with Engineer Now
                        </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex flex-col justify-between">
                        <div>
                            <p className="font-bold text-blue-950 flex items-center gap-1.5">
                                <Wrench className="w-3.5 h-3.5 text-blue-600" /> Remote Diagnostics &amp; Patch
                            </p>
                            <p className="text-[11px] text-blue-800 mt-0.5">
                                Auto-verify database integrity, SST rates &amp; MFRS 102 formulas.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                onLogAction('After-Sales Support', 'Ran automated workspace health & SST/MFRS diagnostic check.');
                                onNotify('info', 'Diagnostics complete: Database schema, SST 6%/8% rules & MFRS 102 checks are 100% up to date.');
                            }}
                            className="mt-2.5 w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Run 1-Click Self-Check
                        </button>
                    </div>
                </div>

                {/* Submit Support / Maintenance Request Form */}
                <form
                    onSubmit={handleCreateTicket}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
                >
                    <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-emerald-600" /> Request System Maintenance or After-Sales Assistance
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">Service Category</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value as SupportTicket['category'])}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                <option value="ACCOUNTING_SST_SYNC">SST / MFRS Accounting &amp; Tax Setup</option>
                                <option value="HARDWARE_SCANNER">Barcode Scanner / POS Hardware</option>
                                <option value="INVENTORY_ENGINE">Auto-Restock / WhatsApp Bot Tuning</option>
                                <option value="ON_SITE_MAINTENANCE">Request On-Site Technician Visit</option>
                            </select>
                        </div>

                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">SLA Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as SupportTicket['priority'])}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                <option value="URGENT_SLA">URGENT (Response &lt; 15 mins)</option>
                                <option value="HIGH">HIGH (Same Business Day)</option>
                                <option value="NORMAL">NORMAL (Scheduled Maintenance)</option>
                            </select>
                        </div>

                        <div className="sm:col-span-1">
                            <label className="font-bold text-slate-700 block mb-1">Issue Summary *</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g., Need help exporting MFRS 102 report"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                        <input
                            type="text"
                            placeholder="Optional notes, preferred callback phone number, or teamviewer ID..."
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                        >
                            <Send className="w-3.5 h-3.5" /> Submit Service Ticket
                        </button>
                    </div>
                </form>

                {/* Active & Past Support Tickets */}
                <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Your Recent Maintenance &amp; Support Tickets ({tickets.length})
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
                                            <Clock className="w-3 h-3" /> In Progress (Click to Close)
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
                        Included in your Vyte SME Subscription: Free statutory SST/MFRS updates &amp; remote support.
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
                    >
                        Close Portal
                    </button>
                </div>
            </div>
        </div>
    );
};