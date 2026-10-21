// src/modules/module1-restock/AddProductModal.tsx
import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { IndustryProfile, NewProductForm } from '../../types/orbyte';

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveProduct: (form: NewProductForm) => void;
}

interface FormDraft {
    name: string;
    sku: string;
    category: string;
    industry: IndustryProfile;
    uom: string;
    stock: string;         // String state prevents stuck leading '0'
    minThreshold: string;  // String state prevents stuck leading '0'
    reorderQty: string;    // String state prevents stuck leading '0'
    priceRM: string;       // String state prevents stuck leading '0'
    supplierName: string;
    supplierContact: string;
    batchNo: string;
    expiryDate: string;
    retailVariant: string;
    b2bMoq: string;
}

type ValidationErrors = Partial<Record<keyof FormDraft, string>>;

// Strips leading zeros when typing (e.g., "05" -> "5"), while allowing "0" or "0.50"
const sanitizeNumericInput = (raw: string, allowDecimal = false): string => {
    const cleaned = allowDecimal ? raw.replace(/[^0-9.]/g, '') : raw.replace(/[^0-9]/g, '');
    if (!allowDecimal) {
        return cleaned.replace(/^0+(?=\d)/, '');
    }
    // Allow only one decimal point and strip leading zeros before whole numbers
    const parts = cleaned.split('.');
    const integerPart = parts[0].replace(/^0+(?=\d)/, '');
    return parts.length > 1 ? `${integerPart || '0'}.${parts[1].slice(0, 2)}` : integerPart;
};

// Validates Malaysian WhatsApp numbers (+6012-3456789, 0123456789, +6011-12345678)
const isValidWhatsAppNumber = (phone: string): boolean => {
    const trimmed = phone.trim();
    const myPhoneRegex = /^(?:\+?60|0)1[0-9]-?[0-9]{7,8}$/;
    return myPhoneRegex.test(trimmed);
};

export const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onSaveProduct }) => {
    const [draft, setDraft] = useState<FormDraft>({
        name: '',
        sku: '',
        category: 'F&B Raw Ingredient',
        industry: 'FNB_PERISHABLE',
        uom: 'kg',
        stock: '',
        minThreshold: '',
        reorderQty: '',
        priceRM: '',
        supplierName: '',
        supplierContact: '',
        batchNo: '',
        expiryDate: '',
        retailVariant: '',
        b2bMoq: '',
    });

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
                if (value.trim() === '') return 'Selling price is required.';
                const num = Number(value);
                if (isNaN(num) || num <= 0) return 'Selling price must be greater than RM 0.00.';
                if (num > 1000000) return 'Selling price cannot exceed RM 1,000,000.';
                return '';
            }

            case 'stock': {
                if (value.trim() === '') return 'Initial current stock is required.';
                const num = Number(value);
                if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
                    return 'Initial stock must be a whole number (0 or greater).';
                }
                if (num > 999999) return 'Initial stock cannot exceed 999,999.';
                return '';
            }

            case 'minThreshold': {
                if (value.trim() === '') return 'Alert threshold (min stock) is required.';
                const num = Number(value);
                if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
                    return 'Alert threshold must be a whole number of at least 1.';
                }
                if (num > 99999) return 'Alert threshold cannot exceed 99,999.';
                return '';
            }

            case 'reorderQty': {
                if (value.trim() === '') return 'Default auto-reorder quantity is required.';
                const num = Number(value);
                if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
                    return 'Reorder quantity must be a whole number of at least 1.';
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
                    return 'Invalid format. Use MY WhatsApp format (e.g., +6012-3456789 or 0123456789).';
                }
                return '';

            case 'batchNo':
                if (currentDraft.industry === 'FNB_PERISHABLE' && !value.trim()) {
                    return 'Batch number is required for F&B items.';
                }
                return '';

            case 'expiryDate':
                if (currentDraft.industry === 'FNB_PERISHABLE') {
                    if (!value.trim()) return 'Expiry date is required for F&B items.';
                }
                return '';

            case 'retailVariant':
                if (currentDraft.industry === 'RETAIL_VARIANT' && !value.trim()) {
                    return 'Size/Color variant specification is required.';
                }
                return '';

            case 'b2bMoq':
                if (currentDraft.industry === 'B2B_RAW_MATERIAL' && !value.trim()) {
                    return 'B2B MOQ & lead time constraint is required.';
                }
                return '';

            default:
                return '';
        }
    };

    const handleChange = (field: keyof FormDraft, rawValue: string, isNumeric = false, allowDecimal = false) => {
        const processedValue = isNumeric ? sanitizeNumericInput(rawValue, allowDecimal) : rawValue;
        const updated = { ...draft, [field]: processedValue };
        setDraft(updated);

        const fieldError = validateField(field, processedValue, updated);
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
            'retailVariant',
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
            extraAttributeString = `Batch: ${draft.batchNo.trim()} • Exp: ${draft.expiryDate.trim()}`;
        } else if (draft.industry === 'RETAIL_VARIANT') {
            extraAttributeString = draft.retailVariant.trim();
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
                    <h3 className="text-lg font-bold text-slate-900">Add Universal SME Product</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        All fields include strict format &amp; boundary validation across F&amp;B, Retail, and B2B profiles.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Industry Selector */}
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Target SME Industry Profile</label>
                        <select
                            value={draft.industry}
                            onChange={(e) => {
                                const ind = e.target.value as IndustryProfile;
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
                            className={getInputClass('industry')}
                        >
                            <option value="FNB_PERISHABLE">F&amp;B / Cafe / Grocery (Tracks Batch &amp; Expiry Date)</option>
                            <option value="RETAIL_VARIANT">Retail &amp; Boutique (Tracks Sizes, Colors &amp; Variants)</option>
                            <option value="B2B_RAW_MATERIAL">B2B Manufacturing (Tracks MOQ &amp; Lead Time)</option>
                        </select>
                    </div>

                    {/* Product Name */}
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

                    {/* SKU */}
                    <div className="col-span-2 sm:col-span-1">
                        <label className="font-semibold text-slate-700 block mb-1">SKU / Barcode (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g., FNB-4886 (Auto if blank)"
                            value={draft.sku}
                            onChange={(e) => handleChange('sku', e.target.value)}
                            className={getInputClass('sku')}
                        />
                        {renderError('sku')}
                    </div>

                    {/* Unit of Measure */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Unit of Measure (UOM)</label>
                        <select
                            value={draft.uom}
                            onChange={(e) => handleChange('uom', e.target.value)}
                            className={getInputClass('uom')}
                        >
                            <option value="pcs">Pieces (pcs)</option>
                            <option value="kg">Kilograms (kg)</option>
                            <option value="L">Liters (L)</option>
                            <option value="box">Boxes (box)</option>
                            <option value="pack">Packs (pack)</option>
                        </select>
                    </div>

                    {/* Selling Price (MYR) */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Selling Price (MYR) *</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g., 45.00"
                            value={draft.priceRM}
                            onChange={(e) => handleChange('priceRM', e.target.value, true, true)}
                            className={getInputClass('priceRM')}
                        />
                        {renderError('priceRM')}
                    </div>

                    {/* Initial Current Stock */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Initial Current Stock *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g., 5"
                            value={draft.stock}
                            onChange={(e) => handleChange('stock', e.target.value, true, false)}
                            className={getInputClass('stock')}
                        />
                        {renderError('stock')}
                    </div>

                    {/* Alert Threshold (Min Stock) */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Alert Threshold (Min Stock) *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g., 15"
                            value={draft.minThreshold}
                            onChange={(e) => handleChange('minThreshold', e.target.value, true, false)}
                            className={getInputClass('minThreshold')}
                        />
                        {renderError('minThreshold')}
                    </div>

                    {/* Default Auto-Reorder Qty */}
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Default Auto-Reorder Quantity *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g., 30"
                            value={draft.reorderQty}
                            onChange={(e) => handleChange('reorderQty', e.target.value, true, false)}
                            className={getInputClass('reorderQty')}
                        />
                        {renderError('reorderQty')}
                    </div>

                    {/* Supplier Business Name */}
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

                    {/* Supplier WhatsApp Number */}
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

                    {/* Dynamic Industry Attributes */}
                    {draft.industry === 'FNB_PERISHABLE' && (
                        <>
                            <div>
                                <label className="font-semibold text-purple-700 block mb-1">Batch Number (F&amp;B) *</label>
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
                                <label className="font-semibold text-purple-700 block mb-1">Expiry Date (F&amp;B) *</label>
                                <input
                                    type="date"
                                    value={draft.expiryDate}
                                    onChange={(e) => handleChange('expiryDate', e.target.value)}
                                    className={getInputClass('expiryDate')}
                                />
                                {renderError('expiryDate')}
                            </div>
                        </>
                    )}

                    {draft.industry === 'RETAIL_VARIANT' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-blue-700 block mb-1">Size / Color Variant Spec *</label>
                            <input
                                type="text"
                                placeholder="e.g., Size: L • Color: Matte Black"
                                value={draft.retailVariant}
                                onChange={(e) => handleChange('retailVariant', e.target.value)}
                                className={getInputClass('retailVariant')}
                            />
                            {renderError('retailVariant')}
                        </div>
                    )}

                    {draft.industry === 'B2B_RAW_MATERIAL' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-emerald-700 block mb-1">B2B Order Constraints *</label>
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
                        className="px-4 py-2 text-xs font-bold text-white bg-[#2BB656] hover:bg-emerald-600 rounded-xl shadow-sm transition cursor-pointer"
                    >
                        Save Product &amp; Check Threshold
                    </button>
                </div>
            </form>
        </div>
    );
};