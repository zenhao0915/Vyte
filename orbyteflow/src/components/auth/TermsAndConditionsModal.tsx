// src/components/auth/TermsAndConditionsModal.tsx
import React from 'react';
import { FileText, Check, X } from 'lucide-react';
import { VyteLogo } from '../common/VyteLogo';

interface TermsAndConditionsModalProps {
    isOpen: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

export const TERMS_AND_CONDITIONS_TEXT: { heading: string; body: string }[] = [
    {
        heading: '1. Orbyte Ecosystem Integration & Acceptance of Terms',
        body: 'By registering an account or operating the Vyte Smart SME Automation Hub ("Vyte"), you agree to abide by these Terms & Conditions. Vyte operates as a connected inventory, procurement, quality control, and invoicing automation plug-in designed to interoperate with the Orbyte SME platform.',
    },
    {
        heading: '2. Role-Based Access Control (RBAC) & Human-in-the-Loop Governance',
        body: 'Workspace permissions are strictly enforced based on your assigned organizational role (Owner/CEO, Manager, or Operations Staff). While Vyte AI drafts supplier purchase orders, extracts NLP customer orders, and recommends batch expiry interventions, consequential financial and operational actions require explicit approval from an authorized Owner or Manager account.',
    },
    {
        heading: '3. Orbyte HR Task Dispatch & Audit Trail Accountability',
        body: 'Quality control and perishable expiry actions approved within Quality & Expiry Guardian are dispatched directly to designated personnel via the Orbyte HR roster. Every trigger, AI recommendation, human decision, and staff completion event is recorded in an immutable timestamped activity log for operational governance.',
    },
    {
        heading: '4. Data Privacy & Malaysia PDPA 2010 Compliance',
        body: 'In compliance with the Personal Data Protection Act 2010 (PDPA) of Malaysia, Vyte processes supplier contact numbers, customer order messages, and uploaded accounting documents strictly for authorized business fulfillment. Data minimization, role-restricted viewing, and encrypted session tokens protect all business records.',
    },
    {
        heading: '5. E-Invoicing Readiness & Financial Verification',
        body: 'Uploaded receipt photos, Excel/CSV spreadsheets, and AI-classified accounting categories serve as preparatory workflows to support Malaysia LHDN MyInvois readiness. Users remain responsible for verifying final invoice classifications and payment settlements prior to statutory tax filing.',
    },
];

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
                                                                                    isOpen,
                                                                                    onAccept,
                                                                                    onDecline,
                                                                                }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 select-none">
            <div className="w-full max-w-2xl bg-[#14181D] border border-slate-800 rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
                <div className="px-6 py-5 bg-gradient-to-r from-[#0F291E] via-[#0B1913] to-[#080B0E] border-b border-[#2BB656]/30 flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#2BB656]/20 border border-[#2BB656]/40 text-[#2BB656] flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">
                                Vyte &amp; Orbyte Hub Terms &amp; Conditions
                            </h2>
                            <p className="text-xs text-emerald-300/80">
                                PDPA Compliance, Human-in-the-Loop AI Governance &amp; RBAC Policy
                            </p>
                        </div>
                    </div>

                    <div className="bg-[#F6F7F4] px-3 py-1.5 rounded-xl border border-white/80 hidden sm:flex items-center">
                        <VyteLogo variant="dark-text" showSubtitle={false} className="h-6 w-auto" />
                    </div>
                </div>

                <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed select-text">
                    {TERMS_AND_CONDITIONS_TEXT.map((section, idx) => (
                        <div
                            key={idx}
                            className="p-4 rounded-xl bg-[#1E242B]/90 border border-slate-800/90 space-y-1.5"
                        >
                            <h3 className="text-sm font-bold text-[#2BB656]">{section.heading}</h3>
                            <p className="text-slate-300 leading-relaxed">{section.body}</p>
                        </div>
                    ))}
                </div>

                <div className="px-6 py-4 bg-[#0B0C0E] border-t border-slate-800/90 flex items-center justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onDecline}
                        className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-200 active:scale-[0.99] text-[#0B0C0E] font-bold text-xs border border-white transition cursor-pointer flex items-center gap-1.5"
                    >
                        <X className="w-3.5 h-3.5" />
                        Decline
                    </button>

                    <button
                        type="button"
                        onClick={onAccept}
                        className="px-5 py-2.5 rounded-xl bg-[#2BB656] hover:bg-[#249e49] active:scale-[0.99] text-[#0B0C0E] font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer flex items-center gap-1.5"
                    >
                        <Check className="w-3.5 h-3.5" />
                        Accept Terms
                    </button>
                </div>
            </div>
        </div>
    );
};