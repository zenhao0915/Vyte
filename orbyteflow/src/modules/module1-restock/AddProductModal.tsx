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
        category: 'General Merchandise',
        industry: 'FNB_PERISHABLE',
        uom: 'pcs',
        stock: 5,
        minThreshold: 10,
        reorderQty: 25,
        priceRM: 50,
        supplierName: '',
        supplierContact: '',
        extraAttr: '',
    });

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSaveProduct(form);
    };

    const inputClasses =
        'w-full px-3 py-2.5 bg-white text-slate-900 placeholder-slate-400 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:border-[#2BB656] focus:ring-2 focus:ring-[#2BB656]/20 transition';

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <form
                onSubmit={handleSubmit}
                className="bg-white text-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200"
            >
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Add Universal SME Product</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Select the SME industry profile below to dynamically adapt tracking attributes.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-xs">
                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">SME Industry Profile</label>
                        <select
                            value={form.industry}
                            onChange={(e) => setForm({ ...form, industry: e.target.value as IndustryProfile })}
                            className={inputClasses}
                        >
                            <option value="FNB_PERISHABLE" className="bg-white text-slate-900">
                                F&amp;B / Grocery (Tracks Batch &amp; Expiry Date)
                            </option>
                            <option value="RETAIL_VARIANT" className="bg-white text-slate-900">
                                Retail / Fashion / Electronics (Tracks Size/Color/Serial)
                            </option>
                            <option value="B2B_RAW_MATERIAL" className="bg-white text-slate-900">
                                B2B / Manufacturing (Tracks MOQ &amp; Lead Time)
                            </option>
                        </select>
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Product Name *</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g., Matcha Powder Grade A"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Unit of Measure (UOM)</label>
                        <select
                            value={form.uom}
                            onChange={(e) => setForm({ ...form, uom: e.target.value })}
                            className={inputClasses}
                        >
                            <option value="pcs" className="bg-white text-slate-900">Pieces (pcs)</option>
                            <option value="kg" className="bg-white text-slate-900">Kilograms (kg)</option>
                            <option value="L" className="bg-white text-slate-900">Liters (L)</option>
                            <option value="box" className="bg-white text-slate-900">Boxes (box)</option>
                        </select>
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Initial Stock</label>
                        <input
                            type="number"
                            value={form.stock}
                            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Alert Min Threshold</label>
                        <input
                            type="number"
                            value={form.minThreshold}
                            onChange={(e) => setForm({ ...form, minThreshold: Number(e.target.value) })}
                            className={inputClasses}
                        />
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier Name *</label>
                        <input
                            required
                            type="text"
                            placeholder="e.g., Uji Tea Supplier MY"
                            value={form.supplierName}
                            onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    <div>
                        <label className="font-semibold text-slate-700 block mb-1">Supplier WhatsApp / Email *</label>
                        <input
                            required
                            type="text"
                            placeholder="+6012-3344556"
                            value={form.supplierContact}
                            onChange={(e) => setForm({ ...form, supplierContact: e.target.value })}
                            className={inputClasses}
                        />
                    </div>

                    <div className="col-span-2">
                        <label className="font-semibold text-slate-700 block mb-1">
                            {form.industry === 'FNB_PERISHABLE'
                                ? 'Batch No & Expiry Date (e.g., B-102 • 2026-11-15)'
                                : 'Variant / B2B Specification (e.g., Size: XL or MOQ: 20 Boxes)'}
                        </label>
                        <input
                            type="text"
                            placeholder="Enter industry-specific tracking info..."
                            value={form.extraAttr}
                            onChange={(e) => setForm({ ...form, extraAttr: e.target.value })}
                            className={inputClasses}
                        />
                    </div>
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