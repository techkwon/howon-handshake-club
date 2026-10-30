"""UI 그림 — ../그림/UI · ../그림/타이틀 의 코덱스 그림을 사이트용 webp 로 (tools/art.py 가 부른다).

- UI 원본은 단색 바탕(파랑 #0000FF · 자홍 #FF00FF · 초록 #00FF00) 위에 조각 여러 개
  → 바탕색 빼기(알파 추정 + 색 되돌리기) → 조각 자르기(큰 것부터 n개, 위→아래 · 왼→오 순서) → img/ui/*.webp
- 틀(대사 상자 · 단추 · 증서 · 카드)은 CSS border-image(9-slice)로 늘린다. 자르는 칸(slice)은 아래 표 `slice`(그림 px, 줄인 뒤 기준)
  — site/styles.css 의 border-image 숫자와 같아야 한다(그림을 새로 만들면 둘 다 고친다)
- 타이틀 키 비주얼: 16:9 로 맞춰 1920×1080
- manifest['ui'] = { 이름: { src, w, h, slice? } }
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

KEYS = {'blue': (0, 0, 255), 'magenta': (255, 0, 255), 'green': (0, 255, 0)}

# 원본 파일 → 바탕색 · 조각 이름(위→아래, 같은 줄은 왼→오) · 조각마다 [가로 최대 px, slice(위 오른 아래 왼, 줄인 뒤 px) 또는 None]
SHEETS = {
    'UI/ui_panels.png': ('blue', [('dialog', 1000, (98, 110, 98, 110)), ('nameplate', 420, (14, 44, 14, 84))]),
    'UI/ui_buttons.png': ('blue', [('btn', 900, (24, 72, 24, 72)), ('btn_on', 900, (24, 72, 24, 120)), ('btn_main', 900, (24, 72, 24, 72))]),
    'UI/ui_frames.png': ('blue', [('frame_cert', 900, (180, 200, 175, 200)), ('frame_card', 420, (70, 70, 70, 70))]),
    'UI/ui_ornaments.png': ('magenta', [('corner', 420, None), ('divider', 520, None), ('cursor', 96, None), ('next', 72, None), ('emblem', 256, None)]),
    'UI/ui_icons.png': ('magenta', [('icon_h', 128, None), ('icon_o', 128, None), ('icon_u', 128, None)]),
    'UI/ui_particles.png': ('green', [(f'petal{i}', 64, None) for i in range(1, 7)] + [(f'spark{i}', 64, None) for i in range(1, 4)]),
}
# 조각이 있을 자리(그림 너비 · 높이에 대한 비율, 가운데). 덩어리마다 가장 가까운 자리의 이름을 붙인다
SPOTS = {
    'UI/ui_panels.png': [(.5, .33), (.5, .81)],
    'UI/ui_buttons.png': [(.5, .19), (.5, .49), (.5, .79)],
    'UI/ui_frames.png': [(.33, .48), (.83, .48)],
    'UI/ui_ornaments.png': [(.2, .3), (.75, .18), (.31, .47), (.73, .48), (.5, .78)],
    'UI/ui_icons.png': [(.16, .5), (.5, .5), (.84, .5)],
}
# 키 비주얼(kv_title2 · 16:9 로 자른 뒤) 얼굴 · 머리 상자 [x0, y0, x1, y1] 비율 — 화면 시험(test/shots.mjs)이 UI 와 겹치는지 본다
# 그림을 새로 만들면 이 값도 다시 잰다(그림을 열어 머리카락 끝까지 넉넉히)
KV_FACES = [
    [.468, .060, .605, .285],   # 안경 은결
    [.620, .070, .765, .290],   # 두건 한별
    [.770, .090, .900, .330],   # 앞치마 하린(묶은 머리 빼고 머리만)
    [.455, .345, .605, .570],   # 수첩 소윤
    [.600, .345, .765, .585],   # 머리핀 다온
    [.820, .340, .960, .560],   # 화분 한결
]
# 9개(꽃잎 6 + 반짝이 3)처럼 종류가 섞인 판은 색으로 가른다: 노란 기운이 큰 것 = 반짝이
SPARK_SORT = 'UI/ui_particles.png'


def unkey(rgb: np.ndarray, key: tuple[int, int, int], t0: float = 70, t1: float = 170) -> Image.Image:
    """바탕색에서 먼 정도로 알파를 정하고, 섞인 바탕색을 빼서 색을 되돌린다"""
    f = rgb.astype(np.float32)
    k = np.array(key, np.float32)
    d = np.sqrt(((f - k) ** 2).sum(axis=2))
    a = np.clip((d - t0) / (t1 - t0), 0, 1)
    a3 = np.maximum(a, 1e-3)[..., None]
    fg = (f - (1 - a)[..., None] * k) / a3
    fg = np.clip(fg, 0, 255)
    # 남은 바탕 기운(파랑 · 자홍 · 초록 테두리 번짐)을 한 번 더 누른다
    if key == KEYS['blue']:
        fg[..., 2] = np.minimum(fg[..., 2], np.maximum(fg[..., 0], fg[..., 1]) + 8)
    elif key == KEYS['green']:
        fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]) + 8)
    elif key == KEYS['magenta']:
        m = np.minimum(fg[..., 0], fg[..., 2])
        over = np.clip(m - fg[..., 1] - 90, 0, None)       # 자홍 쪽으로 너무 기운 반투명 테두리만
        fg[..., 0] -= over * (a < 0.95); fg[..., 2] -= over * (a < 0.95)
    out = np.dstack([fg.astype(np.uint8), (a * 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def components(alpha: np.ndarray, grow: int = 9, step: int = 4) -> list[tuple[int, int, int, int, int]]:
    """알파 덩어리들의 상자 [(x0, y0, x1, y1, 넓이)] — 가까운 조각(꽃잎 · 잔가지)은 grow 로 붙인다"""
    m = Image.fromarray(((alpha > 40) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(grow))
    small = np.asarray(m.resize((m.width // step, m.height // step), Image.NEAREST)) > 0
    h, w = small.shape
    lab = np.zeros((h, w), np.int32)
    out = []
    n = 0
    for y in range(h):
        for x in range(w):
            if small[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)]); lab[y, x] = n
                x0 = x1 = x; y0 = y1 = y; area = 0
                while q:
                    cy, cx = q.popleft(); area += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                out.append((x0 * step, y0 * step, (x1 + 1) * step, (y1 + 1) * step, area))
    return out


def reading_order(boxes):
    """위→아래 줄, 줄 안에서 왼→오 (세로 겹침이 절반 이상이면 같은 줄)"""
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows: list[list] = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        for r in rows:
            ry0 = min(x[1] for x in r); ry1 = max(x[3] for x in r)
            if ry0 <= cy <= ry1:
                r.append(b); break
        else:
            rows.append([b])
    return [b for r in rows for b in sorted(r, key=lambda b: b[0])]


def trim(im: Image.Image, pad: int = 2) -> Image.Image:
    a = np.asarray(im.split()[-1])
    ys, xs = np.where(a > 8)
    if not len(xs):
        return im
    return im.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, im.width), min(ys.max() + pad + 1, im.height)))


def split_bow(im: Image.Image) -> tuple[Image.Image, Image.Image]:
    """증서 틀 위 가운데 리본을 지우고(옆의 민 테두리 세로줄로 메움) 리본만 따로 돌려준다"""
    a = np.asarray(im).copy()
    W, H = im.width, im.height
    x0, x1 = int(W * .29), int(W * .71)
    ref = int(W * .27)
    band = int(H * .2)
    plain = a[:band, ref:ref + 1].copy()
    orig = a[:band, x0:x1].copy()
    a[:band, x0:x1] = np.repeat(plain, x1 - x0, axis=1)
    # 리본 = 메운 것과 많이 다른 칸
    diff = np.abs(orig.astype(np.int16) - a[:band, x0:x1].astype(np.int16))[..., :3].max(axis=2)
    alpha = np.where(diff > 28, orig[..., 3], 0).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MaxFilter(3)))
    bow = np.dstack([orig[..., :3], np.minimum(alpha, orig[..., 3])])
    return Image.fromarray(a, 'RGBA'), trim(Image.fromarray(bow, 'RGBA'))


def process(art: Path, out_dir: Path, site: Path, save_webp, fresh) -> dict:
    ui: dict = {}
    for rel, (key, pieces) in SHEETS.items():
        src = art / rel
        if not src.exists():
            continue
        outs = [out_dir / f'{p[0]}.webp' for p in pieces]
        if all(fresh(src, o) for o in outs):
            for (name, _, sl), o in zip(pieces, outs):
                with Image.open(o) as im:
                    ui[name] = {'src': o.relative_to(site).as_posix(), 'w': im.width, 'h': im.height, **({'slice': list(sl)} if sl else {})}
            if 'frame_cert' in ui:
                b = out_dir / 'bow.webp'
                if not b.exists():   # 리본만 없으면 틀부터 다시
                    for o in outs: o.unlink(missing_ok=True)
                    return process(art, out_dir, site, save_webp, fresh)
                with Image.open(b) as im:
                    ui['bow'] = {'src': b.relative_to(site).as_posix(), 'w': im.width, 'h': im.height}
            print(f'  UI {src.name} (그대로)')
            continue
        rgb = np.asarray(Image.open(src).convert('RGB'))
        rgba = unkey(rgb, KEYS[key])
        boxes = components(np.asarray(rgba.split()[-1]))
        boxes = sorted(boxes, key=lambda b: -b[4])[:len(pieces)]
        if len(boxes) < len(pieces):
            print(f'  ! {src.name}: 조각 {len(boxes)}개 (필요 {len(pieces)})')
            continue
        if rel in SPOTS:
            W, H = rgba.size
            left = list(boxes); ordered = []
            for fx, fy in SPOTS[rel]:
                b = min(left, key=lambda b: ((b[0] + b[2]) / 2 / W - fx) ** 2 + ((b[1] + b[3]) / 2 / H - fy) ** 2)
                left.remove(b); ordered.append(b)
            boxes = ordered
        else:
            boxes = reading_order(boxes)
        crops = [trim(rgba.crop(b[:4])) for b in boxes]
        if rel == SPARK_SORT:   # 노란 기운(R+G-2B)이 큰 3개 = 반짝이, 나머지 = 꽃잎
            def warm(c):
                a = np.asarray(c).astype(np.float32); m = a[..., 3] > 128
                return float((a[..., 0][m] + a[..., 1][m] - 2 * a[..., 2][m]).mean()) if m.any() else 0
            crops = sorted(crops, key=warm)
        for (name, maxw, sl), c, o in zip(pieces, crops, outs):
            if c.width > maxw:
                c = c.resize((maxw, round(c.height * maxw / c.width)), Image.LANCZOS)
            if name == 'frame_cert':   # 가운데 위 리본은 9-slice 로 늘어나지 않게 떼어 따로(bow) 둔다
                c, bow = split_bow(c)
                b = save_webp(bow, out_dir / 'bow.webp', 84)
                ui['bow'] = {'src': b['src'], 'w': b['w'], 'h': b['h']}
            ent = save_webp(c, o, 84)
            ui[name] = {'src': ent['src'], 'w': ent['w'], 'h': ent['h'], **({'slice': list(sl)} if sl else {})}
            print(f'  UI {name:10s} {c.width}×{c.height} ← {src.name}')
        if 'emblem' in [p[0] for p in pieces]:
            em = Image.open(out_dir / 'emblem.webp')
            for s in (64, 192):
                p = site / f'icon-{s}.png'
                em.resize((s, round(em.height * s / em.width)), Image.LANCZOS).quantize(colors=128, method=Image.Quantize.FASTOCTREE).save(p, optimize=True)
            ui['icon'] = {'src': 'icon-64.png', 'w': 64, 'h': 64}

    # 종이 결(반복 무늬): 가운데 512 를 잘라 가장자리를 섞어 이음매를 줄인다
    src = art / 'UI' / 'ui_paper.png'
    o = out_dir / 'paper.webp'
    if src.exists():
        if not fresh(src, o):
            im = Image.open(src).convert('RGB')
            s = min(im.size)
            im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2)).resize((512, 512), Image.LANCZOS)
            a = np.asarray(im).astype(np.float32)
            b = np.roll(np.roll(a, 256, 0), 256, 1)
            yy, xx = np.mgrid[0:512, 0:512]
            wgt = (np.minimum(np.minimum(xx, 511 - xx), np.minimum(yy, 511 - yy)) / 256.0).clip(0, 1)[..., None]
            im = Image.fromarray((a * wgt + b * (1 - wgt)).astype(np.uint8))
            save_webp(im, o, 70)
        ui['paper'] = {'src': o.relative_to(site).as_posix(), 'w': 512, 'h': 512}
        print('  UI paper')

    # 타이틀 키 비주얼(인물은 오른쪽 절반 · 왼쪽 45% 는 비워 둔 판). 얼굴 상자는 KV_FACES
    src = art / '타이틀' / 'kv_title2.png'
    if src.exists():
        for name, W in (('kv', 1920), ('kv_s', 960)):
            o = out_dir / f'{name}.webp'
            if not fresh(src, o):
                im = Image.open(src).convert('RGB')
                H = round(W * 9 / 16)
                r = max(W / im.width, H / im.height)
                im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
                x, y = (im.width - W) // 2, (im.height - H) // 2
                save_webp(im.crop((x, y, x + W, y + H)), o, 74 if W > 1000 else 70)
            ui[name] = {'src': o.relative_to(site).as_posix(), 'w': W, 'h': round(W * 9 / 16), 'faces': KV_FACES}
        print('  UI 키 비주얼')
    return ui
