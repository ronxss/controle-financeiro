#!/usr/bin/env python3
"""Gera os ícones do app (PWA e Android) desenhando uma carteira. Não usa imagens externas.

Uso:
  python3 scripts/gerar-icones.py pwa     public/icons
  python3 scripts/gerar-icones.py android android/app/src/main/res
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

TEAL = (0, 121, 107, 255)     # #00796b (cor principal do app)
CLARO = (178, 223, 219, 255)  # #b2dfdb
BRANCO = (255, 255, 255, 255)
SUPER = 4                     # desenha 4x maior e reduz: bordas suaves


def carteira(lado, escala):
    """Camada transparente com a carteira ocupando `escala` (0 a 1) do lado, centralizada."""
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    g = lado * escala
    ox = oy = (lado - g) / 2

    def ret(x0, y0, x1, y1, raio, cor):
        d.rounded_rectangle([ox + x0 * g, oy + y0 * g, ox + x1 * g, oy + y1 * g], radius=raio * g, fill=cor)

    ret(0.14, 0.10, 0.80, 0.40, 0.06, CLARO)    # cartão aparecendo atrás
    ret(0.06, 0.26, 0.94, 0.86, 0.12, BRANCO)   # corpo da carteira
    ret(0.56, 0.46, 0.94, 0.66, 0.08, TEAL)     # aba do fecho
    cx, cy, r = ox + 0.70 * g, oy + 0.56 * g, 0.045 * g
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BRANCO)  # botão do fecho
    return img


def icone(tamanho, modo):
    """modo: 'any' (quadrado arredondado), 'maskable' (sangra até a borda), 'apple' (opaco),
    'circulo' (Android antigo), 'primeiro-plano' (Android adaptativo, fundo transparente)."""
    lado = tamanho * SUPER
    fundo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    d = ImageDraw.Draw(fundo)
    if modo == "any":
        d.rounded_rectangle([0, 0, lado - 1, lado - 1], radius=lado * 0.22, fill=TEAL)
        escala = 0.62
    elif modo in ("maskable", "apple"):
        d.rectangle([0, 0, lado, lado], fill=TEAL)
        escala = 0.52 if modo == "maskable" else 0.62  # maskable: o desenho precisa caber na "zona segura"
    elif modo == "circulo":
        d.ellipse([0, 0, lado - 1, lado - 1], fill=TEAL)
        escala = 0.50
    elif modo == "primeiro-plano":
        escala = 0.42  # o Android recorta o ícone adaptativo; o desenho fica no miolo
    else:
        raise ValueError(modo)

    fundo.alpha_composite(carteira(lado, escala))
    final = fundo.resize((tamanho, tamanho), Image.LANCZOS)
    return final.convert("RGB") if modo == "apple" else final


def gerar_pwa(destino):
    destino.mkdir(parents=True, exist_ok=True)
    for nome, tamanho, modo in [
        ("icon-192.png", 192, "any"),
        ("icon-512.png", 512, "any"),
        ("maskable-512.png", 512, "maskable"),
        ("apple-touch-icon.png", 180, "apple"),
    ]:
        icone(tamanho, modo).save(destino / nome, optimize=True)
        print("gerado", destino / nome)


# Tamanhos por densidade de tela do Android (dp -> px): ícone antigo 48dp, primeiro plano adaptativo 108dp.
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def gerar_android(res):
    if not res.is_dir():
        sys.exit(f"Pasta não encontrada: {res} (rode 'npx cap add android' antes)")
    for dens, fator in DENSIDADES.items():
        pasta = res / f"mipmap-{dens}"
        pasta.mkdir(exist_ok=True)
        icone(round(48 * fator), "any").save(pasta / "ic_launcher.png", optimize=True)
        icone(round(48 * fator), "circulo").save(pasta / "ic_launcher_round.png", optimize=True)
        icone(round(108 * fator), "primeiro-plano").save(pasta / "ic_launcher_foreground.png", optimize=True)
        print("gerado", pasta)

    cor = res / "values" / "ic_launcher_background.xml"
    cor.parent.mkdir(exist_ok=True)
    cor.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#00796B</color>\n</resources>\n',
        encoding="utf-8",
    )
    print("gerado", cor)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("pwa", "android"):
        sys.exit(__doc__)
    (gerar_pwa if sys.argv[1] == "pwa" else gerar_android)(Path(sys.argv[2]))
