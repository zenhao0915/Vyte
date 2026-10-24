// src/services/complianceApi.ts
import type {
    BusinessComplianceProfile,
    DocumentVaultItem,
    RenewalTask,
} from '../types/vyte.ts';
import {requestJson} from "./api.ts";

const API_BASE = '/api/compliance';

const FALLBACK_KEYS = {
    PROFILES: 'vyte_fallback_compliance_profiles_v1',
    VAULT_DOCS: 'vyte_fallback_vault_docs_v1',
    RENEWAL_TASKS: 'vyte_fallback_renewal_tasks_v1',
};

export const DEFAULT_SEED_PROFILES: BusinessComplianceProfile[] = [
    {
        registrationNo: 'BLD-UNIT-88A',
        companyName: 'BANGSAR SOUTH HQ - 3RD FLOOR',
        companyType: 'SDN_BHD',
        ssmExpiryDate: '2027-12-31',
        councilName: 'BUILDING_MANAGEMENT',
        licenseType: 'BUILDING_RENTAL_CONTRACT',
        licenseExpiryDate: '2027-01-31',
        complianceStatus: 'COMPLIANT',
        autoAlertEnabled: true,
        assetCategory: 'RENTAL_CONTRACT',
        annualFeeRM: 12000,
        fiveYearDiscountPct: 20,
        selectedRenewalTermYears: 1,
    },
    {
        registrationNo: 'JPJ-VAA9921',
        companyName: 'COLD-CHAIN LOGISTICS VAN #04',
        companyType: 'SDN_BHD',
        ssmExpiryDate: '2027-06-30',
        councilName: 'JPJ / PUSPAKOM Commercial Fleet',
        licenseType: 'FLEET_ROADTAX_PUSPAKOM',
        licenseExpiryDate: '2026-11-20',
        complianceStatus: 'EXPIRING_SOON',
        autoAlertEnabled: true,
        assetCategory: 'FLEET_VEHICLE',
        annualFeeRM: 860,
        fiveYearDiscountPct: 15,
        selectedRenewalTermYears: 1,
    },
    {
        registrationNo: 'WARR-CHILL-09',
        companyName: 'DAIKIN INDUSTRIAL CHILLER UNIT',
        companyType: 'SDN_BHD',
        ssmExpiryDate: '2027-12-31',
        councilName: 'OEM_EQUIPMENT_VENDOR',
        licenseType: 'EQUIPMENT_OEM_WARRANTY',
        licenseExpiryDate: '2026-12-05',
        complianceStatus: 'EXPIRING_SOON',
        autoAlertEnabled: true,
        assetCategory: 'EQUIPMENT_WARRANTY',
        annualFeeRM: 1500,
        fiveYearDiscountPct: 22,
        selectedRenewalTermYears: 3,
    },
    {
        registrationNo: 'SOFT-MSFT-365',
        companyName: 'MICROSOFT 365 & AZURE ENTERPRISE SEAT',
        companyType: 'SDN_BHD',
        ssmExpiryDate: '2027-12-31',
        councilName: 'SOFTWARE_VENDOR',
        licenseType: 'SOFTWARE_SUBSCRIPTION',
        licenseExpiryDate: '2027-03-15',
        complianceStatus: 'COMPLIANT',
        autoAlertEnabled: true,
        assetCategory: 'SOFTWARE_LICENSE',
        annualFeeRM: 4800,
        fiveYearDiscountPct: 25,
        selectedRenewalTermYears: 3,
    },
];

export const DEFAULT_SEED_VAULT_DOCS: DocumentVaultItem[] = [
    {
        docID: 'DOC-99401',
        registrationNo: 'BLD-UNIT-88A',
        docType: 'TENANCY_AGREEMENT',
        fileUrl: '#preview-DOC-99401',
        fileSizeKb: 1420,
        effectiveDate: '2025-02-01',
        expiryDate: '2027-01-31',
        uploadedAt: '2025-02-01T09:30:00.000Z',
        uploadedBy: 'SME_OWNER',
        notes: 'Stamped LHDN Tenancy Agreement - Bangsar South HQ 3rd Floor',
    },
    {
        docID: 'DOC-99402',
        registrationNo: 'JPJ-VAA9921',
        docType: 'PUSPAKOM_INSPECTION_SLIP',
        fileUrl: '#preview-DOC-99402',
        fileSizeKb: 845,
        effectiveDate: '2026-05-20',
        expiryDate: '2026-11-20',
        uploadedAt: '2026-05-21T10:15:00.000Z',
        uploadedBy: 'SME_OWNER',
        notes: 'VR1 Commercial Vehicle 6-Month Inspection Report',
    },
    {
        docID: 'DOC-99403',
        registrationNo: 'WARR-CHILL-09',
        docType: 'EQUIPMENT_WARRANTY_CERT',
        fileUrl: '#preview-DOC-99403',
        fileSizeKb: 1120,
        effectiveDate: '2024-12-05',
        expiryDate: '2026-12-05',
        uploadedAt: '2024-12-06T08:00:00.000Z',
        uploadedBy: 'SME_OWNER',
        notes: 'OEM Compressor & Preventive Maintenance Warranty Card',
    },
    {
        docID: 'DOC-99404',
        registrationNo: 'SOFT-MSFT-365',
        docType: 'SOFTWARE_EULA_CONTRACT',
        fileUrl: '#preview-DOC-99404',
        fileSizeKb: 980,
        effectiveDate: '2026-03-15',
        expiryDate: '2027-03-15',
        uploadedAt: '2026-03-15T14:20:00.000Z',
        uploadedBy: 'SME_OWNER',
        notes: 'Enterprise SaaS Master Services Agreement (MSA)',
    },
];

const readLocal = <T>(key: string, fallback: T): T => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
};

const writeLocal = <T>(key: string, data: T): void => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch {
        // ignore storage quota errors
    }
};

export const complianceApi = {
    async getProfiles(): Promise<BusinessComplianceProfile[]> {
        try {
            const list = await requestJson<BusinessComplianceProfile[]>(`${API_BASE}/profiles`);
            if (Array.isArray(list) && list.length > 0) {
                writeLocal(FALLBACK_KEYS.PROFILES, list);
                return list;
            }
            const seed = readLocal(FALLBACK_KEYS.PROFILES, DEFAULT_SEED_PROFILES);
            await this.syncProfiles(seed).catch(() => {});
            return seed;
        } catch {
            return readLocal(FALLBACK_KEYS.PROFILES, DEFAULT_SEED_PROFILES);
        }
    },

    async saveProfile(profile: BusinessComplianceProfile): Promise<BusinessComplianceProfile> {
        const current = readLocal(FALLBACK_KEYS.PROFILES, DEFAULT_SEED_PROFILES);
        const updated = [
            profile,
            ...current.filter((p) => p.registrationNo.toUpperCase() !== profile.registrationNo.toUpperCase()),
        ];
        writeLocal(FALLBACK_KEYS.PROFILES, updated);
        try {
            return await requestJson<BusinessComplianceProfile>(`${API_BASE}/profiles`, {
                method: 'POST',
                body: JSON.stringify(profile),
            });
        } catch {
            return profile;
        }
    },

    async syncProfiles(profiles: BusinessComplianceProfile[]): Promise<BusinessComplianceProfile[]> {
        writeLocal(FALLBACK_KEYS.PROFILES, profiles);
        return requestJson<BusinessComplianceProfile[]>(`${API_BASE}/profiles`, {
            method: 'PUT',
            body: JSON.stringify(profiles),
        });
    },

    async getVaultDocs(): Promise<DocumentVaultItem[]> {
        try {
            const list = await requestJson<DocumentVaultItem[]>(`${API_BASE}/vault-docs`);
            if (Array.isArray(list) && list.length > 0) {
                writeLocal(FALLBACK_KEYS.VAULT_DOCS, list);
                return list;
            }
            const seed = readLocal(FALLBACK_KEYS.VAULT_DOCS, DEFAULT_SEED_VAULT_DOCS);
            await this.syncVaultDocs(seed).catch(() => {});
            return seed;
        } catch {
            return readLocal(FALLBACK_KEYS.VAULT_DOCS, DEFAULT_SEED_VAULT_DOCS);
        }
    },

    async saveVaultDoc(doc: DocumentVaultItem): Promise<DocumentVaultItem> {
        const current = readLocal(FALLBACK_KEYS.VAULT_DOCS, DEFAULT_SEED_VAULT_DOCS);
        const updated = [doc, ...current.filter((d) => d.docID !== doc.docID)];
        writeLocal(FALLBACK_KEYS.VAULT_DOCS, updated);
        try {
            return await requestJson<DocumentVaultItem>(`${API_BASE}/vault-docs`, {
                method: 'POST',
                body: JSON.stringify(doc),
            });
        } catch {
            return doc;
        }
    },

    async deleteVaultDoc(docID: string): Promise<void> {
        const current = readLocal(FALLBACK_KEYS.VAULT_DOCS, DEFAULT_SEED_VAULT_DOCS);
        const updated = current.filter((d) => d.docID !== docID);
        writeLocal(FALLBACK_KEYS.VAULT_DOCS, updated);
        try {
            await requestJson(`${API_BASE}/vault-docs/${encodeURIComponent(docID)}`, {
                method: 'DELETE',
            });
        } catch {
            await this.syncVaultDocs(updated).catch(() => {});
        }
    },

    async syncVaultDocs(docs: DocumentVaultItem[]): Promise<DocumentVaultItem[]> {
        writeLocal(FALLBACK_KEYS.VAULT_DOCS, docs);
        return requestJson<DocumentVaultItem[]>(`${API_BASE}/vault-docs`, {
            method: 'PUT',
            body: JSON.stringify(docs),
        });
    },

    async getRenewalTasks(): Promise<RenewalTask[]> {
        try {
            const list = await requestJson<RenewalTask[]>(`${API_BASE}/renewal-tasks`);
            if (Array.isArray(list)) {
                writeLocal(FALLBACK_KEYS.RENEWAL_TASKS, list);
                return list;
            }
            return readLocal(FALLBACK_KEYS.RENEWAL_TASKS, []);
        } catch {
            return readLocal(FALLBACK_KEYS.RENEWAL_TASKS, []);
        }
    },

    async saveRenewalTask(task: RenewalTask): Promise<RenewalTask> {
        const current = readLocal<RenewalTask[]>(FALLBACK_KEYS.RENEWAL_TASKS, []);
        const updated = [task, ...current.filter((t) => t.renewalID !== task.renewalID)];
        writeLocal(FALLBACK_KEYS.RENEWAL_TASKS, updated);
        try {
            return await requestJson<RenewalTask>(`${API_BASE}/renewal-tasks`, {
                method: 'POST',
                body: JSON.stringify(task),
            });
        } catch {
            return task;
        }
    },
};