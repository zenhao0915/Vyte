// src/modules/module1-restock/AddProductModal.tsx
import React, { useState } from 'react';
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
    name: string;
    sku: string;
    category: string;
    industry: IndustryProfile;
    uom: string;
    stock: string;
    minThreshold: string;
    reorderQty: string;
    priceRM: string;
    unitCostRM: string;
    supplierName: string;
    supplierContact: string;
    batchNo: string;
    expiryDate: string;
    storageCondition: 'Ambient' | 'Chilled' | 'Frozen';
    variantSpec: string;
    b2bMoq: string;
    serialOrWarranty: string;
}

type ValidationErrors = Partial<Record<keyof FormDraft, string>>;
const ADD_PROD_DRAFT_KEY = 'vyte_add_product_draft_v2';

const isValidWhatsAppNumber = (phone: string): boolean => {
    const trimmed = phone.trim();
    const myPhoneRegex = /^(\+?60|0)1[0-9]-?[0-9]{7,8}$/;
    return myPhoneRegex.test(trimmed);
};

export const AddProductModal: React.FC<AddProductModalProps> = ({
                                                                    isOpen,
                                                                    currency = 'MYR',
                                                                    onClose,
                                                                    onSaveProduct,
                                                                }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';

    const [draft, setDraft] = useState<FormDraft>(() => {
        try {
            const saved = localStorage.getItem(ADD_PROD_DRAFT_KEY);
            if (saved) return JSON.parse(saved) as FormDraft;
        } catch {
            // ignore
        }
        return {
            name: '',
            sku: '',
            category: 'F&B Raw Ingredient',
            industry: 'FNB_PERISHABLE',
            uom: 'kg',
            stock: '',
            minThreshold: '',
            reorderQty: '',
            priceRM: '',
            unitCostRM: '',
            supplierName: '',
            supplierContact: '',
            batchNo: '',
            expiryDate: '',
            storageCondition: 'Chilled',
            variantSpec: '',
            b2bMoq: '',
            serialOrWarranty: '',
        };
    });

    React.useEffect(() => {
        localStorage.setItem(ADD_PROD_DRAFT_KEY, JSON.stringify(draft));
    }, [draft]);

    const [errors, setErrors] = useState<ValidationErrors>({});

    if (!isOpen) return null;

    const validateField = (field: keyof FormDraft, value: string, currentDraft: FormDraft): string => {
        switch (field) {
            case 'name':
                if (!value.trim()) return 'Product name is required.';
                if (value.trim().length < 3) return 'Product name must be at least 3 characters.';
                return '';

            case 'sku':
                if (value.trim() && !/^[A-Za-z0-9-_]{3,20}$/.test(value.trim())) {
                    return 'SKU must be 3–20 alphanumeric characters (e.g., FNB-4886).';
                }
                return '';

            case 'priceRM': {
                const trimmed = value.trim();
                if (!trimmed) return 'Selling price is required.';
                if (trimmed.startsWith('0')) return 'Selling price cannot start with 0.';
                if (!/^[1-9]\d*(\.\d{1,2})?$/.test(trimmed)) {
                    return 'Enter a valid price greater than 0 (e.g., 45.00).';
                }
                const num = Number(trimmed);
                if (num > 1000000) return `Selling price cannot exceed ${currencySymbol} 1,000,000.`;
                return '';
            }

            case 'stock': {
                const trimmed = value.trim();
                if (!trimmed) return 'Initial current stock is required.';
                if (!/^\d+$/.test(trimmed)) return 'Initial stock must be whole numbers (0-9).';
                const num = Number(trimmed);
                if (num > 999999) return 'Initial stock cannot exceed 999,999.';
                return '';
            }

            case 'minThreshold': {
                const trimmed = value.trim();
                if (!trimmed) return 'Alert threshold (min stock) is required.';
                if (trimmed.startsWith('0') || !/^[1-9]\d*$/.test(trimmed)) {
                    return 'Alert threshold cannot start with 0 and must be at least 1.';
                }
                if (Number(trimmed) > 99999) return 'Alert threshold cannot exceed 99,999.';
                return '';
            }

            case 'reorderQty': {
                const trimmed = value.trim();
                if (!trimmed) return 'Default reorder quantity is required.';
                if (trimmed.startsWith('0') || !/^[1-9]\d*$/.test(trimmed)) {
                    return 'Reorder quantity cannot start with 0 and must be at least 1.';
                }
                return '';
            }

            case 'supplierName':
                if (!value.trim()) return 'Supplier business name is required.';
                if (value.trim().length < 2) return 'Supplier name must be at least 2 characters.';
                return '';

            case 'supplierContact':
                if (!value.trim()) return 'Supplier WhatsApp number is required.';
                if (!isValidWhatsAppNumber(value)) {
                    return 'Invalid WhatsApp number. Use MY format (e.g., +6012-3456789 or 0123456789).';
                }
                return '';

            case 'batchNo':
                if (currentDraft.industry === 'FNB_PERISHABLE' && !value.trim()) {
                    return 'Batch number is required for F&B items.';
                }
                return '';

            case 'expiryDate':
                if (currentDraft.industry === 'FNB_PERISHABLE' && !value.trim()) {
                    return 'Expiry date is required for F&B items.';
                }
                return '';

            case 'variantSpec':
                if (currentDraft.industry === 'RETAIL_VARIANT' && !value.trim()) {
                    return 'Variant specification is required.';
                }
                return '';

            case 'b2bMoq':
                if (currentDraft.industry === 'B2B_RAW_MATERIAL' && !value.trim()) {
                    return 'B2B MOQ and lead time constraint is required.';
                }
                return '';

            default:
                return '';
        }
    };

    const handleChange = (field: keyof FormDraft, rawValue: string) => {
        const updated = { ...draft, [field]: rawValue };
        setDraft(updated);

        const fieldError = validateField(field, rawValue, updated);
        setErrors((prev) => ({ ...prev, [field]: fieldError }));
    };

    const validateAll = (): boolean => {
        const fieldsToCheck: (keyof FormDraft)[] = [
            'name',
            'sku',
            'priceRM',
            'stock',
            'minThreshold',
            'reorderQty',
            'supplierName',
            'supplierContact',
            'batchNo',
            'expiryDate',
            'variantSpec',
            'b2bMoq',
        ];

        const newErrors: ValidationErrors = {};
        let isValid = true;

        fieldsToCheck.forEach((f) => {
            const err = validateField(f, draft[f], draft);
            if (err) {
                newErrors[f] = err;
                isValid = false;
            }
        });

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateAll()) return;

        let extraAttributeString = '';
        if (draft.industry === 'FNB_PERISHABLE') {
            extraAttributeString = `Batch: ${draft.batchNo.trim()} • Exp: ${draft.expiryDate.trim()} • Storage: ${draft.storageCondition}`;
        } else if (draft.industry === 'RETAIL_VARIANT') {
            extraAttributeString = draft.variantSpec.trim();
        } else {
            extraAttributeString = draft.b2bMoq.trim();
        }

        onSaveProduct({
            name: draft.name.trim(),
            sku: draft.sku.trim(),
            category: draft.category,
            industry: draft.industry,
            uom: draft.uom,
            stock: Number(draft.stock),
            minThreshold: Number(draft.minThreshold),
            reorderQty: Number(draft.reorderQty),
            priceRM: Number(draft.priceRM),
            supplierName: draft.supplierName.trim(),
            supplierContact: draft.supplierContact.trim(),
            extraAttr: extraAttributeString,
        });

        onClose();
    };

    const getInputClass = (field: keyof FormDraft) =>
        `w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 transition ${
            errors[field]
                ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/20 bg-rose-50/20'
                : 'border-slate-300 focus:border-[#2BB656] focus:ring-[#2BB656]/20'
        }`;

    const renderError = (field: keyof FormDraft) =>
        errors[field] ? (
            <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> {errors[field]}
            </p>
        ) : null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <form
                onSubmit={handleSubmit}
                noValidate
                className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 my-8"
            >
                <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-bold text-slate-900">Add Universal Product</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Target SME Industry Profile</label>
                        <VyteDropdown<IndustryProfile>
                            variant="light"
                            value={draft.industry}
                            onChange={(ind: IndustryProfile) => {
                                setDraft({
                                    ...draft,
                                    industry: ind,
                                    category:
                                        ind === 'FNB_PERISHABLE'
                                            ? 'F&B Raw Ingredient'
                                            : ind === 'RETAIL_VARIANT'
                                                ? 'Apparel & Accessories'
                                                : 'Packaging & Raw Material',
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
                        <input
                            type="text"
                            placeholder="e.g., Premium Matcha Powder"
                            value={draft.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            className={getInputClass('name')}
                        />
                        {renderError('name')}
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                        <label className="font-semibold text-slate-700 block mb-1">SKU / Barcode</label>
                        <input
                            type="text"
                            placeholder="e.g., FNB-4886"
                            value={draft.sku}
                            onChange={(e) => handleChange('sku', e.target.value)}
                            className={getInputClass('sku')}
                        />
                        {renderError('sku')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Unit of Measure (UOM)</label>
                        <VyteDropdown<string>
                            variant="light"
                            value={draft.uom}
                            onChange={(val: string) => handleChange('uom', val)}
                            options={[
                                { label: 'Pieces (pcs)', value: 'pcs' },
                                { label: 'Kilograms (kg)', value: 'kg' },
                                { label: 'Liters (L)', value: 'L' },
                                { label: 'Boxes (box)', value: 'box' },
                                { label: 'Packs (pack)', value: 'pack' },
                            ]}
                        />
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">
                            Selling Price ({currency}) *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., 45.00"
                            value={draft.priceRM}
                            onChange={(e) => handleChange('priceRM', e.target.value)}
                            className={getInputClass('priceRM')}
                        />
                        {renderError('priceRM')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Initial Current Stock *</label>
                        <input
                            type="text"
                            placeholder="e.g., 10"
                            value={draft.stock}
                            onChange={(e) => handleChange('stock', e.target.value)}
                            className={getInputClass('stock')}
                        />
                        {renderError('stock')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Alert Threshold (Min Stock) *</label>
                        <input
                            type="text"
                            placeholder="e.g., 15"
                            value={draft.minThreshold}
                            onChange={(e) => handleChange('minThreshold', e.target.value)}
                            className={getInputClass('minThreshold')}
                        />
                        {renderError('minThreshold')}
                    </div>

                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Default Reorder Quantity *</label>
                        <input
                            type="text"
                            placeholder="e.g., 30"
                            value={draft.reorderQty}
                            onChange={(e) => handleChange('reorderQty', e.target.value)}
                            className={getInputClass('reorderQty')}
                        />
                        {renderError('reorderQty')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier Business Name *</label>
                        <input
                            type="text"
                            placeholder="e.g., Uji Wholesale MY"
                            value={draft.supplierName}
                            onChange={(e) => handleChange('supplierName', e.target.value)}
                            className={getInputClass('supplierName')}
                        />
                        {renderError('supplierName')}
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier WhatsApp Number *</label>
                        <input
                            type="tel"
                            placeholder="e.g., +6012-3456789"
                            value={draft.supplierContact}
                            onChange={(e) => handleChange('supplierContact', e.target.value)}
                            className={getInputClass('supplierContact')}
                        />
                        {renderError('supplierContact')}
                    </div>

                    {draft.industry === 'FNB_PERISHABLE' && (
                        <>
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Batch Number *</label>
                                <input
                                    type="text"
                                    placeholder="e.g., B-2026-10"
                                    value={draft.batchNo}
                                    onChange={(e) => handleChange('batchNo', e.target.value)}
                                    className={getInputClass('batchNo')}
                                />
                                {renderError('batchNo')}
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700 block mb-1">Expiry Date *</label>
                                <input
                                    type="date"
                                    value={draft.expiryDate}
                                    onChange={(e) => handleChange('expiryDate', e.target.value)}
                                    className={getInputClass('expiryDate')}
                                />
                                {renderError('expiryDate')}
                            </div>
                            <div className="col-span-2">
                                <label className="font-semibold text-slate-700 block mb-1">Storage Condition</label>
                                <VyteDropdown<'Ambient' | 'Chilled' | 'Frozen'>
                                    variant="light"
                                    value={draft.storageCondition}
                                    onChange={(val: 'Ambient' | 'Chilled' | 'Frozen') =>
                                        setDraft({ ...draft, storageCondition: val })
                                    }
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
                                <input
                                    type="text"
                                    placeholder="e.g., Size: L • Color: Matte Black"
                                    value={draft.variantSpec}
                                    onChange={(e) => handleChange('variantSpec', e.target.value)}
                                    className={getInputClass('variantSpec')}
                                />
                                {renderError('variantSpec')}
                            </div>
                            <div className="col-span-2">
                                <label className="font-semibold text-slate-700 block mb-1">Serial / Warranty Info</label>
                                <input
                                    type="text"
                                    placeholder="e.g., 1-Year Local Manufacturer Warranty"
                                    value={draft.serialOrWarranty}
                                    onChange={(e) => setDraft({ ...draft, serialOrWarranty: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#2BB656]"
                                />
                            </div>
                        </>
                    )}

                    {draft.industry === 'B2B_RAW_MATERIAL' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-slate-700 block mb-1">B2B Order Constraints *</label>
                            <input
                                type="text"
                                placeholder="e.g., MOQ: 20 Boxes • Lead Time: 3 Days"
                                value={draft.b2bMoq}
                                onChange={(e) => handleChange('b2bMoq', e.target.value)}
                                className={getInputClass('b2bMoq')}
                            />
                            {renderError('b2bMoq')}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-xs font-bold text-white bg-[#2BB656] hover:bg-emerald-600 rounded-xl shadow-xs transition cursor-pointer"
                    >
                        Save Product
                    </button>
                </div>
            </form>
        </div>
    );
};