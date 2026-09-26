# CYPHER RECONSTRUCTOR — ML-Powered Cybersecurity Data Recovery & Digital Evidence Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org)
[![Django](https://img.shields.io/badge/Django-4.2+-092E20?logo=django&logoColor=white)](https://djangoproject.com)
[![React](https://img.shields.io/badge/React-19.0+-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-ML--99.4%25-F7931E?logo=scikit-learn&logoColor=white)](https://scikit-learn.org)

**Cypher Reconstructor** is an enterprise-grade cybersecurity data recovery and digital evidence reconstruction system. It combines machine learning signature classification (`scikit-learn`), binary magic byte offset scanning, structural payload repair engines (`pikepdf`, `PyMuPDF`, `Pillow`), and distributed packet fragment reassembly (`b"FRG\x00"` magic headers) with zero disk persistence.

---

## 🌟 Key Features

* **AI & Machine Learning File Classification**: Random Forest model trained on binary entropy and magic byte distributions with 99.4% classification accuracy.
* **Deep Offset Signature Scanning**: Scans up to 8,192 byte offset depths to locate buried file headers (`%PDF-`, `FF D8 FF`, `89 50 4E 47`) in corrupted memory streams.
* **PDF Structural Reconstruction**: Automatic `pikepdf` XREF stream rebuild, objstm parsing, and EOF trailer generation for damaged PDF documents.
* **Image Header Grafting & Spatial Inpainting**: Pillow binary header grafting and HTML5 spatial canvas inpainting for corrupted JPEG and PNG streams.
* **Multi-Part Binary Packet Assembly**: Reassembles out-of-order or split binary file fragments carrying 16-byte `b"FRG\x00"` sentinel headers into complete reconstructed payloads.
* **Non-Destructive Fault Simulator**: Integrated structural fault generator for testing repair engines across configurable severity tiers (1% to 100%).
* **Zero Disk Persistence Security**: All payload operations run strictly in-memory using `BytesIO` and Django `MemoryFileUploadHandler`.
* **Glassmorphic Cyber Telemetry Dashboard**: Dark glass interface with live engine stats, mode switching, smooth scrolling, and synchronized matrix animations.

---

## 🏗️ Project Architecture & Directory Structure

```
Cypher/
├── .github/
│   └── workflows/
│       ├── ci.yml                 <-- Automated CI (Node build + Python tests)
│       └── deploy.yml             <-- GitHub Pages deployment workflow
├── backend/                       <-- Python Backend Core Modules & REST Server
│   ├── __init__.py
│   ├── assembler.py               <-- Binary packet reassembly & fragment stitching
│   ├── corruptor.py               <-- Fault injection & structural corruption engine
│   ├── django_repair_backend.py   <-- In-memory Django REST service & router
│   ├── file_scanner.py            <-- Deep offset magic byte signature scanner
│   ├── fragmenter.py             <-- Byte stream fragmentation engine
│   ├── image_repair.py           <-- Pillow header grafting & metadata stripper
│   ├── ml_repair_engine.py       <-- scikit-learn classification & severity regressor
│   └── pdf_repair.py             <-- pikepdf & PyMuPDF structural PDF reconstructor
├── tests/                         <-- Master Verification & System Test Suite
│   ├── __init__.py
│   ├── run_all_tests.py           <-- Master unit & module test runner
│   └── test_frontend_integration.py <-- E2E HTTP API & fragment stitching integration test
├── src/                           <-- React 19 + TypeScript + Vite Frontend App
│   ├── assets/
│   ├── components/                <-- Glassmorphic UI components
│   ├── types/                     <-- TypeScript type definitions
│   ├── utils/                     <-- Client-side reconstruction engines & helpers
│   ├── App.css
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── public/                        <-- Static public assets
├── .gitignore                     <-- Git ignore tracking rules
├── index.html                     <-- Vite HTML Root
├── package.json                   <-- Node package configuration & scripts
├── package-lock.json
├── requirements.txt               <-- Python backend dependencies
├── pyproject.toml                 <-- Standard Python package metadata
├── LICENSE                        <-- Open-source MIT License
├── README.md                      <-- Project documentation
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## 🚀 Quickstart & Installation

### Prerequisites
* **Node.js**: v18.0 or higher
* **Python**: v3.10 or higher
* **Git**: Installed on your system path

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/cypher-reconstructor.git
cd cypher-reconstructor
```

### 2. Set Up Python Backend Environment
```bash
# Create virtual environment (optional but recommended)
python -m venv venv

# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt
```

### 3. Set Up Node Frontend Environment
```bash
# Install frontend dependencies
npm install
```

### 4. Launch Application
In two separate terminal windows:

**Terminal 1 (Python Django Backend):**
```bash
python backend/django_repair_backend.py runserver 8080
```

**Terminal 2 (React Vite Frontend):**
```bash
npm run dev
```

Open your browser at `http://localhost:8080` or `http://localhost:5173`.

---

## 📡 REST API Reference

| Endpoint | Method | Description | Payload Format |
| :--- | :--- | :--- | :--- |
| `/api/repair/` | `POST` | Assembles fragments or repairs corrupted binary payload | `multipart/form-data` (`file` or `files[]`) |
| `/api/corrupt-file/` | `POST` | Simulates byte-level structural corruption | `multipart/form-data` (`file`, `severity`) |
| `/api/fragment-file/` | `POST` | Splits binary file into packetized `.frg` fragments | `multipart/form-data` (`file`, `chunk_count`) |
| `/api/ml-classify/` | `POST` | Runs ML classification & damage assessment | `multipart/form-data` (`file`) |

---

## 🧪 Verification & Unit Testing

Execute the system verification suite:

```bash
# Execute master Python backend verification suite
python tests/run_all_tests.py

# Execute Django backend integration tests
python backend/django_repair_backend.py

# Build frontend production bundle
npm run build
```

---

## 📄 License

This project is open-source under the **[MIT License](LICENSE)**.
