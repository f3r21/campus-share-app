#!/usr/bin/env python3
"""Genera la gráfica de la prueba de carga (k6) con estilo editorial académico.

Lee `summary-1inst.json` (en la raíz del repo) y produce `docs/diagram/loadtest.png`:
barras de latencia (mediana / p90 / p95) con la línea objetivo, y cifras destacadas
(0% errores, total de peticiones, throughput, usuarios concurrentes).

Regenerar:  python3 docs/build_loadtest_chart.py
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# --- Paleta (coincide con el frontend y build_pptx.py) ---
PAPER = "#FAF7F0"
INK = "#1A1A1A"
MUTED = "#6B6357"
ACCENT = "#7C2D2D"
LINE = "#E3DDCF"

# Serif para titulares si está disponible; si no, fallback razonable.
_serif = next((f for f in ("Georgia", "Charter", "DejaVu Serif")
               if f in {fp.name for fp in font_manager.fontManager.ttflist}),
              "serif")
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"],
    "text.color": INK,
    "axes.edgecolor": LINE,
})

BASE = os.path.dirname(os.path.abspath(__file__))
SUMMARY = os.path.join(BASE, "..", "summary-1inst.json")
OUT = os.path.join(BASE, "diagram", "loadtest.png")

TARGET_MS = 800  # umbral del threshold p95 < 800 ms


def load_metrics(path):
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    m = data["metrics"]
    dur = m.get("http_req_duration{expected_response:true}", m["http_req_duration"])
    reqs = m["http_reqs"]
    failed = m["http_req_failed"]["value"]
    return {
        "med": dur["med"],
        "p90": dur["p(90)"],
        "p95": dur["p(95)"],
        "avg": dur["avg"],
        "reqs": int(reqs["count"]),
        "rate": reqs["rate"],
        "vus": int(m["vus_max"]["value"]),
        "fail_pct": failed * 100.0,
        "dur_s": reqs["count"] / reqs["rate"],
    }


def stat(ax, value, label):
    ax.axis("off")
    ax.text(0.5, 0.62, value, ha="center", va="center",
            fontsize=40, fontweight="bold", color=ACCENT, family=_serif)
    ax.text(0.5, 0.16, label, ha="center", va="center",
            fontsize=13, color=MUTED)


def build(metrics):
    fig = plt.figure(figsize=(12.0, 6.9), dpi=160)
    fig.patch.set_facecolor(PAPER)

    # Título y subtítulo
    fig.text(0.063, 0.93, "Prueba de carga — feed GET /api/materials",
             fontsize=23, color=INK, family=_serif)
    fig.text(0.063, 0.876,
             f"1 instancia · {metrics['vus']} usuarios concurrentes · "
             f"~{metrics['dur_s'] / 60:.1f} min · herramienta k6",
             fontsize=13, color=MUTED)
    # Regla de acento bajo el título
    fig.add_artist(plt.Line2D([0.063, 0.16], [0.845, 0.845],
                              color=ACCENT, linewidth=2.4))

    # --- Barras de latencia ---
    ax = fig.add_axes([0.063, 0.30, 0.87, 0.47])
    ax.set_facecolor(PAPER)
    cats = ["Mediana (p50)", "p90", "p95"]
    vals = [metrics["med"], metrics["p90"], metrics["p95"]]
    ypos = range(len(cats))
    ax.barh(ypos, vals, height=0.58, color=ACCENT, zorder=3)
    ax.set_yticks(list(ypos))
    ax.set_yticklabels(cats, fontsize=14, color=INK)
    ax.invert_yaxis()
    ax.set_xlim(0, max(TARGET_MS + 40, max(vals) * 1.25))
    ax.set_xlabel("Latencia de respuesta (ms)", fontsize=12, color=MUTED)
    ax.tick_params(axis="x", colors=MUTED, labelsize=11)
    ax.tick_params(axis="y", length=0)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(LINE)
    ax.grid(axis="x", color=LINE, linewidth=0.8, zorder=0)

    # Etiquetas de valor en cada barra
    for y, v in zip(ypos, vals):
        ax.text(v + 8, y, f"{v:.0f} ms", va="center", ha="left",
                fontsize=13, fontweight="bold", color=INK)

    # Línea objetivo p95 < 800 ms
    ax.axvline(TARGET_MS, color=MUTED, linestyle="--", linewidth=1.4, zorder=4)
    ax.text(TARGET_MS - 10, -0.46, f"Objetivo p95 < {TARGET_MS} ms (cumple)",
            ha="right", va="center", fontsize=11, color=MUTED, style="italic")

    # --- Cifras destacadas ---
    labels = [
        (f"{metrics['fail_pct']:.0f}%", "errores"),
        (f"{metrics['reqs']:,}".replace(",", " "), "peticiones"),
        (f"{metrics['rate']:.1f}", "peticiones / s"),
        (f"{metrics['vus']}", "usuarios concurrentes"),
    ]
    for i, (val, lab) in enumerate(labels):
        ax_s = fig.add_axes([0.063 + i * 0.224, 0.045, 0.205, 0.17])
        stat(ax_s, val, lab)

    fig.savefig(OUT, facecolor=PAPER, bbox_inches="tight", pad_inches=0.25)
    print("OK ->", OUT)


if __name__ == "__main__":
    build(load_metrics(SUMMARY))
