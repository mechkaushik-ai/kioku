# Kioku (記憶) — Kana & Kanji flashcards with spaced repetition

An offline Android app for learning Japanese:

- **Hiragana and katakana**: all 208 cards (46 basic + dakuten, handakuten and combinations like きゃ) with romaji, how each sounds in English, a mnemonic and a picture. Tap ▶ to hear it.
- **Kanji N5 to N1**: all 2,211 JLPT kanji with on'yomi, kun'yomi, furigana, English keyword and meanings, the character's real parts (from KanjiVG), a mnemonic, a sound-alike reading hook and a picture.
- **Spaced repetition**: an Anki-style scheduler (learning steps, then growing intervals; Again / Hard / Good / Easy), daily new-card limit, undo, recognition and recall modes.
- **Card creator**: make your own kana, kanji or vocabulary cards with an emoji or your own photo or drawing, build decks from the library, and edit the mnemonic or picture on any built-in card.
- Light and dark themes, a weekly chart and streak, backup export and import. No ads, no tracking, no internet needed.

## Get the app on your phone (about 15 minutes, free)

You don't need to install anything on your computer. GitHub builds the app for you, the same way as Dit Dah.

### 1. Make a new repository
1. Sign in at github.com and click **New** (green button), name it `kioku`, choose **Public**, tick **Add a README**, and click **Create repository**.

### 2. Upload the code
1. Unzip `Kioku.zip` on your computer.
2. In your repository, click **Add file › Upload files**.
3. Open the `Kioku` folder, select **everything inside it** (including the hidden `.github` folder; on Windows turn on *View › Show › Hidden items*, on a Mac press Cmd+Shift+. in Finder) and drag it onto the page.
4. Click **Commit changes**. If GitHub asks, let it replace the README.

**Check:** the repository shows `.github`, `app`, `docs`, `tests` and `tools`.
If `.github` is missing: **Add file › Create new file**, type `.github/workflows/build.yml` as the name, paste the contents of that file from the zip, and commit.

### 3. Let GitHub build it
1. Open the **Actions** tab. If asked, click the green button to enable workflows.
2. A run called **Build app** starts. Wait 4 to 8 minutes for a green tick ✅. If you see a red ✗, click it, copy the red error text and paste it to Claude.
3. Open the finished run, scroll to **Artifacts** and download **Kioku-test-apk** (a zip with `app-debug.apk` inside).

### 4. Install it
1. Send the APK to your phone (email it to yourself or use Google Drive), then tap it.
2. Allow installs from that app when Android asks, then tap **Install**.
3. Open **Kioku**. Hiragana is switched on; tap **Study now**.

**Sound:** the ▶ buttons use your phone's text-to-speech. If it says no Japanese voice was found, open *Settings › System › Languages › Text-to-speech*, choose Google's engine, and download the Japanese voice.

**Updating:** a test build can't install over another test build. Export a backup first (Settings › Export backup), uninstall, install the new one, then import the backup.

## Publishing it

The signing, Play Store and IzzyOnDroid steps are the same as for Dit Dah. Create a keystore, add the four repository secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`), and the workflow also produces the signed `Kioku.apk` and `Kioku.aab`. Publishing a GitHub Release attaches the signed APK automatically.

Before the first public release, decide on the permanent app ID. It is `com.kioku.kanakanji` in `app/build.gradle.kts` (`applicationId`). Change it now if you want your own (for example `io.github.yourname.kioku`). It can't be changed after release. For the store listing's privacy policy, publish `docs/index.md` with GitHub Pages (Settings › Pages › branch `main`, folder `/docs`).

## How the app is built

| Part | Where |
|---|---|
| Android shell (Kotlin): WebView, Japanese speech, file picker, backup saving | `app/src/main/java/com/kioku/kanakanji/MainActivity.kt` |
| App screens: study, browse, card creator, settings | `app/src/main/assets/www/js/app.js`, `css/app.css` |
| Spaced-repetition scheduler | `app/src/main/assets/www/js/srs.js` (tests in `tests/srs.test.js`) |
| Card data (generated) | `app/src/main/assets/www/data/*.js` |
| Data generator, hand-written kana mnemonics, reading hooks | `tools/build_data.py`, `tools/kana_data.py` |

Progress is saved on the phone in the app's own storage. Android's automatic backup may include it, but exporting a backup file is the reliable way to keep it.

### The scheduler in one paragraph
A new card is shown again after 1 minute, then 10 minutes (the learning steps; change them in Settings). Answering **Good** after the last step "graduates" it to 1 day; **Easy** on a new card jumps straight to 4 days. After that each **Good** multiplies the interval by the card's ease (starts at 250%), **Hard** grows it by 20% and lowers the ease, **Easy** grows it faster and raises the ease, and **Again** sends it back to a 10-minute relearning step, resets the interval to 1 day and lowers the ease (never below 130%). Intervals get a small random spread so cards learned together don't all come back on the same day. The day rolls over at 4 am.

### Regenerating the card data
Only needed if you change the mnemonics in `tools/kana_data.py`:

```
curl -o kanji.json https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json
curl -o emoji.json https://raw.githubusercontent.com/muan/emojilib/main/dist/emoji-en-US.json
# KanjiVG files: one per kanji, named like 08a9e.svg, from https://github.com/KanjiVG/kanjivg/tree/master/kanji
python3 tools/build_data.py kanji.json emoji.json path/to/kanjivg/kanji app/src/main/assets/www/data
```

## Credits and licences

- Kanji meanings and readings: [KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project), © Electronic Dictionary Research and Development Group, CC BY-SA 4.0. JLPT levels via [kanji-data](https://github.com/davidluzgouveia/kanji-data) (MIT).
- Kanji parts: [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel, CC BY-SA 3.0.
- Emoji keywords: [emojilib](https://github.com/muan/emojilib) (MIT).

Because the kanji data is CC BY-SA, the generated data files (`app/src/main/assets/www/data/kanji.js`) are shared under CC BY-SA 4.0 too. The app's code is yours to license; MIT is a good choice for an open-source release.
