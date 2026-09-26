"""
ml_repair_engine.py - Machine Learning Powered File Classifier & Repair Predictor

Features:
  1. Byte-level Feature Extraction: Shannon entropy, byte histogram, offset scanning,
     structural marker density, and sliding-window entropy distributions.
  2. Machine Learning Classification & Regression:
     - Predicts underlying File Type / MIME Type even with scrambled/buried headers.
     - Estimates Corruption Severity percentage (0-100%).
     - Classifies Corruption Tier (Clean, Low, Medium, High, Unrecoverable).
     - Recommends Optimal Repair Strategy (PIKEPDF_RECOVER, HEADER_GRAFTING, OFFSET_REALIGNMENT, etc.).
     - Calculates Recoverability Confidence Index (0-100%).
  3. Integrated with scikit-learn models (RandomForest, GradientBoosting) with automated
     synthetic training data generation and mathematical fallback heuristics.

Author: Cypher Engineering Team
"""

from __future__ import annotations

import logging
import math
import os
import re
import sys
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple, Union

# Ensure backend directory is present in sys.path
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Try importing scikit-learn and numpy
try:
    import numpy as np
    from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, RandomForestRegressor
    from sklearn.preprocessing import StandardScaler
    _HAS_SKLEARN = True
except ImportError:
    _HAS_SKLEARN = False
    np = None

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# ML Prediction Result Data Structure
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class MLPredictionResult:
    """Structured result returned by the ML File Repair Intelligence Engine."""
    predicted_file_type: str
    predicted_mime_type: str
    corruption_severity_pct: float
    corruption_tier: str
    recommended_strategy: str
    recoverability_score: float
    confidence_score: float
    features_summary: Dict[str, float]

    def to_dict(self) -> Dict[str, Union[str, float, dict]]:
        """Converts prediction object into JSON-serializable dictionary."""
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════
# Byte Stream Feature Extraction Engine
# ═══════════════════════════════════════════════════════════════════════════

def calculate_shannon_entropy(data: bytes) -> float:
    """Calculates Shannon Entropy (H = -sum(p * log2(p))) for byte stream (0.0 to 8.0)."""
    if not data:
        return 0.0
    length = len(data)
    counts = [0] * 256
    for b in data:
        counts[b] += 1
    entropy = 0.0
    for c in counts:
        if c > 0:
            p = c / length
            entropy -= p * math.log2(p)
    return float(round(entropy, 4))


def calculate_sliding_window_entropy(data: bytes, window_size: int = 256) -> Tuple[float, float, float]:
    """Computes min, max, and mean entropy across sliding byte windows."""
    if len(data) < window_size:
        e = calculate_shannon_entropy(data)
        return (e, e, e)

    entropies = []
    step = max(1, len(data) // 32)
    for i in range(0, len(data) - window_size + 1, step):
        chunk = data[i : i + window_size]
        entropies.append(calculate_shannon_entropy(chunk))

    if not entropies:
        e = calculate_shannon_entropy(data)
        return (e, e, e)

    return (
        float(round(min(entropies), 4)),
        float(round(max(entropies), 4)),
        float(round(sum(entropies) / len(entropies), 4)),
    )


def extract_byte_features(data: bytes) -> List[float]:
    """Extracts a 30-dimensional numeric feature vector from raw byte stream."""
    length = len(data)
    if length == 0:
        return [0.0] * 30

    log_len = math.log10(length + 1)
    entropy = calculate_shannon_entropy(data)

    zero_count = sum(1 for b in data if b == 0)
    ascii_count = sum(1 for b in data if 32 <= b <= 126)
    high_count = sum(1 for b in data if b > 127)

    zero_ratio = zero_count / length
    ascii_ratio = ascii_count / length
    high_ratio = high_count / length

    byte_list = list(data)
    mean_val = sum(byte_list) / length
    variance = sum((b - mean_val) ** 2 for b in byte_list) / length
    std_val = math.sqrt(variance)

    min_w_e, max_w_e, mean_w_e = calculate_sliding_window_entropy(data)

    pdf_off = data.find(b"%PDF-")
    png_off = data.find(b"\x89PNG")
    jpg_off = data.find(b"\xFF\xD8")
    gif_off = data.find(b"GIF8")
    webp_off = data.find(b"WEBP")
    zip_off = data.find(b"PK\x03\x04")

    pdf_eof = 1.0 if b"%%EOF" in data else 0.0
    jpg_eoi = 1.0 if b"\xFF\xD9" in data else 0.0
    png_iend = 1.0 if b"IEND" in data else 0.0

    pdf_obj_count = float(len(re.findall(rb"\d+\s+\d+\s+obj", data[:2048])))
    jpg_sos_count = float(data.count(b"\xFF\xDA"))

    header_e = calculate_shannon_entropy(data[:16])
    trailer_e = calculate_shannon_entropy(data[-16:])

    counts = [0] * 256
    for b in data:
        counts[b] += 1
    sorted_freqs = sorted([c / length for c in counts], reverse=True)[:7]

    feature_vec = [
        log_len,
        entropy,
        zero_ratio,
        ascii_ratio,
        high_ratio,
        mean_val,
        std_val,
        min_w_e,
        max_w_e,
        mean_w_e,
        float(pdf_off),
        float(png_off),
        float(jpg_off),
        float(gif_off),
        float(webp_off),
        float(zip_off),
        pdf_eof,
        jpg_eoi,
        png_iend,
        pdf_obj_count,
        jpg_sos_count,
        header_e,
        trailer_e,
    ] + sorted_freqs

    return feature_vec


# ═══════════════════════════════════════════════════════════════════════════
# Cypher Machine Learning Engine
# ═══════════════════════════════════════════════════════════════════════════

class CypherMLEngine:
    """ML Engine for automated file classification & corruption assessment."""

    FILE_TYPES: List[str] = ["pdf", "png", "jpeg", "gif", "webp", "bmp", "zip", "unknown"]
    MIME_MAP: Dict[str, str] = {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
        "bmp": "image/bmp",
        "zip": "application/zip",
        "unknown": "application/octet-stream",
    }

    def __init__(self) -> None:
        self.classifier: Optional[Any] = None
        self.severity_regressor: Optional[Any] = None
        self.scaler: Optional[Any] = None
        self.is_trained: bool = False

        if _HAS_SKLEARN:
            self._initialize_and_train_models()

    def _initialize_and_train_models(self) -> None:
        """Trains lightweight ML ensemble models on synthetic repair samples."""
        try:
            logger.info("Initializing ML Classifier & Regressor models...")
            X_train, y_type, y_sev = self._generate_synthetic_training_data()

            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X_train)

            self.classifier = RandomForestClassifier(n_estimators=50, max_depth=10, random_state=42)
            self.classifier.fit(X_scaled, y_type)

            self.severity_regressor = RandomForestRegressor(n_estimators=50, max_depth=8, random_state=42)
            self.severity_regressor.fit(X_scaled, y_sev)

            self.is_trained = True
            logger.info("ML Engine successfully trained on %d samples!", len(X_train))
        except Exception as exc:
            logger.warning("ML training initialization failed, falling back to heuristic engine: %s", exc)
            self.is_trained = False

    def _generate_synthetic_training_data(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Generates synthetic feature vectors representing clean and corrupted file types."""
        X, y_type, y_sev = [], [], []

        samples = {
            "pdf": b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1/Root 1 0 R>>\nstartxref\n100\n%%EOF",
            "png": b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9c\x00\x00\x00\x00IEND\xaeB`\x82",
            "jpeg": b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xDB\x00C\x00\x01\x02\xFF\xDA\x00\x08\x01\x02\xFF\xD9",
            "gif": b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;",
            "webp": b"RIFF\x20\x00\x00\x00WEBPVP8 \x14\x00\x00\x00\x00\x00\x00\x00",
            "zip": b"PK\x03\x04\x14\x00\x00\x00\x08\x00PK\x05\x06\x00\x00\x00\x00\x00\x00",
        }

        from corruptor import corrupt_file

        for ftype, payload in samples.items():
            vec = extract_byte_features(payload)
            X.append(vec)
            y_type.append(ftype)
            y_sev.append(0.0)

            for sev in (15, 50, 85):
                try:
                    c_payload = corrupt_file(payload, sev)
                    vec_c = extract_byte_features(c_payload)
                    X.append(vec_c)
                    y_type.append(ftype)
                    y_sev.append(float(sev))
                except Exception:
                    pass

        return np.array(X), np.array(y_type), np.array(y_sev)

    def predict(self, data: bytes) -> MLPredictionResult:
        """Analyzes raw byte stream using ML models or heuristic algorithms."""
        features_vec = extract_byte_features(data)

        if self.is_trained and _HAS_SKLEARN:
            return self._predict_ml(data, features_vec)
        else:
            return self._predict_heuristic(data, features_vec)

    def _predict_ml(self, data: bytes, features_vec: List[float]) -> MLPredictionResult:
        """ML inference using scikit-learn ensemble models."""
        X_input = self.scaler.transform([features_vec])
        pred_type = str(self.classifier.predict(X_input)[0])
        probs = self.classifier.predict_proba(X_input)[0]
        confidence = float(max(probs))

        pred_sev = float(np.clip(self.severity_regressor.predict(X_input)[0], 0.0, 100.0))

        if pred_sev <= 5.0:
            tier = "Clean"
        elif pred_sev <= 30.0:
            tier = "Low"
        elif pred_sev <= 70.0:
            tier = "Medium"
        elif pred_sev <= 95.0:
            tier = "High"
        else:
            tier = "Unrecoverable"

        strategy = str(self._derive_repair_strategy(pred_type, pred_sev, data))
        recoverability = float(max(0.0, min(100.0, 100.0 - (pred_sev * 0.75))))

        return MLPredictionResult(
            predicted_file_type=str(pred_type),
            predicted_mime_type=str(self.MIME_MAP.get(pred_type, "application/octet-stream")),
            corruption_severity_pct=float(round(pred_sev, 1)),
            corruption_tier=str(tier),
            recommended_strategy=str(strategy),
            recoverability_score=float(round(recoverability, 1)),
            confidence_score=float(round(confidence * 100.0, 1)),
            features_summary={
                "entropy": float(features_vec[1]),
                "zero_ratio": float(features_vec[2]),
                "ascii_ratio": float(features_vec[3]),
                "buried_offset": float(features_vec[10] if pred_type == "pdf" else features_vec[11]),
            },
        )

    def _predict_heuristic(self, data: bytes, features_vec: List[float]) -> MLPredictionResult:
        """Deterministic mathematical heuristic engine fallback."""
        entropy = features_vec[1]
        pdf_off = features_vec[10]
        png_off = features_vec[11]
        jpg_off = features_vec[12]

        pred_type = "unknown"
        if pdf_off != -1 or b"%PDF-" in data[:2048]:
            pred_type = "pdf"
        elif png_off != -1 or b"IDAT" in data:
            pred_type = "png"
        elif jpg_off != -1 or b"\xFF\xDA" in data:
            pred_type = "jpeg"

        if pdf_off == 0 or png_off == 0 or jpg_off == 0:
            pred_sev = 10.0
            tier = "Low"
        elif pdf_off > 0 or png_off > 0 or jpg_off > 0:
            pred_sev = 50.0
            tier = "Medium"
        else:
            pred_sev = 85.0
            tier = "High"

        strategy = self._derive_repair_strategy(pred_type, pred_sev, data)
        recoverability = max(0.0, min(100.0, 100.0 - (pred_sev * 0.75)))

        return MLPredictionResult(
            predicted_file_type=pred_type,
            predicted_mime_type=self.MIME_MAP.get(pred_type, "application/octet-stream"),
            corruption_severity_pct=pred_sev,
            corruption_tier=tier,
            recommended_strategy=strategy,
            recoverability_score=round(recoverability, 1),
            confidence_score=85.0,
            features_summary={
                "entropy": entropy,
                "zero_ratio": features_vec[2],
                "ascii_ratio": features_vec[3],
            },
        )

    def _derive_repair_strategy(self, file_type: str, severity: float, data: bytes) -> str:
        """Derives recommended repair strategy based on file type and ML severity."""
        if file_type == "pdf":
            if severity < 30.0:
                return "PIKEPDF_RECOVER"
            elif severity < 70.0:
                return "OFFSET_REALIGNMENT"
            else:
                return "PYMUPDF_STREAM_SALVAGE"
        elif file_type in ("png", "jpeg", "gif", "webp"):
            if severity < 30.0:
                return "METADATA_STRIP"
            elif severity < 70.0:
                return "OFFSET_ALIGNMENT"
            else:
                return "HEADER_GRAFTING"
        else:
            return "UNIVERSAL_PDF_SALVAGE"


# Global singleton ML engine instance
ml_engine = CypherMLEngine()
