# tools

이 프로젝트는 `small-app-harness` 스킬의 공통 규칙을 웹에 맞게 따른다 (exe·PyInstaller 규칙 대신 정적 웹 규칙).
개인 정보(계정, 로컬 경로)는 `CLAUDE.local.md`, 계약과 진행 상태는 `PROGRESS.md`에 있다 (둘 다 gitignore).
이 파일은 공개 저장소에 올라가도 괜찮은 내용만 쓴다.

## 무엇인가

브라우저에서 바로 돌아가는 작은 웹 도구 모음. GitHub Pages로 `hobby-programmer-5000.github.io/tools/`에 올라간다.
첫 도구는 X 글자 수 세기(`x-counter/`).

## 명령

| 할 일 | 명령 |
|---|---|
| 테스트 | `node --test` (또는 `build.bat`) |
| 로컬 미리보기 | `python -m http.server 8766` 후 http://127.0.0.1:8766/ |
| 배포 | `main`에 push → Actions가 테스트 통과 시에만 배포 |

## 구조

```
index.html, assets/catalog.js   도구 목록 (/tools/), tools.json에서 그림
assets/site.css, site.js         모든 페이지 공통 모양, 언어·테마 전환, 토스트
assets/i18n.js                   모든 UI 문자열 (en, ko)
assets/icons.svg                 아이콘 스프라이트
tools.json                       도구 목록. 랜딩 페이지 Playground 칸도 이 파일을 읽는다
<slug>/index.html, app.js        도구 화면 (DOM)
scrollfold/                      Scrollfold 페이지(사이트 공용 틀, 문자열은 sf.*). split.js만 hobby-programmer-5000/scrollfold의 web/split.js 그대로 복사본이다. split.js는 여기서 고치지 말고 원본에서 고친 뒤 복사한다
photo-painter/                   사진 그리기. painter.js가 붓 자국을 계획하고(로직), app.js가 그린다. 사진을 페이지에 넣지 않는다 (테스트 pp7)
<slug>/<logic>.js                도구 로직 (DOM 없음, Node에서 테스트)
vendor/                          외부 라이브러리 번들과 라이선스, 만든 방법
test/                            node:test
```

## 새 도구를 추가할 때

1. `<slug>/`에 화면과 로직을 나눠 만든다. 로직은 DOM 없이 Node에서 테스트할 수 있게 한다.
2. 문자열은 `assets/i18n.js`에 `<접두어>.` 키로 영/한 모두 넣는다 (테스트가 키 집합을 비교한다).
3. `tools.json`에 항목을 추가한다 (테스트가 폴더와 영/한 이름·설명을 확인한다).
4. 외부 코드·폰트·아이콘을 넣으면 `CREDITS.md`, 참고한 문서는 `REFERENCES.md`에 적는다. 상업적 이용이 가능한 것만 쓴다.

## 이 프로젝트의 불변 조건

- 사용자가 입력한 내용은 네트워크로 보내지 않는다. 저장은 그 브라우저의 localStorage에만, try/catch로 감싼다.
- 빌드 단계 없음. 외부 라이브러리는 한 번 번들해서 `vendor/`에 커밋하고 만든 방법을 `vendor/README.md`에 남긴다.
- X 글자 수는 twitter-text의 `parseTweet`이 정한다. 내역(breakdown)은 그 합이 공식 값과 같아야 한다 (테스트).
- 텍스트 대비는 밝게/어둡게 모두 WCAG AA(4.5:1) 이상.

## 하지 말 것

- X API 호출, 로그인, 자동 게시 같은 약관 회색지대 기능.
- 출처를 확인하지 않은 규칙을 화면에 "X 기준"이라고 쓰기.
