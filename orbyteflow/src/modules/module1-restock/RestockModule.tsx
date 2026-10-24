// src/modules/module1-restock/RestockModule.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Archive,
    Award,
    Camera,
    Check,
    CheckCircle2,
    Clock,
    Database,
    FileSpreadsheet,
    History,
    Loader2,
    Lock,
    MessageSquarePlus,
    Plus,
    Scale,
    Send,
    ShieldAlert,
    ShoppingBag,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import {
    CURRENCY_SYMBOLS,
    type CurrencyCode,
    type Product,
    type SupplierQuotationBid,
    type UserRole,
} from '../../types/vyte.ts';
import {getDebugMockMode, orbyteApi} from '../../services/api';
import {INITIAL_SUPPLIER_QUOTATIONS} from '../../data/mockData';

interface RestockModuleProps {
    products: Product[];
    role: UserRole;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onApproveAndContactSupplier: (productId: string, customReorderQty?: number, awardedBid?: SupplierQuotationBid) => Promise<void> | void;
    onConfirmSupplierDelivery: (productId: string) => Promise<void> | void;
    onRecordStockUsage: (productId: string, usedQty: number) => void;
    onOpenAddModal: () => void;
    onBatchImportProducts?: (imported: Product[]) => void;
    onOpenMigratorModal?: () => void;
    onRemoveProduct?: (productId: string) => void;
}

const USAGE_KEY = 'vyte_restock_usage_inputs_v2';
const REORDER_KEY = 'vyte_restock_reorder_inputs_v2';
const QUOTATIONS_KEY = 'vyte_supplier_quotations_v1';

const sanitizeInt = (raw: string, maxDigits = 5) => raw.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, maxDigits);
const isItemArchived = (p: Product) => Boolean(p.isRemoved || p.visibility === false || (p as any).isArchived);
const fmtMoney = (n: number) => n.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

function readLocal<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

export const RestockModule: React.FC<RestockModuleProps> = ({
                                                                products,
                                                                role,
                                                                currency = 'MYR',
                                                                exchangeRate = 1.0,
                                                                onApproveAndContactSupplier,
                                                                onConfirmSupplierDelivery,
                                                                onRecordStockUsage,
                                                                onOpenAddModal,
                                                                onBatchImportProducts,
                                                                onOpenMigratorModal,
                                                                onRemoveProduct,
                                                            }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const [viewMode, setViewMode] = useState<'catalog' | 'quotations'>('catalog');
    const [showArchivedOnly, setShowArchivedOnly] = useState(false);
    const [selectedRfqProductId, setSelectedRfqProductId] = useState('ALL');
    const [selectedQuotationNos, setSelectedQuotationNos] = useState<string[]>([]);
    const [quotations, setQuotations] = useState<SupplierQuotationBid[]>(() => {
        const isDebug = getDebugMockMode();
        const stored = readLocal<SupplierQuotationBid[]>(QUOTATIONS_KEY, isDebug ? INITIAL_SUPPLIER_QUOTATIONS : []);
        const mockNos = new Set(INITIAL_SUPPLIER_QUOTATIONS.map((q) => q.quotationNo));

        if (!isDebug) {
            return stored.filter((q) => !mockNos.has(q.quotationNo));
        }
        return stored.length > 0 ? stored : INITIAL_SUPPLIER_QUOTATIONS;
    });

    useEffect(() => {
        localStorage.setItem(QUOTATIONS_KEY, JSON.stringify(quotations));
    }, [quotations]);

    const [pendingDecommissionProduct, setPendingDecommissionProduct] = useState<Product | null>(null);
    const [reviewModalBid, setReviewModalBid] = useState<SupplierQuotationBid | null>(null);
    const [sampleStatusInput, setSampleStatusInput] = useState<SupplierQuotationBid['sampleTestStatus']>('PASSED');
    const [defectRateInput, setDefectRateInput] = useState('0.5');
    const [staffCommentInput, setStaffCommentInput] = useState('');
    const [pastExpInput, setPastExpInput] = useState('');
    const [staffNameInput, setStaffNameInput] = useState('Amirul Hakim (Warehouse QC)');

    const [showNewBidModal, setShowNewBidModal] = useState(false);
    const [newBidProductId, setNewBidProductId] = useState(products[0]?.id || 'P1');
    const [newBidSupplierName, setNewBidSupplierName] = useState('');
    const [newBidSupplierCode, setNewBidSupplierCode] = useState('108200');
    const [newBidAddress, setNewBidAddress] = useState('');
    const [newBidPhone, setNewBidPhone] = useState('+6012-5566778');
    const [newBidUnitPrice, setNewBidUnitPrice] = useState('');
    const [newBidDefectPct, setNewBidDefectPct] = useState('1.0');
    const [newBidSampleStatus, setNewBidSampleStatus] = useState<SupplierQuotationBid['sampleTestStatus']>('PASSED');
    const [newBidComment, setNewBidComment] = useState('');

    const [usageInputs, setUsageInputs] = useState<Record<string, string>>(() => readLocal(USAGE_KEY, {}));
    const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
    const [reorderInputs, setReorderInputs] = useState<Record<string, string>>(() => readLocal(REORDER_KEY, {}));
    const [reorderErrors, setReorderErrors] = useState<Record<string, string>>({});

    const [pendingSaleConfirm, setPendingSaleConfirm] = useState<{ item: Product; qty: number } | null>(null);
    const [approvingIds, setApprovingIds] = useState<Record<string, boolean>>({});
    const [confirmingIds, setConfirmingIds] = useState<Record<string, boolean>>({});

    const excelInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        localStorage.setItem(USAGE_KEY, JSON.stringify(usageInputs));
    }, [usageInputs]);
    useEffect(() => {
        localStorage.setItem(REORDER_KEY, JSON.stringify(reorderInputs));
    }, [reorderInputs]);

    const computeAiEvaluation = (
        unitPriceRM: number, lowestPriceForProductRM: number, defectRatePct: number,
        sampleStatus: SupplierQuotationBid['sampleTestStatus'], supplierName: string
    ): { score: number; rec: SupplierQuotationBid['aiRecommendation']; note: string } => {
        const priceRatioPenalty = lowestPriceForProductRM > 0 ? Math.max(0, ((unitPriceRM - lowestPriceForProductRM) / lowestPriceForProductRM) * 60) : 0;
        const sampleAdjustment = sampleStatus === 'PASSED' ? 12 : sampleStatus === 'WARNING' ? -12 : sampleStatus === 'FAILED' ? -32 : 0;
        const score = Math.max(15, Math.min(99, Math.round(90 - priceRatioPenalty - defectRatePct * 3.8 + sampleAdjustment)));
        const isLowestPrice = Math.abs(unitPriceRM - lowestPriceForProductRM) < 0.01;

        if (defectRatePct >= 5 || sampleStatus === 'FAILED') {
            return {
                score,
                rec: isLowestPrice ? 'LOWEST_PRICE_HIGH_RISK' : 'AVOID_DEFECT_RISK',
                note: isLowestPrice
                    ? `Lowest price bid, but flagged for ${defectRatePct}% past defect rate and${sampleStatus.toLowerCase()} sample test. High risk of batch loss.`
                    : `High defect risk (${defectRatePct}% historical defect rate, sample${sampleStatus.toLowerCase()}). Not recommended.`,
            };
        }
        if (score >= 88) {
            return {
                score,
                rec: 'RECOMMENDED_BEST_VALUE',
                note: `AI Recommended (${score}/100): ${supplierName} combines low defect history (${defectRatePct}%) and passed warehouse sample testing.`,
            };
        }
        return {
            score,
            rec: 'ACCEPTABLE_BACKUP',
            note: `Acceptable secondary supplier (${score}/100) with${defectRatePct}% past defect rate.`,
        };
    };

    const filteredQuotations = useMemo(() => {
        const list = selectedRfqProductId === 'ALL' ? quotations : quotations.filter((q) => q.productId === selectedRfqProductId);
        return [...list].sort((a, b) => (a.productId !== b.productId ? a.productId.localeCompare(b.productId) : a.totalNetValueRM - b.totalNetValueRM));
    }, [quotations, selectedRfqProductId]);

    const lowestNetValueByProduct = useMemo(() => {
        const map: Record<string, number> = {};
        quotations.forEach((q) => {
            if (map[q.productId] === undefined || q.totalNetValueRM < map[q.productId]) map[q.productId] = q.totalNetValueRM;
        });
        return map;
    }, [quotations]);

    const handleAwardQuotation = async (bid: SupplierQuotationBid) => {
        if (!canApprove) return;
        setQuotations((prev) => prev.map((q) => (q.productId !== bid.productId ? q : q.quotationNo === bid.quotationNo ? {
            ...q,
            status: 'Awarded'
        } : {...q, status: 'Completed'})));
        await onApproveAndContactSupplier(bid.productId, bid.orderQty, bid);
    };

    const handleSaveSampleReview = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reviewModalBid) return;
        const parsedDefect = Math.max(0, Math.min(100, Number(defectRateInput) || 0));
        const lowestUnit = Math.min(...quotations.filter((q) => q.productId === reviewModalBid.productId).map((q) => q.unitPriceRM));
        const evalRes = computeAiEvaluation(reviewModalBid.unitPriceRM, lowestUnit, parsedDefect, sampleStatusInput, reviewModalBid.supplierName);

        setQuotations((prev) => prev.map((q) => q.quotationNo === reviewModalBid.quotationNo ? {
            ...q, pastDefectRatePct: parsedDefect, sampleTestStatus: sampleStatusInput,
            staffSampleComment: staffCommentInput.trim() || q.staffSampleComment,
            pastExperienceNote: pastExpInput.trim() || q.pastExperienceNote,
            testedByStaff: staffNameInput.trim() || q.testedByStaff,
            aiQualityScore: evalRes.score, aiRecommendation: evalRes.rec, aiAnalysisNote: evalRes.note,
        } : q));
        setReviewModalBid(null);
    };

    const handleAddSupplierBid = (e: React.FormEvent) => {
        e.preventDefault();
        const prod = products.find((p) => p.id === newBidProductId) || products[0];
        if (!prod || !newBidSupplierName.trim() || !newBidUnitPrice) return;

        const unitPriceRM = Number((Number(newBidUnitPrice) / exchangeRate).toFixed(2));
        const orderQty = prod.reorderQty || 50;
        const totalNetValueRM = Number((unitPriceRM * orderQty).toFixed(2));
        const defectPct = Math.max(0, Math.min(100, Number(newBidDefectPct) || 0));
        const lowestUnit = Math.min(unitPriceRM, ...quotations.filter((q) => q.productId === prod.id).map((q) => q.unitPriceRM));
        const evalRes = computeAiEvaluation(unitPriceRM, lowestUnit, defectPct, newBidSampleStatus, newBidSupplierName.trim());

        const createdBid: SupplierQuotationBid = {
            quotationNo: String(8000000000 + quotations.length + 10),
            rfqNo: `700000000${prod.id.replace(/\D/g, '') || '1'}`,
            productId: prod.id, sku: prod.sku, productName: prod.name, orderQty, uom: prod.uom,
            supplierCode: newBidSupplierCode.trim() || '108200',
            supplierName: newBidSupplierName.trim(),
            supplierContact: newBidPhone.trim() || '+6012-5566778',
            address: newBidAddress.trim() || '25 Jalan Perusahaan, Shah Alam 40000, Malaysia',
            status: 'Submitted', unitPriceRM, totalNetValueRM,
            quotationDate: new Date().toISOString().slice(0, 10),
            deliveryLeadDays: 2, fullyQuotedItems: '1/1', bestPricedItems: unitPriceRM <= lowestUnit ? '1/1' : '0/1',
            pastOrdersCount: 1, pastDefectRatePct: defectPct,
            pastExperienceNote: defectPct > 5 ? `Logged ${defectPct}% defect rate in prior delivery.` : `Verified ${defectPct}% defect rate.`,
            sampleTestStatus: newBidSampleStatus,
            staffSampleComment: newBidComment.trim() || 'Sample inspected by warehouse staff.',
            testedByStaff: 'Amirul Hakim (Warehouse QC)',
            aiQualityScore: evalRes.score, aiRecommendation: evalRes.rec, aiAnalysisNote: evalRes.note,
        };

        setQuotations((prev) => [createdBid, ...prev]);
        setNewBidSupplierName('');
        setNewBidUnitPrice('');
        setNewBidComment('');
        setShowNewBidModal(false);
    };

    const handleSpreadsheetImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onBatchImportProducts) return;

        try {
            const text = await file.text();
            const parsed = await orbyteApi.parseLegacySystemFile(file, text);
            if (!parsed?.products || parsed.products.length === 0) {
                throw new Error('Invalid CSV!');
            }

            // 提交至后端 SQLite 数据库
            const commitRes = await orbyteApi.commitMigration({
                sourceFileName: file.name,
                transitionMode: 'COPILOT',
                products: parsed.products,
                invoices: parsed.invoices || [],
                complianceProfiles: parsed.complianceProfiles || []
            });

            onBatchImportProducts(commitRes.importedProducts || parsed.products);
        } catch (err: any) {
            console.error('Import failed:', err);
            alert(`Error: ${err.message || 'Backend Not Connected! Adding Product Is Disabled!'}`);
        } finally {
            e.target.value = '';
        }
    };

    const handleShelfPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onBatchImportProducts) return;
        if (!getDebugMockMode()) {
            const isOnline = await orbyteApi.checkBackendHealth();
            if (!isOnline) {
                alert('后端数据库未连接，禁止添加物品！');
                e.target.value = '';
                return;
            }
        }
        const reader = new FileReader();
        reader.onload = () => {
            onBatchImportProducts([{
                id: `P-IMG-${Date.now()}`,
                sku: `IMG-${Math.floor(1000 + Math.random() * 9000)}`,
                name: `Scanned Item (${file.name.slice(0, 14)})`,
                category: 'F&B Raw Ingredient',
                industry: 'FNB_PERISHABLE',
                uom: 'pack',
                stock: 5,
                minThreshold: 12,
                reorderQty: 30,
                priceRM: 38.0,
                unitCostRM: 22.0,
                dailyDepletionRate: 3.0,
                leadTimeDays: 2,
                moq: 10,
                supplierName: 'Klang Valley Roasters Sdn Bhd',
                supplierContact: '+6012-3456789',
                performance: 'Good',
                visibility: true,
                batchNo: 'B-PHOTO-26',
                expiryDate: '2026-11-10',
                photoUrl: String(reader.result),
                restockStatus: 'TRIGGERED_PENDING_APPROVAL',
            }]);
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const handleRequestSaleConfirmation = (item: Product) => {
        if (item.stock <= 0) return;
        const rawStr = usageInputs[item.id] ?? '3';
        const qty = Number(rawStr);
        if (!rawStr || isNaN(qty) || qty < 1) return setUsageErrors((p) => ({...p, [item.id]: 'Enter at least 1.'}));
        if (qty > item.stock) return setUsageErrors((p) => ({
            ...p,
            [item.id]: `Max available is ${item.stock}${item.uom}.`
        }));
        setUsageErrors((p) => ({...p, [item.id]: ''}));
        setPendingSaleConfirm({item, qty});
    };

    const handleApprovePO = async (item: Product) => {
        const rawReorder = reorderInputs[item.id] ?? String(item.reorderQty);
        const qty = Number(rawReorder);
        const minMoq = item.moq ?? 5;
        if (!rawReorder || isNaN(qty) || qty < minMoq) return setReorderErrors((p) => ({
            ...p,
            [item.id]: `Min supplier order is ${minMoq}${item.uom}.`
        }));
        if (qty > 10000) return setReorderErrors((p) => ({...p, [item.id]: 'Max single PO limit is 10,000 units.'}));

        setReorderErrors((p) => ({...p, [item.id]: ''}));
        setApprovingIds((p) => ({...p, [item.id]: true}));
        try {
            await onApproveAndContactSupplier(item.id, qty);
        } finally {
            setApprovingIds((p) => ({...p, [item.id]: false}));
        }
    };

    const handleConfirmDeliveryClick = async (item: Product) => {
        setConfirmingIds((p) => ({...p, [item.id]: true}));
        try {
            await onConfirmSupplierDelivery(item.id);
        } finally {
            setConfirmingIds((p) => ({...p, [item.id]: false}));
        }
    };

    const activeProducts = useMemo(() => products.filter((p) => !isItemArchived(p)), [products]);
    const archivedProducts = useMemo(() => products.filter(isItemArchived), [products]);

    const displayedProducts = useMemo(() => {
        const base = showArchivedOnly ? archivedProducts : activeProducts;
        const rank = (s: Product['restockStatus']) => (s === 'TRIGGERED_PENDING_APPROVAL' ? 0 : s === 'SUPPLIER_CONTACTED' ? 1 : s === 'CONFIRMED' ? 2 : 3);
        return [...base].sort((a, b) => rank(a.restockStatus) - rank(b.restockStatus));
    }, [showArchivedOnly, activeProducts, archivedProducts]);

    return (
        <div className="space-y-4">
            <input ref={excelInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleSpreadsheetImport}
                   className="hidden"/>
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handleShelfPhotoUpload}
                   className="hidden"/>

            <div
                className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div
                        className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                        <button
                            type="button" onClick={() => {
                            setViewMode('catalog');
                            setShowArchivedOnly(false);
                        }}
                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${viewMode === 'catalog' && !showArchivedOnly ? 'bg-slate-900 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            Active Catalog ({activeProducts.length})
                        </button>
                        <button
                            type="button" onClick={() => {
                            setViewMode('catalog');
                            setShowArchivedOnly(true);
                        }}
                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${viewMode === 'catalog' && showArchivedOnly ? 'bg-amber-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            <History className="w-3.5 h-3.5"/>
                            <span>Decommissioned History ({archivedProducts.length})</span>
                        </button>
                        <button
                            type="button" onClick={() => setViewMode('quotations')}
                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${viewMode === 'quotations' ? 'bg-emerald-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                        >
                            <Scale className="w-3.5 h-3.5"/>
                            <span>Supplier Quotations &amp; AI Evaluation ({quotations.length})</span>
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {viewMode === 'quotations' ? (
                        <button type="button" onClick={() => setShowNewBidModal(true)}
                                className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                            <Plus className="w-3.5 h-3.5"/> Add Supplier Quotation
                        </button>
                    ) : (
                        <>
                            {onOpenMigratorModal && (
                                <button type="button" onClick={onOpenMigratorModal}
                                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                                    <Database className="w-3.5 h-3.5 text-[#2BB656]"/> Import System Data
                                </button>
                            )}
                            <button type="button" onClick={() => photoInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                                <Camera className="w-3.5 h-3.5 text-purple-600"/> Scan Shelf Photo
                            </button>
                            <button type="button" onClick={() => excelInputRef.current?.click()}
                                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600"/> Import CSV
                            </button>
                            <button type="button" onClick={onOpenAddModal}
                                    className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0">
                                <Plus className="w-3.5 h-3.5"/> Add Product
                            </button>
                        </>
                    )}
                </div>
            </div>

            {viewMode === 'quotations' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
                    <div
                        className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-base font-bold text-slate-900">Quotations
                                ({filteredQuotations.length})</h3>
                            <select value={selectedRfqProductId}
                                    onChange={(e) => setSelectedRfqProductId(e.target.value)}
                                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-800">
                                <option value="ALL">All RFQ Products ({quotations.length} Bids)</option>
                                {activeProducts.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})
                                        - {quotations.filter((q) => q.productId === p.id).length} Quotes</option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-500">Evaluates net quotation price alongside past defect memory and warehouse sample tests.</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs">
                            <button
                                type="button" disabled={selectedQuotationNos.length === 0 || !canApprove}
                                onClick={() => {
                                    const targetBid = quotations.find((q) => q.quotationNo === selectedQuotationNos[0]);
                                    if (targetBid) void handleAwardQuotation(targetBid);
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
                            >
                                <Award className="w-3.5 h-3.5"/> Award Selected Quote
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                                <th className="py-3 px-3 w-10 text-center">Select</th>
                                <th className="py-3 px-3">Supplier Quotation</th>
                                <th className="py-3 px-3">Supplier</th>
                                <th className="py-3 px-3">Address</th>
                                <th className="py-3 px-3">Status</th>
                                <th className="py-3 px-3">Total Quotation Net Value</th>
                                <th className="py-3 px-3">Quotation Date</th>
                                <th className="py-3 px-3 text-center">Fully Quoted Items</th>
                                <th className="py-3 px-3 text-center">Best-Priced Items</th>
                                <th className="py-3 px-3">AI Quality Score &amp; Past Defect Memory</th>
                                <th className="py-3 px-3">Warehouse Sample Test Comment</th>
                                <th className="py-3 px-4 text-right">Bid Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/80">
                            {filteredQuotations.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="py-10 text-center text-slate-400 italic">
                                        No supplier quotations found. Click &quot;Add Supplier Quotation&quot; to create
                                        a new quotation bid.
                                    </td>
                                </tr>
                            ) : filteredQuotations.map((bid) => {
                                const isLowestNet = lowestNetValueByProduct[bid.productId] === bid.totalNetValueRM;
                                const isSelected = selectedQuotationNos.includes(bid.quotationNo);

                                return (
                                    <tr key={bid.quotationNo}
                                        className={`transition ${bid.status === 'Awarded' ? 'bg-emerald-50/40' : bid.aiRecommendation === 'RECOMMENDED_BEST_VALUE' ? 'bg-blue-50/20 hover:bg-blue-50/40' : 'hover:bg-slate-50'}`}>
                                        <td className="py-3.5 px-3 text-center">
                                            <input
                                                type="checkbox" checked={isSelected}
                                                onChange={() => setSelectedQuotationNos((prev) => prev.includes(bid.quotationNo) ? prev.filter((id) => id !== bid.quotationNo) : [bid.quotationNo])}
                                                className="w-4 h-4 accent-blue-600 cursor-pointer"
                                            />
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <p className="font-mono font-extrabold text-blue-700">{bid.quotationNo}</p>
                                            <p className="font-bold text-slate-900 text-xs mt-0.5">{bid.productName}</p>
                                            <span
                                                className="text-[10px] font-mono text-slate-400 block mt-0.5">RFQ {bid.rfqNo} | {bid.sku} ({bid.orderQty} {bid.uom})</span>
                                        </td>
                                        <td className="py-3.5 px-3">
                                            <p className="font-semibold text-blue-700">{bid.supplierName}</p>
                                            <p className="text-[11px] text-blue-600/80">({bid.supplierCode})</p>
                                        </td>
                                        <td className="py-3.5 px-3 max-w-[180px] text-[11px] text-slate-600 leading-snug">{bid.address}</td>
                                        <td className="py-3.5 px-3 whitespace-nowrap">
                        <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${bid.status === 'Awarded' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : bid.status === 'Completed' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-slate-800'}`}>
                          {bid.status}
                        </span>
                                        </td>
                                        <td className="py-3.5 px-3 whitespace-nowrap">
                                            <span
                                                className={`text-xs font-extrabold ${isLowestNet ? 'text-emerald-700' : 'text-slate-800'}`}>{(bid.totalNetValueRM * exchangeRate).toFixed(2)} {currency}</span>
                                            <p className="text-[10px] text-slate-400">{sym} {(bid.unitPriceRM * exchangeRate).toFixed(2)} / {bid.uom}</p>
                                        </td>
                                        <td className="py-3.5 px-3 whitespace-nowrap font-mono text-[11px] text-slate-600">{bid.quotationDate}</td>
                                        <td className="py-3.5 px-3 text-center font-semibold text-slate-700">{bid.fullyQuotedItems}</td>
                                        <td className="py-3.5 px-3 text-center font-semibold text-slate-700">{isLowestNet ? '1/1' : '0/1'}</td>
                                        <td className="py-3.5 px-3 max-w-[240px]">
                                            <div className="flex items-center gap-1.5">
                          <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1 ${bid.aiRecommendation === 'RECOMMENDED_BEST_VALUE' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : bid.aiRecommendation === 'LOWEST_PRICE_HIGH_RISK' || bid.aiRecommendation === 'AVOID_DEFECT_RISK' ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-amber-100 text-amber-800'}`}>
                            <Sparkles className="w-2.5 h-2.5"/> AI Score: {bid.aiQualityScore}/100
                          </span>
                                                <span
                                                    className={`text-[10px] font-bold ${bid.pastDefectRatePct >= 5 ? 'text-rose-600' : 'text-emerald-700'}`}>({bid.pastDefectRatePct}% Defects)</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 mt-1 leading-snug">{bid.pastExperienceNote}</p>
                                            <p className="text-[10px] font-semibold text-slate-800 mt-0.5">{bid.aiAnalysisNote}</p>
                                        </td>
                                        <td className="py-3.5 px-3 max-w-[220px]">
                                            <div className="flex items-center justify-between gap-1">
                          <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${bid.sampleTestStatus === 'PASSED' ? 'bg-emerald-100 text-emerald-800' : bid.sampleTestStatus === 'FAILED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                            Sample: {bid.sampleTestStatus}
                          </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReviewModalBid(bid);
                                                        setSampleStatusInput(bid.sampleTestStatus);
                                                        setDefectRateInput(String(bid.pastDefectRatePct));
                                                        setStaffCommentInput(bid.staffSampleComment);
                                                        setPastExpInput(bid.pastExperienceNote);
                                                        setStaffNameInput(bid.testedByStaff);
                                                    }}
                                                    className="text-[10px] text-blue-600 hover:underline font-bold inline-flex items-center gap-0.5 cursor-pointer"
                                                >
                                                    <MessageSquarePlus className="w-3 h-3"/> Edit Sample Note
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-slate-700 italic mt-1 leading-snug">&ldquo;{bid.staffSampleComment}&rdquo;</p>
                                            <p className="text-[10px] text-slate-400 mt-0.5">By: {bid.testedByStaff}</p>
                                        </td>
                                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                            {bid.status === 'Awarded' ? (
                                                <span
                                                    className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold text-xs inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5"/> Awarded &amp; PO Sent
                          </span>
                                            ) : (
                                                <div className="flex flex-col items-end gap-1">
                                                    <button
                                                        type="button" disabled={!canApprove}
                                                        onClick={() => void handleAwardQuotation(bid)}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer ${bid.aiRecommendation === 'RECOMMENDED_BEST_VALUE' ? 'bg-[#2BB656] hover:bg-emerald-600 text-white shadow-2xs' : 'bg-slate-900 hover:bg-slate-700 text-white'}`}
                                                    >
                                                        <Award
                                                            className="w-3.5 h-3.5"/> {bid.aiRecommendation === 'RECOMMENDED_BEST_VALUE' ? 'Award AI Best Pick' : 'Award Quote'}
                                                    </button>
                                                    {bid.aiRecommendation === 'LOWEST_PRICE_HIGH_RISK' && (
                                                        <span
                                                            className="text-[10px] text-rose-600 font-semibold flex items-center gap-0.5"><ShieldAlert
                                                            className="w-3 h-3"/> High Defect Risk</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {viewMode === 'catalog' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    {showArchivedOnly && (
                        <div
                            className="px-5 py-3 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between text-xs text-amber-900">
                            <div className="flex items-center gap-2">
                                <Archive className="w-4 h-4 text-amber-700 shrink-0"/>
                                <span><strong>Decommissioned History:</strong> Displaying retired products. Historical invoices and logs are preserved, while future sales and restocks are disabled.</span>
                            </div>
                            <button type="button" onClick={() => setShowArchivedOnly(false)}
                                    className="text-amber-800 font-bold underline hover:text-amber-950 cursor-pointer">
                                Return to Active Catalog
                            </button>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                <th className="py-2.5 px-4">Product &amp; Spec</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">SKU &amp; Profile</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Live Stock vs Min</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Record Sale / Usage</th>
                                <th className="py-2.5 px-3">Active Supplier &amp; Bids</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Selling Price ({currency})</th>
                                <th className="py-2.5 px-4 w-72">Restock Action</th>
                                <th className="py-2.5 px-3 text-center w-14">Remove</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs">
                            {displayedProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                                        {showArchivedOnly ? 'No decommissioned products found.' : 'No active products available.'}
                                    </td>
                                </tr>
                            ) : (
                                displayedProducts.map((item) => {
                                    const isArchived = isItemArchived(item);
                                    const isLow = !isArchived && item.stock <= item.minThreshold;
                                    const isOutOfStock = !isArchived && item.stock <= 0;
                                    const currentUsageVal = usageInputs[item.id] ?? '3';
                                    const currentReorderVal = reorderInputs[item.id] ?? String(item.reorderQty);
                                    const isApproving = Boolean(approvingIds[item.id]);
                                    const isConfirming = Boolean(confirmingIds[item.id]);
                                    const itemBids = quotations.filter((q) => q.productId === item.id);

                                    return (
                                        <tr key={item.id}
                                            className={`transition ${isArchived ? 'bg-slate-50/60 opacity-80' : 'hover:bg-slate-50/70'}`}>
                                            <td className="py-2.5 px-4 max-w-[210px]">
                                                <div className="flex items-center gap-2">
                                                    {item.photoUrl && <img src={item.photoUrl} alt={item.name}
                                                                           className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"/>}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className={`font-bold truncate ${isArchived ? 'text-slate-600 line-through' : 'text-slate-900'}`}
                                                               title={item.name}>{item.name}</p>
                                                            {isArchived && <span
                                                                className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800">Retired</span>}
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 truncate">{item.batchNo ? `Batch: ${item.batchNo} | Exp:${item.expiryDate}` : item.variantSpec || item.category}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                <p className="font-mono text-[11px] font-bold text-slate-700">{item.sku}</p>
                                                <span
                                                    className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{item.industry.replace(/_/g, ' ')}</span>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                {isArchived ? (
                                                    <span
                                                        className="text-[11px] font-bold text-slate-400">Decommissioned</span>
                                                ) : (
                                                    <div>
                                                        <div>
                                                            <span
                                                                className={`text-sm font-extrabold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>{item.stock.toLocaleString()} {item.uom}</span>
                                                            <span
                                                                className="text-[11px] text-slate-400"> / Min {item.minThreshold}</span>
                                                        </div>
                                                        {isOutOfStock ? (
                                                            <span
                                                                className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-bold">Out of Stock (0 Left)</span>
                                                        ) : isLow ? (
                                                            <span
                                                                className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-rose-600 font-bold"><AlertTriangle
                                                                className="w-3 h-3"/> Low Stock Alert</span>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                                {isArchived ? (
                                                    <span
                                                        className="text-[11px] text-slate-400 italic">Sales locked</span>
                                                ) : isOutOfStock ? (
                                                    <span
                                                        className="text-[11px] text-slate-400 italic">Restock required</span>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <input
                                                                type="text" inputMode="numeric" value={currentUsageVal}
                                                                placeholder="Qty"
                                                                onChange={(e) => {
                                                                    setUsageInputs((p) => ({
                                                                        ...p,
                                                                        [item.id]: sanitizeInt(e.target.value, 4)
                                                                    }));
                                                                    setUsageErrors((p) => ({...p, [item.id]: ''}));
                                                                }}
                                                                className="w-14 px-2 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                                            />
                                                            <button type="button"
                                                                    onClick={() => handleRequestSaleConfirmation(item)}
                                                                    className="px-2.5 py-1 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer">
                                                                <ShoppingBag className="w-3 h-3"/> Sell / Use
                                                            </button>
                                                        </div>
                                                        {usageErrors[item.id] &&
                                                            <p className="text-[10px] text-rose-600 font-semibold flex items-center gap-0.5">
                                                                <AlertCircle
                                                                    className="w-2.5 h-2.5"/> {usageErrors[item.id]}
                                                            </p>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 max-w-[200px]">
                                                <p className="font-semibold text-slate-800 truncate">{item.supplierName}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span
                                                        className="text-[11px] text-slate-500 font-mono truncate">{item.supplierContact}</span>
                                                    {itemBids.length > 0 && !isArchived && (
                                                        <button type="button" onClick={() => {
                                                            setSelectedRfqProductId(item.id);
                                                            setViewMode('quotations');
                                                        }}
                                                                className="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-bold cursor-pointer shrink-0">
                                                            {itemBids.length} Quotes
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-800">{sym} {fmtMoney(item.priceRM * exchangeRate)}</td>
                                            <td className="py-2.5 px-4">
                                                {isArchived ? (
                                                    <span
                                                        className="px-2.5 py-1 bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold inline-flex items-center gap-1">
                              <Archive className="w-3 h-3"/> Archived (History Kept)
                            </span>
                                                ) : item.restockStatus === 'TRIGGERED_PENDING_APPROVAL' ? (
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-semibold text-slate-500">PO Qty:</span>
                                                            <input
                                                                type="text" inputMode="numeric"
                                                                value={currentReorderVal}
                                                                onChange={(e) => {
                                                                    setReorderInputs((p) => ({
                                                                        ...p,
                                                                        [item.id]: sanitizeInt(e.target.value, 5)
                                                                    }));
                                                                    setReorderErrors((p) => ({...p, [item.id]: ''}));
                                                                }}
                                                                className="w-16 px-2 py-0.5 rounded bg-white border border-amber-300 text-xs font-extrabold text-slate-900 focus:outline-none"
                                                            />
                                                            <span
                                                                className="text-[10px] text-slate-500">{item.uom}</span>
                                                        </div>
                                                        {reorderErrors[item.id] &&
                                                            <p className="text-[10px] text-rose-600 font-semibold">{reorderErrors[item.id]}</p>}
                                                        <button
                                                            type="button" disabled={isApproving}
                                                            onClick={() => void handleApprovePO(item)}
                                                            className={`w-full px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap disabled:opacity-60 ${canApprove ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'}`}
                                                        >
                                                            {canApprove ? (
                                                                <>
                                                                    {isApproving ? <Loader2
                                                                            className="w-3 h-3 animate-spin shrink-0"/> :
                                                                        <Send className="w-3 h-3 shrink-0"/>}
                                                                    {isApproving ? 'Dispatching PO...' : `Approve & Contact (+${currentReorderVal || 0}${item.uom})`}
                                                                </>
                                                            ) : (
                                                                <><Lock className="w-3 h-3 shrink-0"/> Locked: Owner
                                                                    Only</>
                                                            )}
                                                        </button>
                                                    </div>
                                                ) : item.restockStatus === 'SUPPLIER_CONTACTED' ? (
                                                    <div className="space-y-1.5">
                                                        <div
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                            <Clock className="w-2.5 h-2.5"/> PO Sent
                                                        </div>
                                                        <button
                                                            type="button" disabled={isConfirming}
                                                            onClick={() => void handleConfirmDeliveryClick(item)}
                                                            className="w-full px-3 py-1.5 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                        >
                                                            {isConfirming ?
                                                                <Loader2 className="w-3 h-3 animate-spin"/> :
                                                                <CheckCircle2 className="w-3 h-3"/>}
                                                            {isConfirming ? 'Confirming...' : `Confirm Delivery (+${item.reorderQty} ${item.uom})`} </button>
                                                    </div>) : item.restockStatus === 'CONFIRMED' ? (<span
                                                    className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap"> <CheckCircle2
                                                    className="w-3 h-3 text-emerald-600"/> Delivered &amp; Restocked </span>) : (
                                                    <span
                                                        className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap">Healthy Stock</span>)} </td>
                                            <td className="py-2.5 px-3 text-center"> {!isArchived && onRemoveProduct ? (
                                                <button type="button"
                                                        onClick={() => setPendingDecommissionProduct(item)}
                                                        title="Decommission / Remove Product (Keeps Historical Invoices & Logs)"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer">
                                                    <Trash2 className="w-4 h-4"/></button>) : (
                                                <span className="text-[10px] text-slate-400 font-mono">—</span>)} </td>
                                        </tr>);
                                }))} </tbody>
                        </table>
                    </div>
                </div>)} {pendingDecommissionProduct && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                                <Trash2 className="w-4 h-4"/></div>
                            <div><h3 className="text-base font-bold text-slate-900">Remove &amp; Decommission
                                Product</h3> <p className="text-[11px] text-slate-500">Preserves historical invoices,
                                analytics &amp; audit logs</p></div>
                        </div>
                        <button type="button" onClick={() => setPendingDecommissionProduct(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X
                            className="w-4 h-4"/></button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed"> Are you sure you want to remove <strong
                        className="text-slate-900">{pendingDecommissionProduct.name} ({pendingDecommissionProduct.sku})</strong> from
                        active catalog operations? Past invoices, sales history, and audit records will remain intact,
                        but this SKU will no longer be available for future sales or restocks. </p>
                    <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setPendingDecommissionProduct(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">Cancel
                        </button>
                        <button type="button" onClick={() => {
                            onRemoveProduct?.(pendingDecommissionProduct.id);
                            setPendingDecommissionProduct(null);
                        }}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"> Confirm
                            Remove Product
                        </button>
                    </div>
                </div>
            </div>)} {reviewModalBid && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <form onSubmit={handleSaveSampleReview}
                      className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div><h3 className="text-base font-bold text-slate-900">Update Sample Test &amp; Defect
                            Memory</h3> <p
                            className="text-[11px] text-slate-500">Quotation {reviewModalBid.quotationNo} • {reviewModalBid.supplierName}</p>
                        </div>
                        <button type="button" onClick={() => setReviewModalBid(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X
                            className="w-4 h-4"/></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="font-bold text-slate-700 block mb-1">Sample Test Status</label> <select
                            value={sampleStatusInput}
                            onChange={(e) => setSampleStatusInput(e.target.value as SupplierQuotationBid['sampleTestStatus'])}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900">
                            <option value="PASSED">PASSED</option>
                            <option value="WARNING">WARNING</option>
                            <option value="FAILED">FAILED</option>
                        </select></div>
                        <div><label className="font-bold text-slate-700 block mb-1">Past Defect Rate (\%)</label> <input
                            type="text" inputMode="decimal" value={defectRateInput}
                            onChange={(e) => setDefectRateInput(e.target.value.replace(/[^0-9.]/g, ''))}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"/>
                        </div>
                    </div>
                    <div><label className="font-bold text-slate-700 block mb-1">Past Delivery Experience Note</label>
                        <input type="text" value={pastExpInput} onChange={(e) => setPastExpInput(e.target.value)}
                               className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800"/>
                    </div>
                    <div><label className="font-bold text-slate-700 block mb-1">Warehouse Staff Sample Comment</label>
                        <textarea rows={3} value={staffCommentInput}
                                  onChange={(e) => setStaffCommentInput(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800"/>
                    </div>
                    <div><label className="font-bold text-slate-700 block mb-1">Inspected By Staff</label> <input
                        type="text" value={staffNameInput} onChange={(e) => setStaffNameInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800"/></div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setReviewModalBid(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Cancel
                        </button>
                        <button type="submit"
                                className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold cursor-pointer">Save &amp; Recalculate
                            AI Score
                        </button>
                    </div>
                </form>
            </div>)} {showNewBidModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <form onSubmit={handleAddSupplierBid}
                      className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3"><h3
                        className="text-base font-bold text-slate-900">Add Supplier Quotation Bid</h3>
                        <button type="button" onClick={() => setShowNewBidModal(false)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X
                            className="w-4 h-4"/></button>
                    </div>
                    <div><label className="font-bold text-slate-700 block mb-1">Target Product *</label> <select
                        value={newBidProductId} onChange={(e) => setNewBidProductId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"> {activeProducts.map((p) =>
                        <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)} </select></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="font-bold text-slate-700 block mb-1">Supplier Name *</label> <input
                            type="text" required placeholder="e.g., Summit Packaging MY" value={newBidSupplierName}
                            onChange={(e) => setNewBidSupplierName(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900"/>
                        </div>
                        <div><label className="font-bold text-slate-700 block mb-1">Vendor Code</label> <input
                            type="text" value={newBidSupplierCode}
                            onChange={(e) => setNewBidSupplierCode(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-mono text-slate-900"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="font-bold text-slate-700 block mb-1">Quoted Unit Price ({currency})
                            *</label> <input type="text" inputMode="decimal" required placeholder="e.g., 38.00"
                                             value={newBidUnitPrice}
                                             onChange={(e) => setNewBidUnitPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                                             className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"/>
                        </div>
                        <div><label className="font-bold text-slate-700 block mb-1">Past Defect Rate (\%)</label> <input
                            type="text" inputMode="decimal" value={newBidDefectPct}
                            onChange={(e) => setNewBidDefectPct(e.target.value.replace(/[^0-9.]/g, ''))}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"/>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="font-bold text-slate-700 block mb-1">Sample Test Status</label> <select
                            value={newBidSampleStatus}
                            onChange={(e) => setNewBidSampleStatus(e.target.value as SupplierQuotationBid['sampleTestStatus'])}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900">
                            <option value="PASSED">PASSED</option>
                            <option value="WARNING">WARNING</option>
                            <option value="FAILED">FAILED</option>
                        </select>
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Supplier Phone</label>
                            <input type="text" value={newBidPhone} onChange={(e) => setNewBidPhone(e.target.value)}
                                   className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900"/>
                        </div>
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Supplier Address</label>
                        <input type="text" placeholder="e.g., 25 Jalan Perusahaan, Shah Alam" value={newBidAddress}
                               onChange={(e) => setNewBidAddress(e.target.value)}
                               className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900"/>
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Staff Sample Comment</label>
                        <textarea rows={2} placeholder="Enter staff sample test notes..." value={newBidComment}
                                  onChange={(e) => setNewBidComment(e.target.value)}
                                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900"/>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setShowNewBidModal(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Cancel
                        </button>
                        <button type="submit"
                                className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold cursor-pointer">Save
                            Quotation
                        </button>
                    </div>
                </form>
            </div>
        )}

            {pendingSaleConfirm && (
                <div
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div
                        className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <ShoppingBag className="w-4 h-4"/></div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Confirm Stock
                                        Deduction &amp; Sale</h3>
                                    <p className="text-[11px] text-slate-500">Review stock balance before updating
                                        inventory</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPendingSaleConfirm(null)}
                                    className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X
                                className="w-4 h-4"/></button>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Product SKU:</span>
                                <strong
                                    className="text-slate-900">{pendingSaleConfirm.item.name} ({pendingSaleConfirm.item.sku})</strong>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Quantity to Deduct:</span>
                                <strong
                                    className="text-rose-600 text-sm">-{pendingSaleConfirm.qty} {pendingSaleConfirm.item.uom}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">Warehouse Stock Balance:</span>
                                <span className="font-bold text-slate-900">
                  {pendingSaleConfirm.item.stock} {pendingSaleConfirm.item.uom} &rarr;{' '}
                                    <strong
                                        className={pendingSaleConfirm.item.stock - pendingSaleConfirm.qty <= pendingSaleConfirm.item.minThreshold ? 'text-rose-600' : 'text-emerald-700'}>
                    {Math.max(0, pendingSaleConfirm.item.stock - pendingSaleConfirm.qty)} {pendingSaleConfirm.item.uom}
                  </strong>
                </span>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                                <span className="text-slate-500">Auto-Generated Receivable Invoice:</span>
                                <strong
                                    className="text-emerald-700 text-sm">{sym} {fmtMoney(pendingSaleConfirm.qty * pendingSaleConfirm.item.priceRM * exchangeRate)}</strong>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setPendingSaleConfirm(null)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">Cancel
                            </button>
                            <button type="button" onClick={() => {
                                onRecordStockUsage(pendingSaleConfirm.item.id, pendingSaleConfirm.qty);
                                setPendingSaleConfirm(null);
                            }}
                                    className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer">
                                Confirm &amp; Deduct Stock
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};