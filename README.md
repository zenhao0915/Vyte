# Vyte — Smart SME Operations & Inventory Intelligence Hub

**Team Name:** Haze&Dust  
**Selected Domain:** Domain 2  
**Selected SDG Tracks:** SDG 8 (Decent Work & Economic Growth), SDG 9 (Industry, Innovation & Infrastructure), SDG 12 (Responsible Consumption & Production)  
**University Affiliation:** Tunku Abdul Rahman University of Management and Technology (TAR UMT)

### Quick Links
* **Live Prototype (Replit):** [https://hazendust.replit.app](https://hazendust.replit.app)
* **GitHub Repository:** [https://github.com/zenhao0915/Vyte](https://github.com/zenhao0915/Vyte)
* **Preliminary Proposal PDF:** [`Submission/SDC2026_Haze&Dust_Preliminary.pdf`](https://github.com/zenhao0915/Vyte/blob/submission/Submission/SDC2026_%20Haze%26Dust_Preliminary.pdf)
* **Technical & Tools Declaration PDF:** [`Submission/SDC2026_Haze&Dust_TechDeclaration.pdf`](https://github.com/zenhao0915/Vyte/blob/submission/Submission/SDC2026_Haze%26Dust_TechDeclaration.pdf)
* **Slide Deck:** [`Slide/Vyte SME Inventory Management System Pitch Deck.pdf`](https://github.com/zenhao0915/Vyte/blob/submission/Slide/Vyte%20SME%20Inventory%20Management%20System%20Pitch%20Deck.pdf)
* **Demo Video:** *(https://youtu.be/9CxjuCDR_W0)*

---

## Overview

### Problem
Over 1 million Malaysian MSMEs still rely on paper, WhatsApp, and disconnected spreadsheets for daily operations. This manual workflow causes perishable stock waste, recurring supplier defects, fulfillment errors from multilingual orders, trapped working capital, and costly penalties from missed RMCD SST filings or lapsed statutory permits.

### Solution
**Vyte** is an AI-powered operations hub built for the Orbyte ecosystem. Powered by Google Gemini 2.0 (multilingual NLP/OCR) and RunPod Serverless GPUs, it turns unstructured WhatsApp orders, receipts, and legacy files into automated inventory control, defect-scored procurement, expiry mitigation, and 30-day cash-flow forecasting—all governed by Human-in-the-Loop Role-Based Access Control (RBAC).

### Key Features
* **Module 1 — Autonomous Restock & AI RFQ Bidding:** Tracks stock thresholds, enforces supplier MOQs, and ranks RFQ bids by price, historical defect rate, and sample quality.
* **Module 2 — Multilingual Order Intake:** Parses WhatsApp/email orders (EN, BM, Mandarin, Manglish), photos, and CSVs; drafts replies, locks low-stock orders, and sends shortages to Restock in 1 click.
* **Module 3 — Sales Analytics & Cash-Flow Runway:** Calculates SKU velocity, holding costs (1–50% p.a.), 21-day restock targets, and real-time working-capital runway.
* **Module 4 — Batch Quality & Expiry Guardian:** Flags stock expiring in <5 days for bundling or quarantine, assigns staff tasks with SLAs, and auto-escalates overdue tasks.
* **Module 5 — Smart Invoices, SST Engine & Liquidity Guard:** Extracts receipt data via Vision OCR, computes Malaysian SST (0%, 6%, 8%, 10%) with SST-02 CSV export, tracks 30-day safe cash (+20% buffer), and sends WhatsApp AR reminders.
* **Module 6 — 5-Pillar Compliance & Governance:** Tracks tenancy, fleet permits (JPJ/PUSPAKOM), warranties, subscriptions, and licences, backed by an Immutable Audit Log, AI System Migrator (`Shadow`/`Copilot`/`Autopilot`), and live 4-currency forex (`MYR`, `SGD`, `USD`, `RMB`).

---

### Extra Features
* **Customer Support Portal:** Built-in 24/7 after-sales helpdesk for direct ticket submission, live issue tracking, and operational troubleshooting.
* **4-Currency Live Forex Support:** Seamless real-time switching across `MYR`, `SGD`, `USD`, and `RMB`, backed by a 3-provider API failover chain.
* **Built-In Universal Data Migrator:** AI-assisted ingestion of legacy files (`.db`, `.sql`, `.csv`, `.json`) with `Shadow`, `Copilot`, and `Autopilot` validation modes.
* **Interactive In-Web Tutorial:** Launches a guided spotlight tour automatically upon user registration, and can be re-activated anytime via **Settings**.
  
---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide React (`orbyteflow/`) |
| **Backend** | Kotlin (JVM 21) REST API, Gradle (`src/main/kotlin/com/hazendust/vyte/`) |
| **Database** | SQLite (`vyte.db`) + LocalStorage offline fallback |
| **AI / Compute** | RunPod Serverless GPU, Google AI Studio (Gemini 2.0 API) |
| **External APIs** | ExchangeRate-API, ECB Frankfurter, CDN Currency API, WhatsApp Click-to-Chat |
| **Hosting / Dev** | Replit (IDE & Deployment), GitHub, Figma |

---

## Project Structure

```text
zenhao0915-vyte/
├── build.gradle.kts & settings.gradle.kts         # Kotlin backend build config
├── .env.example & .replit                         # Environment template & Replit config
├── docs/                                          # Architecture diagrams & Guide.pdf
├── runpod/
│   └── handler.py                                 # RunPod serverless GPU worker
├── submission/                                    # Required SDC 2026 PDFs
│   ├── SDC2026_Haze&Dust_Preliminary.pdf
│   ├── SDC2026_Haze&Dust_TechDeclaration.pdf
│   ├── SDC2026_Haze&Dust_Replit_POU.pdf
│   └── SDC2026_Haze&Dust_Runpod_POU.pdf
├── tests/                                         # Backend & API integration tests
├── orbyteflow/                                    # React 19 + TypeScript Frontend
│   └── src/
│       ├── App.tsx                                # Main application shell
│       ├── components/                            # Auth, layout, audit log, migrator, tutorial
│       ├── data/mockData.ts                       # Synthetic SME dataset
│       ├── modules/                               # Modules 1–6 (Restock, Order, Sales, QC, Invoice, Compliance)
│       ├── services/                              # REST API client & offline mock engine
│       └── types/vyte.ts                          # TypeScript interfaces
└── src/main/kotlin/com/hazendust/vyte/            # Kotlin (JVM 21) REST API Backend
    ├── Application.kt                             # Server entry point
    ├── config/ & data/ & manager/                 # DB, routing, and workspace managers
    └── route/                                     # Controllers & AI services (ai, auth, audit, invoice, order, qc, restock, etc.)
```

---

## Architecture

```text
User / WhatsApp Order / Receipt Photo / Legacy DB (.db, .sql, .csv, .json)
   │
   ▼
Replit Web Workspace — React 19 + TypeScript Frontend (`orbyteflow/`)
   │
   ▼
Kotlin (JVM 21) REST API Backend (`com.hazendust.vyte`)
   ├──► Google Gemini 2.0 API: Multilingual NLP Order Parsing & Receipt OCR
   └──► RunPod Serverless GPU: Holding-Cost Forecasting & Supplier Defect Scoring
   │
   ▼
Human-in-the-Loop Governance Gate (Owner / Manager RBAC)
   │
   ├──► SQLite (`vyte.db`): Products, Orders, Invoices, Vault & Immutable Audit Log
   └──► Webhooks: Orbyte HR Escalations & WhatsApp Click-to-Chat Dispatch
   │
   ▼
Structured JSON & Real-Time UI Update
```

---

## How to Run

### Option 1: Live Prototype (Instant)
1. Open **[https://hazendust.replit.app](https://hazendust.replit.app)**.
2. Sign in with **Google** / **Enterprise SSO** (1-click) or register an account.
3. Follow the auto-launched **Spotlight Tour**, or open **Settings** (bottom-left) to toggle **Offline Mock Mode** and switch currencies.

### Option 2: Local Setup
```bash
# 1. Clone & configure environment
git clone https://github.com/zenhao0915/Vyte.git
cd Vyte && cp .env.example .env
# Add GEMINI_API_KEY, RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, VITE_API_BASE_URL=http://localhost:8080 to .env

# 2. Run Kotlin backend (http://localhost:8080)
./gradlew run

# 3. Run React frontend (http://localhost:5173)
cd orbyteflow && npm install && npm run dev
```

---

## How We Use Replit *(Required)*

* **Development:** Used as our collaborative cloud IDE to build and test the React 19 frontend and Kotlin REST API.
* **Hosting:** Deployed publicly via Replit Deployments at [https://hazendust.replit.app](https://hazendust.replit.app).
* **Secrets Management:** `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, and `GEMINI_API_KEY` are stored strictly in Replit Secrets.

📄 **Proof of use:** [`submission/SDC2026_Haze&Dust_Replit_POU.pdf`](https://github.com/zenhao0915/Vyte/blob/submission/Submission/SDC2026_Haze%26Dust_Replit_POU.pdf)

---

## How We Use RunPod *(Required)*

* **Workload:** GPU inference for supplier defect-risk scoring, holding-cost/runway forecasting, and batch expiry mitigation.
* **Setup & Integration:** `runpod/handler.py` runs as a **RunPod Serverless GPU Endpoint**, invoked via `AiService.kt` to return structured JSON recommendations.

```bash
curl -X POST https://api.runpod.ai/v2/$RUNPOD_ENDPOINT_ID/runsync \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": {"task": "analyze_procurement", "holding_cost_pct": 18.5, "turnover_days": 21}}'
```

📄 **Proof of use:** [`submission/SDC2026_Haze&Dust_Runpod_POU.pdf`](https://github.com/zenhao0915/Vyte/blob/submission/Submission/SDC2026_Haze%26Dust_Runpod_POU.pdf)

---

## Challenges & Learnings

* **Mixed-Language Order Parsing:** Solved Manglish/multilingual WhatsApp orders by pairing structured Gemini prompts with deterministic SKU fuzzy-matching and stockout locks.
* **Cold Starts & Network Resilience:** Mitigated GPU/API latency using a 3-tier forex failover chain and a local fallback engine for 100% offline responsiveness.
* **AI Trust in Finance:** Built SME owner trust by enforcing RBAC approvals (`SME_OWNER`, `MANAGER`, `OPERATIONS_STAFF`), `Shadow`/`Copilot` migration previews, and an immutable Audit Log before altering ledgers.

---

## Future Improvements

* [ ] Best-selling product leaderboard with automated profit-margin and seasonal demand analytics.
* [ ] Consignment stock tracking with automated supplier and retail-partner settlement reconciliation.
* [ ] Customer warranty management for end-user serial tracking, claim validation, and RMA replacements.
* [ ] Tiered Freemium model offering core inventory tools for micro-SMEs with scalable Pro AI/GPU add-ons.
* [ ] Direct LHDN MyInvois API integration for automated e-Invoice submission.
* [ ] WebAssembly camera barcode/QR scanning for mobile stocktaking.
* [ ] Self-service vendor portal for live RFQ bidding and certificate uploads.

---

## Team

| Name | Role | GitHub |
| :--- | :--- | :--- |
| **Yau Zen Hao** | Team Lead / Backend & System Architecture & RunPod GPU Workloads & Replit Deployment | [@zenhao0915](https://github.com/zenhao0915) |
| **Ng Zi Yun** | Frontend Lead / UI/UX & Module Integration & Documentation | [@NGZIYUN](https://github.com/NGZIYUN) |
| **Lee Yan Ting** | Documentation | [@lyting0211](https://github.com/lyting0211) |
| **Jayden Lai Quan Qing** | AI Engineering & Frontend Architecture & Video Pitching  | [@Joaedes](https://github.com/Joaedes) |
| **Lew Xiao Hui** | Backend & Documentation | [@xiaohuilew1](https://github.com/xiaohuilew1) |

---

## Submission Checklist

* [x] Team name (`Haze&Dust`), domain (`Domain 2`), and SDG tracks (`SDG 8, 9, 12`) filled in
* [x] Slide deck link added
* [x] Demo video link added
* [x] Replit used, with proof of use in `submission/`
* [x] RunPod used, with proof of use in `submission/`
* [x] Preliminary submission completed (`SDC2026_Haze&Dust_Preliminary.pdf`)
* [x] Technology declaration completed (`SDC2026_Haze&Dust_TechDeclaration.pdf`)
* [x] Submission files renamed with team name (`Haze&Dust`)
* [x] "How to Run" steps verified
* [x] No API keys or secrets committed to the repository

---

## License

Licensed under the [Apache License 2.0](LICENSE).
