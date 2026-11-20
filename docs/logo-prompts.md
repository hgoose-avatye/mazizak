# 만지작 로고 프롬프트 (GPT 이미지 생성용)

게임 화면과 어울리게 맞춘 로고 프롬프트입니다.

- 게임 분위기: 말랑한 젤리 장난감, 크림 바탕에 민트·버터·핑크, 통통한 둥근 글씨(주아체 계열), 아래에 색 있는 받침이 깔린 젤리 버튼

## 쓰임새

| 무엇 | 어디에 | 파일 이름 · 크기 |
|---|---|---|
| ⓪ 인트로 로고 | 앱을 켤 때 첫 화면(움직이며 등장) | `intro-character.png` + `intro-wordmark.png` (또는 `intro-logo.png`) · 배경 투명 |
| ① 글자 로고 | 스토어 대표 이미지, 공유 이미지 | `logo-wordmark.png` · 2048×1024, 배경 투명 |
| ② 앱 아이콘 | 토스 앱 아이콘, 홈 화면 | `app-icon.png` · 1024×1024, 배경 꽉 채움(투명 X) |
| ③ 심볼만 | 작은 자리(로딩, 공유 썸네일 모서리) | `logo-symbol.png` · 1024×1024, 배경 투명 |

받으시면 `app/public/brand/` 폴더에 위 이름으로 넣어 주세요. 제가 화면에 연결하겠습니다.

## 공통 스타일 (모든 프롬프트 앞에 붙이기)

```
Cute casual mobile game branding, soft squishy "jelly toy" style: puffy rounded chunky shapes, a glossy soft highlight on top, a thick darker "lip" shadow underneath like a pressed squishy toy, pastel but saturated palette — mint green (#3fbf98, light #8ce8c8), cream (#fffaf1), butter yellow (#ffcf4d), soft pink (#ff7fa1), deep green-brown outline (#2e4a3f). Friendly, warm, for all ages including older adults, clean and readable at small sizes. No gradients that look metallic, no 3D realism, no extra words.
```

## ⓪ 인트로 로고 (앱을 켤 때 첫 화면)

세로 폰 화면 가운데에 크게 뜨는 로고입니다. 위에 말랑이 캐릭터, 아래에 "만지작" 글자를 둔 세로 배치입니다. 움직임은 그림으로 받지 않습니다. 받은 그림을 앱에서 코드로 움직입니다. 말랑하게 통통 튀며 떨어져 살짝 눌렸다가 펴지고, 글자는 한 글자씩 뽁뽁 나타납니다. 그래서 **캐릭터와 글자를 따로 받으면** 따로 움직일 수 있어 더 좋습니다.

- 파일: `intro-character.png`(1024×1024), `intro-wordmark.png`(2048×768), 둘 다 **배경 투명**. 한 장으로 받고 싶으면 `intro-logo.png`(1024×1536, 세로).
- 인트로 배경은 앱 크림색(#fffaf1)이라, 그 위에서 잘 보이게 테두리가 진한 쪽이 좋습니다.

**캐릭터** (공통 스타일 뒤에 붙이기)

```
An intro-screen mascot for a fidget-toy game: a round, plump mint-green squishy jelly blob character with a tiny happy face (two small dot eyes, rosy pink cheeks, a small smile), slightly squashed as if it just landed, a glossy highlight on top, a thick deep green-brown outline (#2e4a3f) and a darker mint lip underneath. A small pink squishy friend and a butter-yellow bubble peek out from behind it. Centred, generous empty margin, no text, fully transparent background, PNG, 1024x1024.
```

**글자** (공통 스타일 뒤에 붙이기)

```
A Korean title wordmark reading exactly "만지작" (만 · 지 · 작), very chunky, puffy, rounded jelly letters like soft squishy toys, white fill with a thick deep green-brown outline (#2e4a3f) and a solid offset shadow, each syllable tilted a little and bouncing on a gentle wave, one tiny fingertip dent on "지". Below it, small rounded letters "MANZIZAK" in mint (#3fbf98). Centred, fully transparent background, PNG, 2048x768.
```

**한 장으로 받을 때**

```
A vertical intro logo for a fidget-toy game: on top, a round plump mint-green squishy jelly blob character with a tiny happy face (dot eyes, pink cheeks, small smile), a pink squishy friend peeking from behind; below it, the Korean title "만지작" in very chunky, puffy, rounded jelly letters, white with a thick deep green-brown outline and an offset shadow, and small mint letters "MANZIZAK" underneath. Everything centred with generous margin, fully transparent background, PNG, 1024x1536.
```

## ① 글자 로고 — "만지작"

```
A Korean wordmark logo reading exactly "만지작" (three Hangul syllables: 만 · 지 · 작), drawn as chunky, puffy, rounded jelly letters like soft squishy toys. White letter fill with a thick deep green-brown outline (#2e4a3f) and a solid offset shadow underneath, like a sticker. The letters are slightly bouncy (each tilted a little, sitting on a gentle wave), with a small mint jelly blob and a pink squishy blob tucked beside the last syllable, and one tiny fingertip-press dent on the "지" to suggest squeezing. Horizontal layout, centred, generous empty margin, fully transparent background, PNG, 2048x1024.
```

> 한글 글자가 틀리게 나오면(받침이 빠지거나 다른 글자), "만", "지", "작" 세 글자를 따로 생성한 뒤 합치거나, 같은 대화에서 "글자는 정확히 만지작, 다른 글자 금지"라고 다시 요청하세요.

## ② 앱 아이콘

```
A square mobile app icon for a fidget-toy game called 만지작: one big round mint-green squishy jelly ball in the centre, with a soft finger-shaped dent pressed into its top and a glossy highlight, sitting on a cream background with very faint soft polka dots. A tiny pink heart-shaped squishy and a small butter-yellow bubble float at the side. Thick soft deep green-brown outline, a darker mint lip underneath the ball like a pressed toy. Bold simple shapes that still read at 48 pixels. No text. Fill the whole square (no transparency, no rounded corners — the store rounds them), PNG, 1024x1024.
```

## ③ 심볼만

```
A logo symbol only: a round mint-green squishy jelly ball with a soft fingertip dent on top, a glossy highlight, a thick deep green-brown outline and a darker mint lip underneath, a small pink squishy blob leaning against it. Centred, simple, readable at very small sizes, no text, fully transparent background, PNG, 1024x1024.
```

## 참고

- 같은 대화창에서 ①을 먼저 만들고, 마음에 들면 "같은 스타일로 앱 아이콘" 식으로 이어서 요청하면 세 개의 분위기가 맞습니다.
- 앱 안의 글꼴이 주아체라, 글자 로고도 둥글고 통통한 손글씨 느낌이면 화면과 잘 어울립니다.
