// src/services/api.ts
import type { NewProductForm, UserRole } from '../types/orbyte';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const orbyteApi = {
    // Module 1: Create Product
    async createProduct(payload: NewProductForm) {
        const res = await fetch(`${API_BASE_URL}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return res.json();
    },

    // Module 1: Approve Restock & Contact Supplier
    async approveRestock(productId: string, approvedByRole: UserRole, orderQty: number) {
        const res = await fetch(`${API_BASE_URL}/restock/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, approvedByRole, finalOrderQty: orderQty }),
        });
        return res.json();
    },

    // Module 4: Approve Quality / Expiry AI Solution
    async resolveQualityAlert(qcId: string, approvedByRole: UserRole, actionLabel: string) {
        const res = await fetch(`${API_BASE_URL}/qc/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qcId, approvedByRole, selectedAction: actionLabel }),
        });
        return res.json();
    },

    // Module 5: Verify AI Invoice Categorization
    async verifyInvoice(invoiceId: string, verifiedByRole: UserRole) {
        const res = await fetch(`${API_BASE_URL}/invoices/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoiceId, verifiedByRole }),
        });
        return res.json();
    },
};