// src/modules/module1-restock/AddProductModal.tsx
import React, { useState } from 'react';
import type { IndustryProfile, NewProductForm } from '../../types/orbyte';

interface AddProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaveProduct: (form: NewProductForm) => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onSaveProduct }) => {
    const [form, setForm] = useState<NewProductForm>({
        name: '',
        sku: '',
        category: 'F&B Raw Ingredient',
        industry: 'FNB_PERISHABLE',
        uom: 'kg',
        stock: 5,
        minThreshold: 15,
        reorderQty: 30,
        priceRM: 45.0,
        supplierName: '',
        supplierContact: '',
        extraAttr: '',
    });

    // Dedicated states for industry-specific fields
    const [batchNo, setBatchNo] = useState('B-2026-10');
    const [expiryDate, setExpiryDate] = useState('2026-11-15');
    const [retailVariant, setRetailVariant] = useState('Size: L | Color: Matte Black');
    const [b2bMoq, setB2bMoq] = useState('MOQ: 20 units | Lead: 3 days');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Assemble structured industry attributes based on selected profile
        let extraAttributeString = '';
        if (form.industry === 'FNB_PERISHABLE') {
            extraAttributeString = `Batch: ${batchNo || 'N/A'} • Exp: ${expiryDate || 'N/A'}`;
        } else if (form.industry === 'RETAIL_VARIANT') {
            extraAttributeString = retailVariant;
        } else {
            extraAttributeString = b2bMoq;
        }

        onSaveProduct({
            ...form,
            extraAttr: extraAttributeString,
        });

        onClose();
    };

    const inputClasses =
        'w-full px-3 py-2 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#2BB656] focus:ring-2 focus:ring-[#2BB656]/20 transition';

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <form
                onSubmit={handleSubmit}
                className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200 my-8"
            >
                <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-bold text-slate-900">Add Universal SME Product</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Adapts tracking schema dynamically across F&amp;B, Retail, and B2B wholesale.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Industry Selector */}
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Target SME Industry Profile</label>
                        <select
                            value={form.industry}
                            onChange={(e) => {
                                const ind = e.target.value as IndustryProfile;
                                setForm({
                                    ...form,
                                    industry: ind,
                                    category:
                                        ind === 'FNB_PERISHABLE'
                                            ? 'F&B Raw Ingredient'
                                            : ind === 'RETAIL_VARIANT'
                                                ? 'Apparel & Accessories'
                                                : 'Packaging & Raw Material',
                                    uom: ind === 'FNB_PERISHABLE' ? 'kg' : ind === 'RETAIL_VARIANT' ? 'pcs' : 'box',
                                });
                            }}
                            className={inputClasses}
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
                            required
                            type="text"
                            placeholder="e.g., Premium Matcha Powder"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    {/* SKU */}
                    <div className="col-span-2 sm:col-span-1">
                        <label className="font-semibold text-slate-700 block mb-1">SKU / Barcode</label>
                        <input
                            type="text"
                            placeholder="Auto-generated if empty"
                            value={form.sku}
                            onChange={(e) => setForm({ ...form, sku: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Unit of Measure */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Unit of Measure (UOM)</label>
                        <select
                            value={form.uom}
                            onChange={(e) => setForm({ ...form, uom: e.target.value })}
                            className={inputClasses}
                        >
                            <option value="pcs">Pieces (pcs)</option>
                            <option value="kg">Kilograms (kg)</option>
                            <option value="L">Liters (L)</option>
                            <option value="box">Boxes (box)</option>
                            <option value="pack">Packs (pack)</option>
                        </select>
                    </div>

                    {/* Unit Selling Price */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Selling Price (MYR) *</label>
                        <input
                            required
                            type="number"
                            step="0.10"
                            min="0"
                            value={form.priceRM}
                            onChange={(e) => setForm({ ...form, priceRM: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Initial Stock */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Initial Current Stock *</label>
                        <input
                            required
                            type="number"
                            min="0"
                            value={form.stock}
                            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Min Alert Threshold */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Alert Threshold (Min Stock) *</label>
                        <input
                            required
                            type="number"
                            min="1"
                            value={form.minThreshold}
                            onChange={(e) => setForm({ ...form, minThreshold: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Default Reorder Qty */}
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">Default Auto-Reorder Quantity *</label>
                        <input
                            required
                            type="number"
                            min="1"
                            value={form.reorderQty}
                            onChange={(e) => setForm({ ...form, reorderQty: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Supplier Name */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier Business Name *</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g., Uji Wholesale MY"
                            value={form.supplierName}
                            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Supplier Contact */}
                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier WhatsApp / Phone *</label>
                        <input
                            required
                            type="text"
                            placeholder="+6012-3456789"
                            value={form.supplierContact}
                            onChange={(e) => setForm({ ...form, supplierContact: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    {/* Dynamic Industry Attributes */}
                    {form.industry === 'FNB_PERISHABLE' && (
                        <>
                            <div>
                                <label className="font-semibold text-purple-700 block mb-1">Batch Number (F&amp;B)</label>
                                <input
                                    type="text"
                                    placeholder="e.g., B-2026-99"
                                    value={batchNo}
                                    onChange={(e) => setBatchNo(e.target.value)}
                                    className={inputClasses}
                                />
                            </div>
                            <div>
                                <label className="font-semibold text-purple-700 block mb-1">Expiry Date (F&amp;B) *</label>
                                <input
                                    type="date"
                                    value={expiryDate}
                                    onChange={(e) => setExpiryDate(e.target.value)}
                                    className={inputClasses}
                                />
                            </div>
                        </>
                    )}

                    {form.industry === 'RETAIL_VARIANT' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-blue-700 block mb-1">Size / Color Variant Spec</label>
                            <input
                                type="text"
                                placeholder="e.g., Size: S/M/L • Color: Navy Blue"
                                value={retailVariant}
                                onChange={(e) => setRetailVariant(e.target.value)}
                                className={inputClasses}
                            />
                        </div>
                    )}

                    {form.industry === 'B2B_RAW_MATERIAL' && (
                        <div className="col-span-2">
                            <label className="font-semibold text-emerald-700 block mb-1">B2B Order Constraints</label>
                            <input
                                type="text"
                                placeholder="e.g., MOQ: 25 Boxes • Lead Time: 3 Business Days"
                                value={b2bMoq}
                                onChange={(e) => setB2bMoq(e.target.value)}
                                className={inputClasses}
                            />
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