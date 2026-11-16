[English](README.md) | **한국어**

# tools

[HobbyProgrammer5000](https://hobby-programmer-5000.github.io)이 만든, 브라우저에서 바로 돌아가는 작은 웹 도구 모음입니다.
입력한 내용은 어디에도 보내지 않습니다.

**열기: https://hobby-programmer-5000.github.io/tools/**

## 도구

### X 글자 수 세기 — [`/tools/x-counter/`](https://hobby-programmer-5000.github.io/tools/x-counter/)

X와 똑같은 방식으로 글자 수를 세고, 긴 글은 어디서 잘리는지 보여 줍니다.

- X의 오픈소스 글자 수 계산 라이브러리 [twitter-text](https://github.com/twitter/twitter-text)를 그대로 써서, X에 보이는 숫자와 같습니다.
- 한글·한자·일본어는 2자, 링크는 23자, 이모지는 2자로 셉니다.
- 일반 280자 한도와 Premium 25,000자 한도를 바꿀 수 있습니다.
- "이렇게 셌어요"에서 글자 종류별로 몇 자가 더해졌는지 보여 주고, 합은 항상 전체 숫자와 같습니다.
- 한도를 넘으면 잘려 나가는 부분을 강조합니다.
- 복사(Ctrl+Enter), 되돌리기가 있는 지우기, 이 브라우저에만 남는 초안.
- 영어와 한국어, 밝게와 어둡게.

### Scrollfold — [`/tools/scrollfold/`](https://hobby-programmer-5000.github.io/tools/scrollfold/)

가로로 긴 이미지 하나를 X 여러 장 게시물용 같은 너비 띠 최대 20개로 자르고, 이어 붙은 모습을 미리 보여 줍니다.

- 실제 X 게시물을 측정해 고른 조각 비율 프리셋, 자르기 또는 여백(늘리지 않음), "X 최적화"(4096px·5MB 이하 JPEG).
- 이미지는 브라우저 안에서 처리되고 업로드되지 않습니다. 결과는 `.zip`으로 받습니다.
- 여기 있는 것은 브라우저 버전뿐입니다. 데스크톱 앱, 폴더에 바로 저장하고 더 많은 포맷(TIFF, TGA, JPEG 2000 등)을 여는
  로컬 모드가 있는 전체 앱은 **[hobby-programmer-5000/scrollfold](https://github.com/hobby-programmer-5000/scrollfold)**에 있습니다.
- 여기 페이지는 이 사이트의 모양을 씁니다. 자르는 로직 `scrollfold/split.js`는 그 저장소의 `web/split.js`를 그대로 복사한 것이니, 그쪽에서 고친 뒤 여기로 복사하세요.

### 사진 그리기 (Photo Painter) — [`/tools/photo-painter/`](https://hobby-programmer-5000.github.io/tools/photo-painter/)

사진을 넣으면 붓 자국을 하나씩 놓아 그림으로 그리고, PNG로 저장합니다.

- 126 px에서 3 px까지 붓 여덟 개를 네 단계(밑칠, 형태와 색, 다듬기, 세부 묘사)로 씁니다.
- 붓 자국마다 흐리게 한 사진에서 색을 가져와, 그림이 사진과 아직 가장 많이 다른 곳에 놓습니다
  (Hertzmann의 painterly rendering, SIGGRAPH 98). 같은 브라우저에서는 같은 사진이 항상 같은 그림이 됩니다.
- 일시정지, 다시 그리기, 1배·3배 속도, 끝까지 바로 가기. PNG 저장(Ctrl+S)은 그 순간의 그림을 긴 변 840 px로 저장합니다.
- 사진은 브라우저 안에서 처리되고 업로드되지 않습니다. 페이지에 들어 있는 사진도 없습니다.

### 밈 만들기 (Meme Maker) — [`/tools/meme/`](https://hobby-programmer-5000.github.io/tools/meme/)

광고·워터마크·가입 없이 밈을 만들고, 밈의 일부를 내 문구·손글씨·사진으로 바꿉니다.

- 밈을 붙여 넣거나(Ctrl+V) 끌어다 놓거나, 빈 바탕에서 시작합니다. 위·아래에 흰 캡션 띠를 넣거나, 아래에 그림을 이어 붙입니다.
- **덮기**로 원래 글자를 주변 색 상자로 덮고, 글자 상자를 넣으면 글자 크기가 상자에 맞춰집니다
  (시스템 글꼴 4종, 글자색, 외곽선, 정렬). 무엇이든 옮기고 크기를 바꾸고 회전할 수 있습니다.
- **구멍**은 그림의 일부를 투명하게 만들어(타원, 사각형, 올가미, 지우개, 가장자리 흐림) 그 뒤에 내 사진을 둘 수 있게 합니다.
  **오리기**는 내 사진에서 표시한 부분만 남깁니다.
- 손글씨: **펜**으로 직접 쓰거나, 종이에 쓴 글씨를 찍어 **+ 손글씨 사진**으로 넣으면 잉크만 원하는 색으로 남습니다.
- 레이어, 되돌리기·다시 하기, 원래 크기 PNG 저장(Ctrl+S, 4096 px나 1200만 픽셀이 넘는 바탕은 먼저 줄임), 이미지 복사, 이 브라우저(IndexedDB)에만 남는 **내 템플릿**.
- 그림과 글자는 브라우저 밖으로 나가지 않고, 입력한 글자는 시스템 글꼴로만 그려서 글꼴 파일도 받지 않습니다.
  밈 이미지는 들어 있지 않습니다. 템플릿은 직접 저장한 것뿐입니다.

## 왜 만들었나

X에 한국어와 영어를 섞어 쓰면 글이 보기보다 훨씬 빨리 찹니다. 한글은 한 글자가 2자로 세어지기 때문입니다.
올리기 전에 진짜 숫자와 그 이유를 보고 싶었습니다.

## 로컬에서 실행

```bash
node --test
python -m http.server 8766
```

그다음 http://127.0.0.1:8766/ 을 엽니다. 빌드 단계는 없습니다.

## 검증 방법

`test/counter.test.mjs`는 페이지가 불러오는 것과 같은 라이브러리 번들로 돌아갑니다. 영문 280/281자, 한글 140/141자,
링크 23자, 결합 이모지 2자, 잘리는 위치, Premium 25,000자 한도, 그리고 문자열 512개(그중 500개는 무작위)에서
내역의 합이 공식 값과 같은지 확인합니다. `test/meme.test.mjs`는 밈 만들기의 글자 맞춤(고른 크기는 맞고 한 단계 크면 넘침),
회전한 상자 판정과 크기 조절, 올가미 판정, 픽셀을 움직이지 않는 오리기, 잉크 따오기, 덮개 색, 되돌리기, 레이어 순서, 바탕 크기 계산을 확인합니다. GitHub Actions가 테스트를 돌리고 통과할 때만 배포합니다.

## 구성

```
index.html, assets/      도구 목록과 공통 모양, 언어·테마
assets/i18n.js           모든 UI 문자열, 영어와 한국어
tools.json               도구 목록 (랜딩 페이지도 이 파일을 읽음)
x-counter/               X 글자 수 세기 (counter.js가 로직, app.js가 화면)
scrollfold/              Scrollfold 페이지 (split.js는 hobby-programmer-5000/scrollfold에서 복사, 그쪽에서 고칠 것)
photo-painter/           사진 그리기 (painter.js가 붓 자국을 계획, app.js가 그림)
meme/                    밈 만들기 (meme.js가 로직, app.js가 캔버스와 조작)
vendor/                  twitter-text 번들, 라이선스, 만든 방법
test/                    node:test
```

## 크레딧

번들한 라이브러리·폰트·아이콘은 [CREDITS.md](CREDITS.md), 각 도구가 따르는 규칙의 출처는 [REFERENCES.md](REFERENCES.md)에 있습니다.

## 기여자

- **HobbyProgrammer5000**: 아이디어, 도구 선택, 요구사항, 검토
- **Claude** (Anthropic): 디자인, 구현, 테스트, 문서

## 라이선스

이 리포를 위해 작성한 코드는 [MIT 라이선스](LICENSE)입니다.
번들한 twitter-text 라이브러리는 Apache-2.0, 그 의존성은 각자의 라이선스(MIT)를 그대로 따릅니다. [vendor/](vendor/README.md)를 보세요.
파비콘으로 쓰는 프로필 사진은 포함되지 않습니다.
