// src/modules/module1-restock/AddProductModal.tsx
import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import type { CurrencyCode, IndustryProfile, NewProductForm } from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown';

interface AddProductModalProps {
    isOpen: boolean;
    currency?: CurrencyCode;
    onClose: () => void;
    onSaveProduct: (form: NewProductForm) => void;
}

interface FormDraft {
    name: string; sku: string; category: string; industry: IndustryProfile; uom: string;
    stock: string; minThreshold: string; reorderQty: string; priceRM: string; unitCostRM: string;
    supplierName: string; supplierContact: string; batchNo: string; expiryDate: string;
    storageCondition: 'Ambient' | 'Chilled' | 'Frozen'; variantSpec: string; b2bMoq: string; serialOrWarranty: string;
}

const DRAFT_KEY = 'vyte_add_product_draft_v2';
const MY_PHONE_RE = /^(\+?60|0)1[0-9]-?[0-9]{7,8}$/;

export const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, currency = 'MYR', onClose, onSaveProduct }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const [draft, setDraft] = useState<FormDraft>(() => {
        try { const s = localStorage.getItem(DRAFT_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
        return {
            name: '', sku: '', category: 'F&B Raw Ingredient', industry: 'FNB_PERISHABLE', uom: 'kg',
            stock: '', minThreshold: '', reorderQty: '', priceRM: '', unitCostRM: '', supplierName: '',
            supplierContact: '', batchNo: '', expiryDate: '', storageCondition: 'Chilled', variantSpec: '', b2bMoq: '', serialOrWarranty: '',
        };
    });
    const [errors, setErrors] = useState<Partial<Record<keyof FormDraft, string>>>({});

    useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);
    if (!isOpen) return null;

    const validateField = (f: keyof FormDraft, val: string, d: FormDraft): string => {
        const v = val.trim();
        switch (f) {
            case 'name': return !v ? 'Product name is required.' : v.length < 3 ? 'Product name must be at least 3 characters.' : '';
            case 'sku': return v && !/^[A-Za-z0-9-_]{3,20}$/.test(v) ? 'SKU must be 3–20 alphanumeric characters (e.g., FNB-4886).' : '';
            case 'priceRM': return !v ? 'Selling price is required.' : v.startsWith('0') ? 'Selling price cannot start with 0.' : !/^[1-9]\d*(\.\d{1,2})?$/.test(v) ? 'Enter a valid price greater than 0 (e.g., 45.00).' : Number(v) > 1000000 ? `Selling price cannot exceed ${sym} 1,000,000.` : '';
            case 'stock': return !v ? 'Initial current stock is required.' : !/^\d+$/.test(v) ? 'Initial stock must be whole numbers (0-9).' : Number(v) > 999999 ? 'Initial stock cannot exceed 999,999.' : '';
            case 'minThreshold': return !v ? 'Alert threshold (min stock) is required.' : v.startsWith('0') || !/^[1-9]\d*$/.test(v) ? 'Alert threshold cannot start with 0 and must be at least 1.' : Number(v) > 99999 ? 'Alert threshold cannot exceed 99,999.' : '';
            case 'reorderQty': return !v ? 'Default reorder quantity is required.' : v.startsWith('0') || !/^[1-9]\d*$/.test(v) ? 'Reorder quantity cannot start with 0 and must be at least 1.' : '';
            case 'supplierName': return !v ? 'Supplier business name is required.' : v.length < 2 ? 'Supplier name must be at least 2 characters.' : '';
            case 'supplierContact': return !v ? 'Supplier WhatsApp number is required.' : !MY_PHONE_RE.test(v) ? 'Invalid WhatsApp number. Use MY format (e.g., +6012-3456789).' : '';
            case 'batchNo': return d.industry === 'FNB_PERISHABLE' && !v ? 'Batch number is required for F&B items.' : '';
            case 'expiryDate': return d.industry === 'FNB_PERISHABLE' && !v ? 'Expiry date is required for F&B items.' : '';
            case 'variantSpec': return d.industry === 'RETAIL_VARIANT' && !v ? 'Variant specification is required.' : '';
            case 'b2bMoq': return d.industry === 'B2B_RAW_MATERIAL' && !v ? 'B2B MOQ and lead time constraint is required.' : '';
            default: return '';
        }
    };

    const handleChange = (f: keyof FormDraft, val: string) => {
        const next = { ...draft, [f]: val };
        setDraft(next);
        setErrors((p) => ({ ...p, [f]: validateField(f, val, next) }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const keys: (keyof FormDraft)[] = ['name', 'sku', 'priceRM', 'stock', 'minThreshold', 'reorderQty', 'supplierName', 'supplierContact', 'batchNo', 'expiryDate', 'variantSpec', 'b2bMoq'];
        const nextErrs: Partial<Record<keyof FormDraft, string>> = {};
        keys.forEach((k) => { const err = validateField(k, draft[k], draft); if (err) nextErrs[k] = err; });
        setErrors(nextErrs);
        if (Object.keys(nextErrs).length > 0) return;

        const extraAttr = draft.industry === 'FNB_PERISHABLE'
            ? `Batch: ${draft.batchNo.trim()} • Exp: ${draft.expiryDate.trim()} • Storage: ${draft.storageCondition}`
            : draft.industry === 'RETAIL_VARIANT' ? draft.variantSpec.trim() : draft.b2bMoq.trim();

        onSaveProduct({
            name: draft.name.trim(), sku: draft.sku.trim(), category: draft.category, industry: draft.industry, uom: draft.uom,
            stock: Number(draft.stock), minThreshold: Number(draft.minThreshold), reorderQty: Number(draft.reorderQty),
            priceRM: Number(draft.priceRM), supplierName: draft.supplierName.trim(), supplierContact: draft.supplierContact.trim(), extraAttr,
        });
        onClose();
    };

    const inputCls = (f: keyof FormDraft) =>
        `w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 transition ${
            errors[f] ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20' : 'border-slate-300 focus:border-[#2BB656] focus:ring-[#2BB656]/20'
        }`;

    const errEl = (f: keyof FormDraft) => errors[f] ? <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {errors[f]}</p> : null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <form onSubmit={handleSubmit} noValidate className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 my-8">
                <div className="border-b border-slate-100 pb-3"><h3 className="text-lg font-bold text-slate-900">Add Universal Product</h3></div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Target SME Industry Profile</label>
                        <VyteDropdown<IndustryProfile>
                            variant="light" value={draft.industry}
                            onChange={(ind) => {
                                setDraft({
                                    ...draft, industry: ind,
                                    category: ind === 'FNB_PERISHABLE' ? 'F&B Raw Ingredient' : ind === 'RETAIL_VARIANT' ? 'Apparel & Accessories' : 'Packaging & Raw Material',
                                    uom: ind === 'FNB_PERISHABLE' ? 'kg' : ind === 'RETAIL_VARIANT' ? 'pcs' : 'box',
                                });
                                setErrors({});
                            }}
                            options={[
                                { label: 'F&B / Cafe / Grocery (Batch & Expiry)', value: 'FNB_PERISHABLE' },
                                { label: 'Retail & Boutique (Sizes & Colors)', value: 'RETAIL_VARIANT' },
                                { label: 'B2B Manufacturing (MOQ & Lead Time)', value: 'B2B_RAW_MATERIAL' },
                            ]}
                        />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                        <label className="font-semibold text-slate-700 block mb-1">Product Name *</label>
                        <input type="text" placeholder="e.g., Premium Matcha Powder" value={draft.name} onChange={(e) => handleChange('name', e.target.value)} className={inputCls('name')} />
                        {errEl('name')}
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                        <label className="font-semibold text-slate-700 block mb-1">SKU / Barcode</label>
                        <input type="text" placeholder="e.g., FNB-4886" value={draft.sku} onChange={(e) => handleChange('sku', e.target.value)} className={inputCls('sku')} />
                        {errEl('sku')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Unit of Measure (UOM)</label>
                        <VyteDropdown<string>
                            variant="light" value={draft.uom} onChange={(v) => handleChange('uom', v)}
                            options={[
                                { label: 'Pieces (pcs)', value: 'pcs' }, { label: 'Kilograms (kg)', value: 'kg' },
                                { label: 'Liters (L)', value: 'L' }, { label: 'Boxes (box)', value: 'box' }, { label: 'Packs (pack)', value: 'pack' },
                            ]}
                        />
                    </div>
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Selling Price ({currency}) *</label>
                        <input type="text" placeholder="e.g., 45.00" value={draft.priceRM} onChange={(e) => handleChange('priceRM', e.target.value)} className={inputCls('priceRM')} />
                        {errEl('priceRM')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Initial Current Stock *</label>
                        <input type="text" placeholder="e.g., 10" value={draft.stock} onChange={(e) => handleChange('stock', e.target.value)} className={inputCls('stock')} />
                        {errEl('stock')}
                    </div>
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Alert Threshold (Min Stock) *</label>
                        <input type="text" placeholder="e.g., 15" value={draft.minThreshold} onChange={(e) => handleChange('minThreshold', e.target.value)} className={inputCls('minThreshold')} />
                        {errEl('minThreshold')}
                    </div>

                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Default Reorder Quantity *</label>
                        <input type="text" placeholder="e.g., 30" value={draft.reorderQty} onChange={(e) => handleChange('reorderQty', e.target.value)} className={inputCls('reorderQty')} />
                        {errEl('reorderQty')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier Business Name *</label>
                        <input type="text" placeholder="e.g., Uji Wholesale MY" value={draft.supplierName} onChange={(e) => handleChange('supplierName', e.target.value)} className={inputCls('supplierName')} />
                        {errEl('supplierName')}
                    </div>
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier WhatsApp Number *</label>
                        <input type="tel" placeholder="e.g., +6012-3456789" value={draft.supplierContact} onChange={(e) => handleChange('supplierContact', e.target.value)} className={inputCls('supplierContact')} />
                        {errEl('supplierContact')}
                    </div>

                    {draft.industry === 'FNB_PERISHABLE' && (
                        <>
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Batch Number *</label>
                                <input type="text" placeholder="e.g., B-2026-10" value={draft.batchNo} onChange={(e) => handleChange('batchNo', e.target.value)} className={inputCls('batchNo')} />
                                {errEl('batchNo')}
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                                <input type="date" value={draft.expiryDate} onChange={(e) => handleChange('expiryDate', e.target.value)} className={inputCls('expiryDate')} />
                                {errEl('expiryDate')}
                            </div>
                            <div className="col-span-2">
                                <label className="font-semibold text-slate-700 block mb-1">Storage Condition</label>
                                <VyteDropdown<'Ambient' | 'Chilled' | 'Frozen'>
                                    variant="light" value={draft.storageCondition} onChange={(v) => setDraft({ ...draft, storageCondition: v })}
                                    options={[
                                        { label: 'Ambient / Room Temperature', value: 'Ambient' },
                                        { label: 'Chilled (2°C - 4°C)', value: 'Chilled' },
                                        { label: 'Frozen (-18°C)', value: 'Frozen' },
                                    ]}
                                />
                            </div>
                        </>
                    )}

                    {draft.industry === 'RETAIL_VARIANT' && (
                        <>
                            <div className="col-span-2">
                                <label className="font-semibold text-slate-700 block mb-1">Variant Specification *</label>
                                <input type="text" placeholder="e.g., Size: L • Color: Matte Black" value={draft.variantSpec} onChange={(e) => handleChange('variantSpec', e.target.value)} className={inputCls('variantSpec')} />
                                {errEl('variantSpec')}
                            </div>
                            <div className="col-span-2">
                                <label className="font-semibold text-slate-700 block mb-1">Serial / Warranty Info</label>
                                <input type="text" placeholder="e.g., 1-Year Local Manufacturer Warranty" value={draft.serialOrWarranty} onChange={(e) => setDraft({ ...draft, serialOrWarranty: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#2BB656]" />
                            </div>
                        </>
                    )}

                    {draft.industry === 'B2B_RAW_MATERIAL' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-slate-700 block mb-1">B2B Order Constraints *</label>
                            <input type="text" placeholder="e.g., MOQ: 20 Boxes • Lead Time: 3 Days" value={draft.b2bMoq} onChange={(e) => handleChange('b2bMoq', e.target.value)} className={inputCls('b2bMoq')} />
                            {errEl('b2bMoq')}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition cursor-pointer">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-[#2BB656] hover:bg-emerald-600 rounded-xl shadow-xs transition cursor-pointer">Save Product</button>
                </div>
            </form>
        </div>
    );
};