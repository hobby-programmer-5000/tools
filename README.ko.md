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
내역의 합이 공식 값과 같은지 확인합니다. GitHub Actions가 테스트를 돌리고 통과할 때만 배포합니다.

## 구성

```
index.html, assets/      도구 목록과 공통 모양, 언어·테마
assets/i18n.js           모든 UI 문자열, 영어와 한국어
tools.json               도구 목록 (랜딩 페이지도 이 파일을 읽음)
x-counter/               X 글자 수 세기 (counter.js가 로직, app.js가 화면)
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
