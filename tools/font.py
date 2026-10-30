"""제목 글꼴 만들기 — Noto Serif KR(SIL OFL 1.1)에서 이 게임에 쓰이는 글자만 골라 작은 woff2 로.

    python tools/font.py            (_개발 폴더에서 · fonttools + brotli 필요)

- 원본: C:/Windows/Fonts/NotoSerifKR-VF.ttf (없으면 --src 로 경로)
- 굵기 두 개만 떼어 낸다(가변 글꼴 그대로면 너무 크다)
  700 = 머리글 · 이름표 · 단추: src/*.js · site/*.html 에 나오는 한글 + 영문 · 숫자 · 기호
  900 = 제목 글자(로고)만: 「손잡이 동아리」 + 영문
- 결과: site/fonts/serif-kr-700.woff2 · serif-kr-900.woff2 + site/fonts/OFL.txt
  글에 새 낱자가 생기면 다시 돌린다(없는 글자는 시스템 글꼴로 보인다 — 깨지지는 않는다)
"""
from __future__ import annotations

import argparse
import glob
import io
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

DEV = Path(__file__).resolve().parent.parent
OUT = DEV / 'site' / 'fonts'


def used_text() -> str:
    s = ''
    for f in glob.glob(str(DEV / 'src' / '*.js')) + glob.glob(str(DEV / 'site' / '*.html')):
        s += Path(f).read_text(encoding='utf-8')
    hangul = {c for c in s if '\uac00' <= c <= '\ud7a3'}
    ascii_ = {chr(i) for i in range(0x20, 0x7f)}
    extra = set('·…「」『』—–‘’“”①②③④★☆♪✓→←▶◀▼')
    return ''.join(sorted(hangul | ascii_ | extra))


def build(src: Path, wght: int, text: str) -> int:
    f = TTFont(str(src))
    f = instancer.instantiateVariableFont(f, {'wght': wght})
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'palt']
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]   # 저작권 · 라이선스 이름 칸은 남긴다
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    out = OUT / f'serif-kr-{wght}.woff2'
    f.flavor = 'woff2'
    f.save(str(out))
    return out.stat().st_size


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='C:/Windows/Fonts/NotoSerifKR-VF.ttf')
    a = ap.parse_args()
    src = Path(a.src)
    OUT.mkdir(parents=True, exist_ok=True)
    text = used_text()
    logo = '손잡이동아리' + ''.join(chr(i) for i in range(0x20, 0x7f)) + '·—'
    for w, t in ((700, text), (900, logo)):
        print(f'{w}: {build(src, w, t) // 1024} KB ({len(t)}자)')
    lic = TTFont(str(src))['name'].getDebugName(13) or 'SIL Open Font License, Version 1.1'
    (OUT / 'OFL.txt').write_text('Noto Serif KR — Copyright 2017 Adobe (http://www.adobe.com/), with Reserved Font Name \'Source\'.\n'
                                 'Subset by tools/font.py for this site.\n\n' + lic + '\nhttps://openfontlicense.org\n', encoding='utf-8')


if __name__ == '__main__':
    main()
