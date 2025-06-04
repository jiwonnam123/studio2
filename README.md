# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

## Cloud Functions 설정 및 배포

1. Functions 디렉터리 의존성 설치

```bash
npm --prefix functions install
```

2. TypeScript 빌드

```bash
npm --prefix functions run build
```

3. 로컬 에뮬레이터 실행

```bash
firebase experiments:enable webframeworks
firebase emulators:start --only functions
```

4. Cloud Functions 배포

```bash
firebase deploy --only functions
```
