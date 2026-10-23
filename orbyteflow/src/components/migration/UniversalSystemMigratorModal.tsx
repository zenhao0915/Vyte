// src/components/migration/UniversalSystemMigratorModal.tsx
import React, { useState, useRef } from 'react';
import {
    Upload, Database, Sparkles, CheckCircle2, AlertCircle,
    ArrowRight, ShieldCheck, Loader2, X, Sliders,
} from 'lucide-react';
import type { Product, InvoiceItem, BusinessComplianceProfile } from '../../types/vyte.ts';
import { orbyteApi } from '../../services/api';

interface UniversalSystemMigratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportSuccess: (payload: {
        products: Product[];
        invoices: InvoiceItem[];
        complianceProfiles: BusinessComplianceProfile[];
        sourceFileName: string;
        transitionMode: 'SHADOW' | 'COPILOT' | 'AUTOPILOT';
    }) => void;
}

interface AiParsedPreview {
    detectedSystem: string;
    fileFormat: string;
    aiConfidence: number;
    fieldMappings: { sourceField: string; targetVyteField: string; sampleValue: string }[];
    products: Product[];
    invoices: InvoiceItem[];
    complianceProfiles: BusinessComplianceProfile[];
    aiSummary: string;
}

export const UniversalSystemMigratorModal: React.FC<UniversalSystemMigratorModalProps> = ({
                                                                                              isOpen,
                                                                                              onClose,
                                                                                              onImportSuccess,
                                                                                          }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [transitionMode, setTransitionMode] = useState<'SHADOW' | 'COPILOT' | 'AUTOPILOT'>('COPILOT');
    const [preview, setPreview] = useState<AiParsedPreview | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedFile(file);
        setErrorMsg(null);
        setIsAnalyzing(true);

        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
            const rawContent = await readFileContentSafely(file, ext);
            const parsedResult = await orbyteApi.parseLegacySystemFile(file, rawContent);
            setPreview(parsedResult);
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Failed to parse file.');
        } finally {
            setIsAnalyzing(false);
            e.target.value = '';
        }
    };

    const readFileContentSafely = (file: File, ext: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
                reader.onload = () => {
                    const buffer = reader.result as ArrayBuffer;
                    const bytes = new Uint8Array(buffer.slice(0, 65536));
                    let extractedStrings = '';
                    let currentChunk = '';
                    for (let i = 0; i < bytes.length; i++) {
                        const code = bytes[i];
                        if (code >= 32 && code <= 126) {
                            currentChunk += String.fromCharCode(code);
                        } else {
                            if (currentChunk.length >= 4) extractedStrings += currentChunk + '\n';
                            currentChunk = '';
                        }
                    }
                    resolve(extractedStrings || `SQLite Database (${file.name})`);
                };
                reader.onerror = () => reject(new Error('Failed to read database file.'));
                reader.readAsArrayBuffer(file);
            } else {
                reader.onload = () => resolve(String(reader.result || '').slice(0, 50000));
                reader.onerror = () => reject(new Error('Failed to read file text.'));
                reader.readAsText(file);
            }
        });
    };

    const handleConfirmMigration = async () => {
        if (!preview || !selectedFile) return;
        setIsImporting(true);
        await new Promise((r) => setTimeout(r, 500));
        onImportSuccess({
            products: preview.products,
            invoices: preview.invoices,
            complianceProfiles: preview.complianceProfiles,
            sourceFileName: selectedFile.name,
            transitionMode,
        });
        setIsImporting(false);
        setPreview(null);
        setSelectedFile(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-[#2BB656] flex items-center justify-center">
                            <Database className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">
                                Data Import &amp; System Migrator
                            </h3>
                            <p className="text-xs text-slate-500">
                                Upload your existing inventory, invoice, or license records (.db, .sql, .json, .csv, .xlsx, .md) to map them automatically into Vyte.
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

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                        Select Automation Mode
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        {[
                            {
                                id: 'SHADOW' as const,
                                title: 'Read-Only Sync',
                                desc: 'Import records for visibility without triggering automated notifications.',
                            },
                            {
                                id: 'COPILOT' as const,
                                title: 'Assisted Approval',
                                desc: 'Drafts purchase orders and reminders for manager approval.',
                            },
                            {
                                id: 'AUTOPILOT' as const,
                                title: 'Automated Dispatch',
                                desc: 'Automatically triggers restock and payment reminders within thresholds.',
                            },
                        ].map((m) => (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setTransitionMode(m.id)}
                                className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                                    transitionMode === m.id
                                        ? 'bg-emerald-50/90 border-[#2BB656] text-emerald-950 shadow-2xs'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <p className="font-bold text-xs">{m.title}</p>
                                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{m.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="*/*,.md,.db,.sqlite,.sqlite3,.sql,.json,.csv,.xlsx,.xls,.txt,.xml"
                        onChange={handleFileChange}
                        className="hidden"
                    />

                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-emerald-300 hover:border-[#2BB656] bg-emerald-50/30 hover:bg-emerald-50/60 rounded-2xl p-6 text-center transition cursor-pointer space-y-2"
                    >
                        <div className="w-11 h-11 rounded-2xl bg-[#2BB656]/15 text-[#2BB656] flex items-center justify-center mx-auto">
                            {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                        </div>
                        <p className="text-xs font-bold text-slate-900">
                            {isAnalyzing
                                ? `Analyzing "${selectedFile?.name}" and mapping fields...`
                                : 'Click to Upload Data File (.db, .md, .sql, .json, .csv, .xlsx, .txt)'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                            Automatically detects product SKUs, stock balances, invoices, and compliance records.
                        </p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {preview && (
                    <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 space-y-4 border border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-[#2BB656]" />
                                <span className="text-xs font-bold text-white">
                                    Detected Format: {preview.detectedSystem} ({preview.fileFormat})
                                </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                                Field Match: {preview.aiConfidence}%
                            </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">{preview.aiSummary}</p>

                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Field Mapping Preview
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                {preview.fieldMappings.map((m, idx) => (
                                    <div
                                        key={idx}
                                        className="px-3 py-2 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2"
                                    >
                                        <span className="font-mono text-amber-300 truncate">{m.sourceField}</span>
                                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span className="font-mono font-bold text-emerald-400 truncate">
                                            {m.targetVyteField}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
                            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                                <p className="text-lg font-extrabold text-emerald-400">{preview.products.length}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">Inventory SKUs</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                                <p className="text-lg font-extrabold text-blue-400">{preview.invoices.length}</p>
                                <p className="text-[10px] text-slate-400 font-semibold">Invoices</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700">
                                <p className="text-lg font-extrabold text-amber-400">
                                    {preview.complianceProfiles.length}
                                </p>
                                <p className="text-[10px] text-slate-400 font-semibold">
                                    Licenses &amp; Contracts
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Records are merged non-destructively into your workspace.
                    </span>
                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!preview || isImporting}
                            onClick={() => void handleConfirmMigration()}
                            className="px-5 py-2 rounded-xl bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            <span>
                                {isImporting ? 'Importing...' : 'Import Records'}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};