// src/components/auth/TermsAndConditionsModal.tsx
import React from 'react';
import { FileText, Check, X } from 'lucide-react';
import { VyteLogo } from '../common/VyteLogo';

interface TermsAndConditionsModalProps {
    isOpen: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

// ============================================================================
// PASTE YOUR PREPARED TERMS & CONDITIONS TEXT HERE
// ============================================================================
export const TERMS_AND_CONDITIONS_TEXT: { heading: string; body: string }[] = [
    {
        heading: '1. Acceptance of Terms',
        body: '[PLACEHOLDER] By creating an account or accessing the Vyte Inventory Management platform ("OrbyteFlow"), you agree to be bound by these Terms & Conditions and all applicable operational policies.',
    },
    {
        heading: '2. Account Registration & Role-Based Access',
        body: '[PLACEHOLDER] Users must provide accurate corporate and personal details during registration. Role permissions (Owner/CEO, Manager, Operations Staff) govern access to purchase order approvals, quality write-offs, and invoice verifications.',
    },
    {
        heading: '3. Automated Restock & Human-in-the-Loop Controls',
        body: '[PLACEHOLDER] While Vyte AI generates depletion forecasts, NLP order extractions, and supplier purchase order drafts, final financial dispatch remains subject to authorized human approval within your workspace.',
    },
    {
        heading: '4. Data Accuracy & Platform Usage',
        body: '[PLACEHOLDER] You are responsible for maintaining the confidentiality of your login credentials and verifying SKU thresholds, supplier contacts, and uploaded accounting documents.',
    },
    {
        heading: '5. Limitation of Liability & Amendments',
        body: '[PLACEHOLDER] Replace this section with your prepared legal clauses regarding service availability, liability limitations, and governing law.',
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
                {/* VYTE COLOR SCHEME HEADER */}
                <div className="px-6 py-5 bg-gradient-to-r from-[#0F291E] via-[#0B1913] to-[#080B0E] border-b border-[#2BB656]/30 flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#2BB656]/20 border border-[#2BB656]/40 text-[#2BB656] flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">
                                Vyte Terms &amp; Conditions
                            </h2>
                            <p className="text-xs text-emerald-300/80">
                                Please review and accept our workspace terms to continue
                            </p>
                        </div>
                    </div>

                    <div className="bg-[#F6F7F4] px-3 py-1.5 rounded-xl border border-white/80 hidden sm:flex items-center">
                        <VyteLogo variant="dark-text" showSubtitle={false} className="h-6 w-auto" />
                    </div>
                </div>

                {/* SCROLLABLE TERMS CONTENT BODY */}
                <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed select-text">
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

                {/* FOOTER: WHITE DECLINE BUTTON & GREEN ACCEPT BUTTON */}
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