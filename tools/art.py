"""그림 파이프라인 — ../그림 에 있는 것만 골라 사이트용 webp 로 만든다.

    python tools/art.py            (_개발 폴더에서)

- 캐릭터 시트(1536×1024, 왼쪽 전신 + 오른쪽 표정 2~3개, 크림 바탕)
  → 전신 서 있는 그림(바탕 투명, 세로 600px) + 표정 얼굴(정사각 160px)
- 배경 · 엔딩 CG · 기술 카드: 파일 이름의 낱말로 알아본다(없으면 게임이 자리 그림을 쓴다)
- 결과: site/img/** + src/art-manifest.json (esbuild 가 묶음에 넣는다)
- 확인용 모아보기: tools/_check/sheets.png (사이트에는 올리지 않는다)

새 그림이 생기면 이 스크립트를 다시 돌리고 `npm run build` 한다.
"""
from __future__ import annotations

import json
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
DEV = HERE.parent
ART = (DEV / '..' / '그림').resolve()
OUT = DEV / 'site' / 'img'
MANIFEST = DEV / 'src' / 'art-manifest.json'
CHECK = HERE / '_check'

SPRITE_H = 600
FACE = 160
BG_SIZE = (1600, 900)
CARD_W = 640

# 그림 id → 파일 이름에서 찾을 낱말(앞에 있는 것부터)
CHAR_KEYS = {
    'hangyeol': ['한결'], 'daon': ['다온'],
    'soyun': ['한소윤', '소윤'], 'eungyeol': ['서은결', '은결'],
    'harin': ['도하린', '하린'], 'hanbyeol': ['주한별', '한별'],
    'chaewon': ['유채원', '채원'], 'haru': ['민하루', '하루'],
    'tenu': ['테누'], 'bong': ['봉선생', '봉 선생', '봉'], 'miko': ['미코'],
    'hala': ['할라'], 'bara': ['바라'], 'kamu': ['카무'],
}
BG_KEYS = [  # 위에서부터 먼저 맞는 것
    ('call', ['화상', 'call']), ('fest', ['축제', '부스', 'fest']), ('club', ['동아리', 'club']),
    ('garden', ['텃밭', 'garden']), ('snow', ['하굣길', '눈 오는', '눈오는', 'snow']),
    ('night', ['밤', 'night']), ('well', ['우물', 'well']), ('market', ['장터', 'market']),
    ('forge', ['대장간', 'forge']), ('roof', ['빗물', '지붕', '탱크', 'roof', 'rain']),
    ('hall', ['강당', '졸업식', 'hall']), ('field', ['운동장', '벚꽃', 'field']),
]
CARD_KEYS = [
    ('roll', ['굴리', '물통', 'roll', 'drum']), ('straw', ['빨대', '정수', 'straw']),
    ('rain', ['빗물', 'rain']), ('bottle', ['페트병', '전구', 'bottle']),
    ('bike', ['자전거', 'bike']), ('solar', ['태양열', '조리기', 'solar']),
    ('pot', ['항아리', 'pot']),
]
IMG_EXT = {'.png', '.jpg', '.jpeg', '.webp'}
SKIP_WORDS = ['모아보기', 'contact', '_check']


def files_under(*names: str) -> list[Path]:
    out = []
    for d in ART.rglob('*'):
        if d.is_dir() and any(n.lower() == d.name.lower() for n in names):
            out += [p for p in sorted(d.rglob('*')) if p.suffix.lower() in IMG_EXT]
    return out


def all_images() -> list[Path]:
    if not ART.exists():
        return []
    return [p for p in sorted(ART.rglob('*')) if p.suffix.lower() in IMG_EXT and not any(w in str(p) for w in SKIP_WORDS)]


def in_dir(p: Path, names: list[str]) -> bool:
    return any(part in names for part in p.relative_to(ART).parts[:-1])


# ── 캐릭터 시트 자르기 ─────────────────────────────────────────────
def bg_color(a: np.ndarray) -> np.ndarray:
    b = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    return np.median(b, axis=0)


def runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """참인 구간들 [(시작, 끝+1)]"""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i)); start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


def flood_outside(d: np.ndarray, tol: float) -> np.ndarray:
    """가장자리에서 이어진 바탕색 칸(d < tol)만 따라 번진 영역(참 = 바깥)"""
    bgl = d < tol
    seen = np.zeros_like(bgl)
    seen[0, :] = bgl[0, :]; seen[-1, :] = bgl[-1, :]; seen[:, 0] = bgl[:, 0]; seen[:, -1] = bgl[:, -1]
    front = seen.copy()
    while front.any():
        grow = np.zeros_like(front)
        grow[1:, :] |= front[:-1, :]; grow[:-1, :] |= front[1:, :]
        grow[:, 1:] |= front[:, :-1]; grow[:, :-1] |= front[:, 1:]
        front = grow & bgl & ~seen
        seen |= front
    return seen


def _dilate(m: np.ndarray, k: int = 3) -> np.ndarray:
    return np.array(Image.fromarray(m.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(k))) > 0


def key_background(rgb: np.ndarray, bg: np.ndarray, head_frac: float, tol: float = 56.0) -> tuple[np.ndarray, np.ndarray]:
    """크림 바탕 빼기. 돌려줌: (색을 바탕에서 떼어 낸 rgb, alpha 0~255)

    1) 가장자리에서 이어진 바탕(예전 방식) — 흰 셔츠 · 운동화 안쪽은 바탕과 이어지지 않아 남는다
    2) 갇힌 바탕: 머리카락 가닥 · 다리 · 팔 사이에 갇혀 1)이 못 닿는 크림 칸
       - 바탕과 거의 같은 색(d ≤ 10)인 덩어리만 본다(바탕은 종이 결이 없어 d ≤ 4)
       - 큰 덩어리(≥1500px)이면서 거의 다 바탕색(d ≤ 3 이 65% 이상) → 다리 · 팔 사이 빈칸
         (흰 양말 · 운동화 · 셔츠는 음영이 있어 이 비율이 60% 아래)
       - 머리 높이(head_frac 위쪽)에서 바깥과 10px 안에 붙은 덩어리 → 머리카락 가닥 사이 빈칸
         (눈 흰자 · 깃은 바깥에서 멀다). 묶은 머리 고리 안쪽처럼 20px 안이면 d ≤ 3 이 40% 이상일 때만
    3) 가장자리 1~2px 의 밝은 번짐을 투명도로 바꾸고 색에서 크림을 덜어 낸다(후광 없애기)
    """
    import cv2  # 이 단계에만 쓴다

    H, W, _ = rgb.shape
    d = np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2)
    out = flood_outside(d, tol)
    tight = ((d <= 10) & ~out).astype(np.uint8)
    n, lab, st, cen = cv2.connectedComponentsWithStats(tight, connectivity=4)
    dist = cv2.distanceTransform((~out).astype(np.uint8), cv2.DIST_L2, 3)
    remove = np.zeros_like(out)
    for i in range(1, n):
        area = int(st[i, 4])
        if area < 40:
            continue
        m = lab == i
        flat = float((d[m] <= 3).mean())
        if area >= 1500 and flat >= 0.65:
            remove |= m
        elif cen[i][1] < H * head_frac:
            r = float(dist[m].min())
            if r <= 10 or (r <= 20 and flat >= 0.4):  # 가닥이 두꺼운 고리(묶은 머리) 안쪽은 조금 멀어도 바탕색이 고르면
                remove |= m
    # 갇힌 바탕 둘레의 옅은 번짐도 함께(피부 · 흰 옷은 d 가 커서 닿지 않는다)
    for _ in range(2):
        remove |= _dilate(remove) & (d < 30) & ~out
    clear = out | remove
    alpha = np.where(clear, 0.0, 1.0).astype(np.float32)
    # 가장자리 2px: 바탕에 가까울수록 투명하게
    ring = _dilate(_dilate(clear)) & ~clear
    cover_ = np.clip((d.astype(np.float32) - 6) / 60, 0, 1)
    alpha = np.where(ring, np.minimum(alpha, cover_), alpha)
    # 색에서 크림 덜어 내기: c = a·f + (1-a)·bg → f = bg + (c - bg)/a
    a3 = np.maximum(alpha, 0.2)[..., None]
    f = np.clip(bg + (rgb.astype(np.float32) - bg) / a3, 0, 255)
    out_rgb = np.where(ring[..., None], f, rgb.astype(np.float32)).astype(np.uint8)
    return out_rgb, (alpha * 255).round().astype(np.uint8)


def crop_sheet(path: Path) -> dict:
    im = Image.open(path).convert('RGB')
    a = np.asarray(im)
    H, W, _ = a.shape
    bg = bg_color(a)
    diff = np.abs(a.astype(np.int16) - bg.astype(np.int16)).max(axis=2)
    fg = diff > 30
    col = fg.sum(axis=0)
    # 왼쪽 전신과 오른쪽 얼굴 사이의 가장 넓은 빈 세로줄
    lo, hi = int(W * 0.33), int(W * 0.75)
    gaps = [(s + lo, e + lo) for s, e in runs(col[lo:hi] <= 2)]
    if not gaps:
        raise ValueError('전신 · 얼굴 사이 빈칸을 찾지 못함')
    gs, ge = max(gaps, key=lambda g: g[1] - g[0])
    split = (gs + ge) // 2

    # 전신
    left = fg[:, :split]
    cols = np.where(left.sum(axis=0) > 2)[0]
    rows = np.where(left.sum(axis=1) > 2)[0]
    pad = 8
    x0, x1 = max(cols[0] - pad, 0), min(cols[-1] + pad, split)
    y0, y1 = max(rows[0] - pad, 0), min(rows[-1] + pad, H)
    body = a[y0:y1, x0:x1]
    body, alpha = key_background(body, bg, head_frac=0.36)
    sprite = Image.fromarray(np.dstack([body, alpha]), 'RGBA')

    # 얼굴(2~3개가 세로로 붙어 있다) — 위아래 끝을 찾고, 1/3 · 2/3(또는 1/2) 근처에서 가장 빈 가로줄로 나눈다
    right = fg[:, split:]
    prof = right.sum(axis=1).astype(np.float32)
    rows_r = np.where(prof > 3)[0]
    top, bot = int(rows_r[0]), int(rows_r[-1]) + 1
    span = bot - top

    def cuts(k: int):
        out = []
        for i in range(1, k):
            c = top + span * i // k
            r = int(span * 0.12)
            seg = prof[c - r:c + r]
            j = int(np.argmin(seg))
            out.append((c - r + j, float(seg[j])))
        return out
    c3, c2 = cuts(3), cuts(2)
    use = c3 if np.mean([v for _, v in c3]) <= np.mean([v for _, v in c2]) * 1.5 else c2
    edges = [top] + [c for c, _ in use] + [bot]
    faces = []
    for s, e in zip(edges[:-1], edges[1:]):
        band = right[s:e]
        c = np.where(band.sum(axis=0) > 2)[0]
        r = np.where(band.sum(axis=1) > 2)[0]
        if len(c) == 0 or len(r) == 0:
            continue
        bx0, bx1 = c[0] + split, c[-1] + split
        by0, by1 = s + r[0], s + r[-1]
        cx, cy = (bx0 + bx1) // 2, (by0 + by1) // 2
        side = int(max(bx1 - bx0, by1 - by0) * 1.04)
        crop = Image.new('RGB', (side, side), tuple(int(v) for v in bg))
        sx, sy = cx - side // 2, cy - side // 2
        piece = im.crop((max(sx, 0), max(sy, s), min(sx + side, W), min(sy + side, e)))
        crop.paste(piece, (max(sx, 0) - sx, max(sy, s) - sy))
        fr, fa = key_background(np.asarray(crop), bg, head_frac=0.6)
        faces.append(Image.fromarray(np.dstack([fr, fa]), 'RGBA'))
    return {'sprite': sprite, 'faces': faces}


def head_box(im: Image.Image) -> list[float]:
    """서 있는 그림의 머리(머리카락 · 묶은 머리 포함) 상자 [x0, y0, x1, y1] — 그림 비율(0~1).
    감정 표시 · 반짝이가 머리를 피할 때 쓴다(stage.js 가 data-head 로 넘긴다).
    가로: 맨 위 6% 줄에 닿는 덩어리(머리카락)를 위 25% 안에서만 본다 — 들어 올린 주먹 · 지팡이는 따로 떨어져 빠진다.
    세로: 맨 위부터 그림 높이 34%(턱 · 어깨 가까이)"""
    import cv2
    a = np.asarray(im.convert('RGBA'))[..., 3] > 128
    H, W = a.shape
    top = int(np.where(a.any(axis=1))[0][0])
    lim = min(H, top + int(H * 0.25))
    _, lab, st, _ = cv2.connectedComponentsWithStats(a[:lim].astype(np.uint8), connectivity=8)
    ids = [i for i in set(lab[top:top + int(H * 0.06)].ravel().tolist()) if i and st[i, 4] > 300]
    if not ids:
        return [0.15, 0.0, 0.85, 0.36]
    x0 = min(int(st[i, 0]) for i in ids); x1 = max(int(st[i, 0] + st[i, 2]) for i in ids)
    return [round(x0 / W, 3), round(top / H, 3), round(x1 / W, 3), round(min(H, top + int(H * 0.34)) / H, 3)]


def save_webp(img: Image.Image, path: Path, quality: int = 80) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)
    return {'src': path.relative_to(DEV / 'site').as_posix(), 'w': img.width, 'h': img.height, 'kb': round(path.stat().st_size / 1024)}


def fresh(src: Path, out: Path) -> bool:
    return out.exists() and out.stat().st_mtime > src.stat().st_mtime and '--force' not in sys.argv


def cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    W, H = size
    r = max(W / img.width, H / img.height)
    im = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))


def match(name: str, table) -> str | None:
    n = name.lower()
    for key, words in table:
        if any(w.lower() in n for w in words):
            return key
    return None


def main() -> int:
    manifest = {'chars': {}, 'bg': {}, 'end': {}, 'card': {}, 'ui': {}, 'source': str(ART.name)}
    imgs = all_images()
    CHECK.mkdir(exist_ok=True)
    checks = []

    # 캐릭터: 배경 · 엔딩 · 기술카드 폴더 밖에서 이름으로
    char_files = [p for p in imgs if not in_dir(p, ['배경', '엔딩', '기술카드', 'bg', 'end', 'card', 'UI', '타이틀'])]
    for cid, words in CHAR_KEYS.items():
        cands = [p for p in char_files if any(w in re.sub(r'^\d+[_ -]*', '', p.stem) for w in words)]
        if cid == 'bong':  # 「봉」 한 글자는 다른 낱말과 겹치지 않게 앞쪽 일치만
            cands = [p for p in cands if re.sub(r'^\d+[_ -]*', '', p.stem).startswith('봉')]
        sheets = [p for p in cands if Image.open(p).width > Image.open(p).height]
        if not sheets:
            continue
        src = sheets[0]
        # 이미 만든 것이 원본보다 새것이면 다시 자르지 않는다(빠르게)
        old_sp = OUT / 'ch' / f'{cid}.webp'
        old_faces = sorted((OUT / 'ch').glob(f'{cid}_[0-9].webp')) if (OUT / 'ch').exists() else []
        if old_sp.exists() and old_faces and old_sp.stat().st_mtime > src.stat().st_mtime and '--force' not in sys.argv:
            im = Image.open(old_sp)
            manifest['chars'][cid] = {'sprite': {'src': old_sp.relative_to(DEV / 'site').as_posix(), 'w': im.width, 'h': im.height, 'kb': round(old_sp.stat().st_size / 1024)},
                                      'faces': [f.relative_to(DEV / 'site').as_posix() for f in old_faces], 'from': src.name,
                                      'head': head_box(im)}
            print(f'  캐릭터 {cid:9s} (그대로)')
            continue
        try:
            r = crop_sheet(src)
        except Exception as e:  # noqa: BLE001
            print(f'  ! {src.name}: {e}')
            continue
        sp = r['sprite']
        sp = sp.resize((round(sp.width * SPRITE_H / sp.height), SPRITE_H), Image.LANCZOS)
        ent = {'sprite': save_webp(sp, OUT / 'ch' / f'{cid}.webp', 82), 'faces': [], 'from': src.name, 'head': head_box(sp)}
        for i, f in enumerate(r['faces']):
            ent['faces'].append(save_webp(f.resize((FACE, FACE), Image.LANCZOS), OUT / 'ch' / f'{cid}_{i}.webp', 82)['src'])
        manifest['chars'][cid] = ent
        checks.append((cid, sp, [f.resize((FACE, FACE)) for f in r['faces']]))
        print(f'  캐릭터 {cid:9s} ← {src.name}  전신 {sp.width}×{sp.height} · 표정 {len(r["faces"])}')

    for p in files_under('배경', 'bg'):
        k = match(p.stem, BG_KEYS)
        if not k or k in manifest['bg']:
            continue
        out = OUT / 'bg' / f'{k}.webp'
        manifest['bg'][k] = out.relative_to(DEV / 'site').as_posix() if fresh(p, out) else save_webp(cover(Image.open(p).convert('RGB'), BG_SIZE), out, 74)['src']
        print(f'  배경 {k:7s} ← {p.name}')

    for p in files_under('엔딩', 'end'):
        m = re.search(r'E\s*0?(\d{1,2})', p.stem, re.I)
        if not m:
            continue
        no = int(m.group(1))
        if not 1 <= no <= 10:
            continue
        g = ''
        if re.search(r'[_\- ](남|m|male|boy)$', p.stem, re.I):
            g = 'm'
        elif re.search(r'[_\- ](여|f|female|girl)$', p.stem, re.I):
            g = 'f'
        key = f'E{no}{g}'
        if key in manifest['end']:
            continue
        out = OUT / 'end' / f'{key}.webp'
        # 엔딩 그림은 자르지 않는다(1인칭 장면은 아래쪽 손 · 화면이 주인공) — 비율 그대로 가로 1500
        if fresh(p, out):
            manifest['end'][key] = out.relative_to(DEV / 'site').as_posix()
        else:
            im = Image.open(p).convert('RGB')
            if im.width > 1500:
                im = im.resize((1500, round(im.height * 1500 / im.width)), Image.LANCZOS)
            manifest['end'][key] = save_webp(im, out, 76)['src']
        print(f'  엔딩 {key:5s} ← {p.name}')

    for p in files_under('기술카드', 'card'):
        k = match(p.stem, CARD_KEYS)
        if not k or k in manifest['card']:
            continue
        out = OUT / 'card' / f'{k}.webp'
        if fresh(p, out):
            manifest['card'][k] = out.relative_to(DEV / 'site').as_posix()
        else:
            im = Image.open(p).convert('RGB')
            im = im.resize((CARD_W, round(im.height * CARD_W / im.width)), Image.LANCZOS)
            manifest['card'][k] = save_webp(im, out, 78)['src']
        print(f'  카드 {k:7s} ← {p.name}')

    # UI 그림(틀 · 단추 · 아이콘 · 꽃잎 · 키 비주얼) — tools/ui_art.py
    from ui_art import process as ui_process
    manifest['ui'] = ui_process(ART, OUT / 'ui', DEV / 'site', save_webp, fresh)

    # 지난번에 만든 파일 중 이번에 없는 것은 지운다(manifest 와 폴더를 맞춘다)
    keep = {v['src'] for v in manifest['ui'].values() if v['src'].startswith('img/')}
    for c in manifest['chars'].values():
        keep.add(c['sprite']['src']); keep.update(c['faces'])
    keep.update(manifest['bg'].values()); keep.update(manifest['end'].values()); keep.update(manifest['card'].values())
    for f in OUT.rglob('*.webp'):
        if f.relative_to(DEV / 'site').as_posix() not in keep:
            f.unlink()

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
    total = sum(f.stat().st_size for f in OUT.rglob('*.webp'))
    print(f'그림 {len(keep)}장 · {total / 1024 / 1024:.2f} MB → {MANIFEST.relative_to(DEV)}')

    if checks and '--check' in sys.argv:  # 확인용 모아보기
        cw = 260 + 3 * (FACE + 10)
        sheet = Image.new('RGB', (cw * 3, 640 * ((len(checks) + 2) // 3)), (200, 200, 200))
        for i, (cid, sp, faces) in enumerate(checks):
            ox, oy = (i % 3) * cw, (i // 3) * 640
            tile = Image.new('RGB', (cw, 640), (120, 160, 120))
            s2 = sp.resize((round(sp.width * 560 / sp.height), 560))
            tile.paste(s2, (10, 40), s2)
            for j, f in enumerate(faces):
                tile.paste(f, (s2.width + 20 + j * (FACE + 10) if s2.width + 20 + j * (FACE + 10) + FACE <= cw else 10 + j * (FACE + 10), 40 + (0 if s2.width + 20 + 3 * (FACE + 10) <= cw else 400)))
            sheet.paste(tile, (ox, oy))
        sheet.thumbnail((2000, 2000))
        sheet.save(CHECK / 'sheets.png')
    return 0


if __name__ == '__main__':
    sys.exit(main())
