"""Render a short OpenHost product motion video in Portuguese."""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "openhost-motion-ptbr.mp4"
FRAMES = ROOT / "artifacts" / "openhost-motion-frames"
W, H, FPS = 1280, 720, 24
DURATION = 29
ORANGE = (253, 123, 23)
WHITE = (245, 246, 248)
MUTED = (159, 165, 174)
BG = (12, 13, 15)
FONT = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/segoeuib.ttf")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT), size)


def clamp(v: float) -> float:
    return max(0.0, min(1.0, v))


def ease(v: float) -> float:
    v = clamp(v)
    return v * v * (3 - 2 * v)


def alpha_composite(dst: Image.Image, src: Image.Image, xy: tuple[int, int]) -> None:
    dst.alpha_composite(src, xy)


def background(t: float, accent=(253, 123, 23)) -> Image.Image:
    cx = int(W * (0.68 + 0.07 * math.sin(t * 0.25)))
    cy = int(H * (0.48 + 0.05 * math.cos(t * 0.31)))
    xs, ys = np.meshgrid(np.arange(W), np.arange(H))
    radius = np.sqrt(((xs - cx) * .9) ** 2 + (ys - cy) ** 2)
    glow = np.maximum(0, 1 - radius / 850) ** 2 * .16
    grid = ((xs % 64 == 0) | (ys % 64 == 0)) * .018
    rgb = np.empty((H, W, 3), dtype=np.uint8)
    for i in range(3):
        rgb[:, :, i] = np.clip(BG[i] + accent[i] * glow + 28 * grid, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB").convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    # Fine, quiet technical grid and drifting signal points.
    for x in range(30, W, 64):
        for y in range(28, H, 64):
            d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 255, 255, 22))
    for i in range(22):
        x = (i * 173 + int(t * (14 + i % 4))) % W
        y = (i * 97 + int(t * 5)) % H
        d.ellipse((x, y, x + 2, y + 2), fill=accent + (35,))
    im.alpha_composite(overlay)
    return im


def rounded_screenshot(path: Path, size: tuple[int, int]) -> Image.Image:
    src = Image.open(path).convert("RGB")
    sw, sh = size
    scale = max(sw / src.width, sh / src.height)
    nw, nh = int(src.width * scale), int(src.height * scale)
    src = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left, top = (nw - sw) // 2, (nh - sh) // 2
    src = src.crop((left, top, left + sw, top + sh)).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=18, fill=255)
    src.putalpha(mask)
    return src


def app_window(im: Image.Image, screenshot: str, t: float, enter: float) -> None:
    x0, y0, sw, sh = 436, 120, 790, 490
    lift = int((1 - ease(enter)) * 52)
    x0 += int(math.sin(t * 0.65) * 3)
    y0 += lift + int(math.sin(t * 0.9) * 3)
    shot = rounded_screenshot(ROOT / "docs" / "screenshots" / screenshot, (sw, sh))
    shadow = Image.new("RGBA", (sw + 70, sh + 70), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((28, 28, sw + 32, sh + 32), radius=26, fill=(0, 0, 0, 185))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    alpha_composite(im, shadow, (x0 - 35, y0 - 24))
    frame = Image.new("RGBA", (sw + 4, sh + 4), (40, 42, 47, 255))
    alpha_composite(frame, shot, (2, 2))
    alpha_composite(im, frame, (x0 - 2, y0 - 2))
    # Orange focus stroke fades in with the window.
    overlay = Image.new("RGBA", (sw + 4, sh + 4), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).rounded_rectangle((0, 0, sw + 3, sh + 3), radius=20, outline=(ORANGE[0], ORANGE[1], ORANGE[2], int(55 * ease(enter))), width=2)
    alpha_composite(im, overlay, (x0 - 2, y0 - 2))


def logo(draw: ImageDraw.ImageDraw, x: int, y: int, size: int, alpha: int = 255) -> None:
    # Open O and terminal chevron, matching the supplied OpenHost mark.
    draw.arc((x, y, x + size, y + size), 34, 326, fill=WHITE + (alpha,), width=max(3, size // 10))
    draw.line((x + size * .63, y + size * .23, x + size * .9, y + size * .5, x + size * .63, y + size * .77), fill=ORANGE + (alpha,), width=max(3, size // 10), joint="curve")


def draw_scene(im: Image.Image, t: float, scene: dict) -> None:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay, "RGBA")
    st = t - scene["start"]
    enter = ease(st / 0.75)
    # Persistent, subtle brand marker.
    logo(d, 58, 48, 30, 245)
    d.text((100, 48), "OPENHOST", font=font(17, True), fill=WHITE + (245,))
    d.text((58, 658), "OPENHOST  /  FERRAMENTAS PARA QUEM OPERA", font=font(12, True), fill=MUTED + (190,))
    d.text((1156, 656), f"{int(t // 60):02d}:{int(t % 60):02d}", font=font(13), fill=MUTED + (170,))

    if scene.get("intro"):
        a = int(255 * ease(st / .7) * (1 - ease((st - 2.4) / .6)))
        # Large orange ring motif.
        cx, cy = 640, 285
        pulse = 1 + 0.035 * math.sin(st * 2.2)
        radius = int(88 * pulse)
        d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=ORANGE + (int(a * .4),), width=2)
        logo(d, cx - 39, cy - 39, 78, a)
        title = "OpenHost"
        box = d.textbbox((0, 0), title, font=font(68, True))
        d.text((cx - (box[2] - box[0]) / 2, 394), title, font=font(68, True), fill=WHITE + (a,))
        subtitle = "Seu trabalho. Seus hosts. Seu controle."
        box = d.textbbox((0, 0), subtitle, font=font(22))
        d.text((cx - (box[2] - box[0]) / 2, 485), subtitle, font=font(22), fill=MUTED + (a,))
        im.alpha_composite(overlay)
        return

    # Left copy block.
    x = 70 + int((1 - enter) * -30)
    d.rounded_rectangle((x, 184, x + 56, 190), radius=4, fill=ORANGE + (int(240 * enter),))
    d.text((x, 212), scene["eyebrow"].upper(), font=font(14, True), fill=ORANGE + (int(255 * enter),))
    title_lines = scene["title"].split("\n")
    yy = 252
    for line in title_lines:
        d.text((x, yy), line, font=font(39, True), fill=WHITE + (int(255 * enter),), stroke_width=0)
        yy += 48
    yy += 10
    for line in scene["body"].split("\n"):
        d.text((x, yy), line, font=font(17), fill=MUTED + (int(245 * enter),))
        yy += 27
    if scene.get("tag"):
        tag = scene["tag"]
        tw = d.textbbox((0, 0), tag, font=font(13, True))[2] + 28
        d.rounded_rectangle((x, 499, x + tw, 532), radius=16, fill=(255, 255, 255, 13), outline=(255, 255, 255, 32), width=1)
        d.text((x + 14, 507), tag, font=font(13, True), fill=WHITE + (230,))

    if scene.get("shot"):
        app_window(im, scene["shot"], t, enter)
    elif scene.get("endcard"):
        logo(d, 840, 280, 94, 255)
        d.text((837, 406), "github.com/EmersonRicard0/Openhost", font=font(17, True), fill=WHITE + (235,))

    # A small animated connection pulse anchors each chapter.
    p = (st * 0.8) % 1
    cx, cy = 405, 587
    d.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=ORANGE + (220,))
    d.ellipse((cx - 9 - int(p * 8), cy - 9 - int(p * 8), cx + 9 + int(p * 8), cy + 9 + int(p * 8)), outline=ORANGE + (int(75 * (1 - p)),), width=1)
    im.alpha_composite(overlay)


SCENES = [
    {"start": 0, "end": 3, "intro": True},
    {"start": 3, "end": 6.5, "eyebrow": "SEGURANÇA LOCAL", "title": "Seu cofre.\nSó seu.", "body": "Criptografia forte.\nSegredos protegidos no dispositivo.", "tag": "LOCAL-FIRST", "shot": "01-cofre.png"},
    {"start": 6.5, "end": 10.5, "eyebrow": "ACESSO SSH", "title": "Conecte.\nE resolva.", "body": "Hosts organizados, sessões rápidas\ne terminal pronto para agir.", "tag": "SSH  •  FAVORITOS  •  RECENTES", "shot": "02-terminal-ssh.png"},
    {"start": 10.5, "end": 14, "eyebrow": "ARQUIVOS SEM ATRITO", "title": "SFTP na\nmesma jornada.", "body": "Transfira arquivos em paralelo\nsem sair do seu espaço de trabalho.", "tag": "SFTP INTEGRADO", "shot": "04-sftp.png"},
    {"start": 14, "end": 17.5, "eyebrow": "ACELERE A ROTINA", "title": "Encontre.\nExecute.", "body": "Ações, hosts e terminais\na um atalho de distância.", "tag": "CTRL  +  SHIFT  +  P", "shot": "03-paleta.png"},
    {"start": 17.5, "end": 21, "eyebrow": "DO SEU JEITO", "title": "Seu terminal,\nsua leitura.", "body": "Ajuste fontes, tamanhos e cores\npara trabalhar com clareza.", "tag": "PERSONALIZAÇÃO AO VIVO", "shot": "05-personalizacao.png"},
    {"start": 21, "end": 24, "eyebrow": "FEITO PARA A VIDA REAL", "title": "Até o legado\ntem lugar.", "body": "Perfis por equipamento e avisos\nvisíveis para operar com contexto.", "tag": "HOSTS  •  AMBIENTES  •  NOTAS", "shot": "06-host-legado.png"},
    {"start": 24, "end": 26.5, "eyebrow": "SEMPRE EM DIA", "title": "Atualize sem\nperder o foco.", "body": "Verificação segura e instalação\ncom confirmação antes de aplicar.", "tag": "WINDOWS  •  macOS  •  LINUX", "shot": "02-terminal-ssh.png"},
    {"start": 26.5, "end": 29, "eyebrow": "OPENHOST", "title": "Menos atrito.\nMais operação.", "body": "Baixe a versão oficial gratuita.\nOpen source. Feito para o seu dia.", "tag": "OPENHOST  /  SEU TERMINAL, SEU CONTROLE", "shot": None, "endcard": True},
]


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    for idx in range(DURATION * FPS):
        t = idx / FPS
        scene = next(s for s in SCENES if s["start"] <= t < s["end"])
        accent = (ORANGE if idx % 3 else (30, 185, 157))
        im = background(t, accent)
        draw_scene(im, t, scene)
        im.convert("RGB").save(FRAMES / f"frame-{idx:05d}.jpg", quality=93, subsampling=0)
        if idx % (FPS * 3) == 0:
            print(f"Rendered {t:05.1f}s / {DURATION}s")
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
        "-framerate", str(FPS), "-i", str(FRAMES / "frame-%05d.jpg"),
        "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-movflags", "+faststart", "-an", str(OUT),
    ], check=True)
    print(f"Created {OUT}")


if __name__ == "__main__":
    main()
