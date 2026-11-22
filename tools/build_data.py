"""Builds the app's data files (kana.js, kanji.js) from source data.

Inputs:
  kanji.json  - davidluzgouveia/kanji-data (KANJIDIC2 + JLPT levels)
  emoji.json  - muan/emojilib keyword list
  kanjivg/    - KanjiVG SVGs (component breakdown), named <codepoint:05x>.svg
Usage: python3 build_data.py <kanji.json> <emoji.json> <kanjivg_dir> <out_dir>
"""
import json
import re
import sys
import zlib

from kana_data import (CONSONANT_NOTE, DAKUTEN, HANDAKUTEN, HIRAGANA, HOOKS, KANJI_HAND,
                       KATAKANA, RADICAL_NAMES, VOWEL_SOUND, YOON_BASES, YOON_SMALL)
from kvg_components import components

# ---------------------------------------------------------------- romaji
_ROMA = {}
for row in HIRAGANA:
    _ROMA[row[0]] = row[1]
for base, (v, r) in list(DAKUTEN.items()) + list(HANDAKUTEN.items()):
    _ROMA[v] = r
_ROMA.update({"ゃ": "ya", "ゅ": "yu", "ょ": "yo", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o"})


def to_hira(s):
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s)


def to_kata(s):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in s)


def romaji(kana):
    s = to_hira(kana)
    out, i, sokuon = "", 0, False
    while i < len(s):
        c = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else ""
        if c == "っ":
            sokuon = True
            i += 1
            continue
        if nxt and nxt in "ゃゅょ":
            base = _ROMA.get(c, c)
            small = _ROMA[nxt]
            r = base[:-1] + (small[1:] if base in ("shi", "chi", "ji") else small)
            i += 2
        elif c == "ー":
            r = out[-1] if out else ""
            i += 1
        else:
            r = _ROMA.get(c, c)
            i += 1
        if sokuon and r:
            r = ("t" if r.startswith("ch") else r[0]) + r
            sokuon = False
        out += r
    return out


# ---------------------------------------------------------------- kana
def pron_for(ro, given):
    if given:
        return given
    if len(ro) == 1:
        return VOWEL_SOUND[ro]
    return f"{ro[:-1]} + {VOWEL_SOUND[ro[-1]]}"


YOON_PRON = {
    "kya": '"kyah", one beat', "kyu": 'like "cute"', "kyo": 'like "Kyoto"', "gya": '"gyah", one beat',
    "gyu": 'like the "gu" in "argue"', "gyo": 'like "gyoza"', "sha": 'like "shah"', "shu": 'like "shoe"',
    "sho": 'like "show"', "ja": 'like "jar"', "ju": 'like "June"', "jo": 'like "jog"', "cha": 'like "chop"',
    "chu": 'like "chew"', "cho": 'like "chore"', "nya": '"nyah", like a cat', "nyu": 'like "new"',
    "nyo": '"nyoh", one beat', "hya": '"hyah", one beat', "hyu": 'like "hue"', "hyo": '"hyoh", one beat',
    "bya": '"byah", one beat', "byu": 'like the "bu" in "bureau"', "byo": '"byoh", one beat',
    "pya": '"pyah", one beat', "pyu": 'like "pew"', "pyo": '"pyoh", one beat', "mya": '"myah", one beat',
    "myu": 'like the "mu" in "music"', "myo": '"myoh", one beat', "rya": '"ryah", light tongue tap',
    "ryu": '"ryoo", light tongue tap', "ryo": '"ryoh", light tongue tap',
}


def build_kana():
    cards = []
    for script, table in (("hiragana", HIRAGANA), ("katakana", KATAKANA)):
        conv = (lambda s: s) if script == "hiragana" else to_kata
        p = script[0]
        rows = {}
        for ch, ro, pr, mn, pic in table:
            rows[ch] = (ch, ro, pr, mn, pic)
            cards.append(dict(id=f"{p}-{ch}", deck=script, group="basic", ch=ch, romaji=ro,
                              pron=pron_for(ro, pr), mnem=mn, pic=pic))
        for src, mark in ((DAKUTEN, "゛"), (HANDAKUTEN, "゜")):
            for base, (v, ro) in src.items():
                b, vv = conv(base), conv(v)
                row = rows[b]
                if v in ("ぢ", "づ"):
                    pr = f"same sound as {conv('じ') if v == 'ぢ' else conv('ず')} ({ro}); rarely used"
                else:
                    pr = f"{CONSONANT_NOTE[ro[0]]} + {VOWEL_SOUND[ro[-1]]}"
                how = "two little marks (ten-ten) voice the sound" if mark == "゛" else \
                    "a little circle (maru) turns h into p"
                scene = row[3][0].lower() + row[3][1:]
                mn = f"{b} ({row[1]}) + {how}: {vv} = {ro}. Picture the same scene as {b}: {scene}"
                cards.append(dict(id=f"{p}-{vv}", deck=script, group="dakuten" if mark == "゛" else "handakuten",
                                  ch=vv, romaji=ro, pron=pr, mnem=mn,
                                  pic=row[4] + ("〃" if mark == "゛" else "⭕")))
        pics = {k: r[4] for k, r in rows.items()}
        names = {k: r[1] for k, r in rows.items()}
        for base, (v, ro) in list(DAKUTEN.items()) + list(HANDAKUTEN.items()):
            pics[conv(v)] = pics[conv(base)]
            names[conv(v)] = ro
        for b in YOON_BASES:
            bb = conv(b)
            for small, vowel in YOON_SMALL:
                ss = conv(small)
                ch = bb + ss
                ro = romaji(b + small)
                pic = pics[bb] + {"a": "🐂", "u": "👉", "o": "🪀"}[vowel]
                mn = (f"{bb} ({names[bb]}) + a small {ss} (y{vowel}) squeeze into ONE beat: {ch} = {ro}. "
                      f"Say \"{names[bb]}-y{vowel}\" faster and faster until it blends.")
                cards.append(dict(id=f"{p}-{ch}", deck=script, group="yoon", ch=ch, romaji=ro,
                                  pron=f"{ro}: {YOON_PRON.get(ro, 'one beat')}", mnem=mn, pic=pic))
    return cards


# ---------------------------------------------------------------- emoji
STOP = {"to", "a", "an", "the", "of", "be", "in", "on", "for", "and", "or", "with", "one's", "oneself",
        "something", "someone", "radical", "no", "counter", "kana", "kanji", "variant", "used", "phonetic",
        "very", "make", "do", "get", "go", "give", "take", "put", "have", "become", "thing", "things",
        "sort", "kind", "type", "part", "suffix", "prefix", "honorific", "particle", "used", "etc"}
BAD_WORDS = {"face", "symbol", "sign", "button", "japanese", "flag", "mark", "square", "other",
             "with", "and", "of", "the", "person", "man", "woman", "light", "medium", "dark", "skin", "tone"}

MANUAL_EMOJI = {
    "sun": "☀️", "day": "📆", "moon": "🌙", "month": "🗓️", "fire": "🔥", "water": "💧", "tree": "🌳",
    "gold": "🪙", "money": "💰", "earth": "🌍", "soil": "🟫", "ground": "🟫", "person": "🧍",
    "people": "👥", "mouth": "👄", "eye": "👁️", "ear": "👂", "hand": "✋", "foot": "🦶", "leg": "🦵",
    "heart": "❤️", "mind": "🧠", "big": "🐘", "small": "🐜", "up": "⬆️", "down": "⬇️", "below": "⬇️",
    "above": "⬆️", "left": "⬅️", "right": "➡️", "middle": "🎯", "inside": "📥", "outside": "🏕️",
    "white": "⚪", "black": "⚫", "red": "🔴", "blue": "🔵", "green": "🟢", "yellow": "🟡",
    "power": "💪", "strength": "💪", "rain": "🌧️", "snow": "❄️", "wind": "🌬️", "cloud": "☁️",
    "mountain": "⛰️", "river": "🏞️", "sea": "🌊", "ocean": "🌊", "stone": "🪨", "rock": "🪨",
    "field": "🌾", "rice": "🍚", "rice field": "🌾", "grass": "🌿", "flower": "🌸", "bamboo": "🎋",
    "dog": "🐕", "cat": "🐈", "cow": "🐄", "horse": "🐎", "bird": "🐦", "fish": "🐟", "insect": "🐛",
    "bug": "🐛", "shell": "🐚", "king": "🤴", "woman": "👩", "man": "👨", "child": "🧒", "mother": "👩",
    "father": "👨", "friend": "🤝", "say": "💬", "word": "💬", "words": "💬", "speak": "🗣️",
    "talk": "🗣️", "language": "🗨️", "see": "👀", "look": "👀", "eat": "🍽️", "food": "🍱",
    "drink": "🥤", "walk": "🚶", "run": "🏃", "stop": "🛑", "car": "🚗", "vehicle": "🚗",
    "gate": "⛩️", "door": "🚪", "house": "🏠", "home": "🏠", "roof": "🏠", "building": "🏢",
    "shop": "🏪", "store": "🏪", "school": "🏫", "study": "📚", "learn": "📚", "book": "📖",
    "write": "✍️", "letter": "✉️", "time": "⏰", "year": "📅", "week": "📅", "hour": "🕐",
    "minute": "⏱️", "now": "⏳", "before": "⏪", "after": "⏩", "noon": "🕛", "evening": "🌆",
    "night": "🌙", "morning": "🌅", "spring": "🌸", "summer": "🌞", "autumn": "🍁", "winter": "⛄",
    "north": "🧭", "south": "🧭", "east": "🌅", "west": "🌇", "country": "🗾", "city": "🏙️",
    "town": "🏘️", "road": "🛣️", "way": "🛤️", "electricity": "⚡", "lightning": "⚡", "sky": "🌤️",
    "heaven": "🌤️", "air": "💨", "spirit": "✨", "life": "🌱", "birth": "🍼", "death": "💀",
    "die": "💀", "sickness": "🤒", "ill": "🤒", "illness": "🤒", "medicine": "💊", "doctor": "🩺",
    "body": "🧍", "head": "🗣️", "hair": "💇", "tooth": "🦷", "bone": "🦴", "blood": "🩸",
    "meat": "🥩", "tea": "🍵", "sake": "🍶", "alcohol": "🍶", "salt": "🧂", "sugar": "🍬",
    "sword": "🗡️", "knife": "🔪", "blade": "🔪", "bow": "🏹", "arrow": "🏹", "spear": "🔱",
    "ship": "🚢", "boat": "⛵", "thread": "🧵", "silk": "🧵", "cloth": "🧶", "clothes": "👕",
    "clothing": "👕", "jewel": "💎", "ball": "⚽", "jade": "💎", "net": "🥅", "box": "📦",
    "pig": "🐖", "sheep": "🐑", "ox": "🐂", "tiger": "🐅", "dragon": "🐉", "snake": "🐍",
    "deer": "🦌", "bear": "🐻", "monkey": "🐒", "rabbit": "🐇", "rat": "🐀", "mouse": "🐁",
    "chicken": "🐔", "turtle": "🐢", "tortoise": "🐢", "wing": "🪽", "feather": "🪶", "egg": "🥚",
    "bean": "🫘", "wheat": "🌾", "grain": "🌾", "seed": "🌱", "leaf": "🍃", "forest": "🌲",
    "grove": "🌲", "woods": "🌲", "pine": "🌲", "cherry": "🌸", "plum": "🍑", "peach": "🍑",
    "fruit": "🍎", "vegetable": "🥬", "oil": "🛢️", "iron": "⚙️", "silver": "🥈", "copper": "🥉",
    "metal": "🔩", "steel": "🔩", "wood": "🪵", "paper": "📄", "picture": "🖼️", "music": "🎵",
    "song": "🎶", "sing": "🎤", "sound": "🔊", "voice": "🗣️", "color": "🎨", "light": "💡",
    "bright": "💡", "dark": "🌑", "shadow": "👤", "star": "⭐", "world": "🌏", "island": "🏝️",
    "bridge": "🌉", "temple": "🛕", "shrine": "⛩️", "god": "⛩️", "buddha": "🛕", "prayer": "🙏",
    "pray": "🙏", "love": "❤️", "like": "👍", "good": "👍", "bad": "👎", "happy": "😊",
    "sad": "😢", "cry": "😢", "laugh": "😂", "anger": "😠", "angry": "😠", "fear": "😨",
    "fight": "🥊", "war": "⚔️", "army": "🪖", "soldier": "🪖", "battle": "⚔️", "win": "🏆",
    "victory": "🏆", "lose": "🏳️", "defeat": "🏳️", "law": "⚖️", "rule": "📏", "number": "🔢",
    "count": "🔢", "calculate": "🧮", "measure": "📏", "long": "📏", "short": "✂️", "cut": "✂️",
    "open": "🔓", "close": "🔒", "shut": "🔒", "enter": "🚪", "exit": "🚪", "leave": "👋",
    "come": "👋", "return": "↩️", "send": "📤", "receive": "📥", "buy": "🛒", "sell": "🏷️",
    "pay": "💳", "work": "💼", "rest": "😌", "sleep": "😴", "dream": "💭", "think": "🤔",
    "know": "💡", "question": "❓", "answer": "💬", "new": "🆕", "old": "👴", "young": "🧒",
    "high": "🔝", "tall": "🦒", "expensive": "💎", "cheap": "🪙", "low": "⬇️", "far": "🔭",
    "near": "📍", "fast": "⚡", "quick": "⚡", "slow": "🐢", "early": "🌅", "late": "🕰️",
    "hot": "🥵", "cold": "🥶", "warm": "☀️", "cool": "😎", "heavy": "🏋️",
    "strong": "💪", "weak": "🥀", "many": "🔢", "few": "🤏", "full": "🈵", "empty": "🫙",
    "same": "🟰", "different": "↔️", "beautiful": "🌸", "clean": "🧼", "wash": "🧼",
    "travel": "🧳", "trip": "🧳", "journey": "🧳", "station": "🚉", "train": "🚆",
    "festival": "🎎", "play": "🎲", "game": "🎲", "sport": "⚽", "dance": "💃",
    "art": "🎨", "pen": "🖊️", "brush": "🖌️", "mirror": "🪞", "bell": "🔔", "drum": "🥁",
    "flag": "🚩", "crown": "👑", "lord": "🤴", "master": "🧙", "prison": "⛓️", "crime": "🚔",
    "punishment": "⚖️", "police": "👮", "guard": "💂", "protect": "🛡️", "defend": "🛡️",
    "attack": "⚔️", "shoot": "🎯", "fly": "🕊️", "swim": "🏊", "climb": "🧗", "fall": "🍂",
    "rise": "📈", "increase": "📈", "decrease": "📉", "change": "🔄", "turn": "🔄", "circle": "⭕",
    "round": "⭕", "square": "⬜", "corner": "📐", "line": "➖", "point": "📍", "dot": "⚫",
    "hole": "🕳️", "cave": "🕳️", "valley": "🏞️", "hill": "⛰️", "lake": "🏞️", "pond": "🏞️",
    "well": "⛲", "harbor": "⚓", "port": "⚓", "ice": "🧊", "steam": "♨️", "smoke": "💨",
    "ash": "🌫️", "dust": "🌫️", "sand": "🏖️", "beach": "🏖️", "shore": "🏖️", "coast": "🏖️",
    "village": "🏘️", "farm": "🚜", "ward": "🏙️", "prefecture": "🗾", "capital": "🏯",
    "castle": "🏯", "palace": "🏯", "tower": "🗼", "wall": "🧱", "fence": "🚧", "garden": "🪴",
    "room": "🛋️", "hall": "🏛️", "office": "🏢", "company": "🏢", "bank": "🏦", "hospital": "🏥",
    "machine": "⚙️", "tool": "🛠️", "weapon": "🗡️", "gun": "🔫", "bomb": "💣", "explode": "💥",
    "burn": "🔥", "wave": "🌊", "flow": "🌊", "stream": "🏞️", "grow": "🌱", "plant": "🪴",
    "root": "🌱", "branch": "🌿", "trunk": "🪵", "nest": "🪺", "pull": "🫳", "push": "🫸",
    "hit": "👊", "strike": "👊", "throw": "🤾", "catch": "🧤", "hold": "🤲", "carry": "📦",
    "lift": "🏋️", "wear": "👕", "shoe": "👞", "hat": "🎩", "skin": "🖐️", "nose": "👃",
    "neck": "🦒", "back": "🔙", "belly": "🫃", "stomach": "🫃", "chest": "🫁", "lung": "🫁",
    "arm": "💪", "finger": "☝️", "nail": "💅", "tongue": "👅", "lip": "👄", "breath": "😮‍💨",
    "sweat": "😅", "tears": "😢", "smile": "😊", "cheek": "😊", "chin": "🧔", "beard": "🧔",
    "tail": "🐕", "horn": "🦏", "claw": "🦅", "frog": "🐸", "crab": "🦀", "whale": "🐋",
    "shark": "🦈", "wolf": "🐺", "fox": "🦊", "lion": "🦁", "elephant": "🐘", "goat": "🐐",
    "duck": "🦆", "eagle": "🦅", "owl": "🦉", "crane": "🕊️", "pigeon": "🕊️", "bee": "🐝",
    "ant": "🐜", "spider": "🕷️", "snail": "🐌", "mosquito": "🦟", "worm": "🪱",
    "drop": "💧", "slash": "✏️", "stick": "🥢", "hook": "🪝", "lid": "🫕", "cover": "🫕", "nose": "👃",
    "one": "1️⃣", "two": "2️⃣", "three": "3️⃣", "four": "4️⃣", "five": "5️⃣", "six": "6️⃣",
    "seven": "7️⃣", "eight": "8️⃣", "nine": "9️⃣", "ten": "🔟", "hundred": "💯",
}


def build_emoji_index(emoji_path):
    data = json.load(open(emoji_path, encoding="utf-8"))
    best = {}
    for rank, (emo, kws) in enumerate(data.items()):
        if not kws:
            continue
        name = kws[0]
        if "flag" in name:
            continue
        parts = name.split("_")
        cands = {k.lower(): 1 for k in kws[1:]}
        for p in parts:
            if p not in BAD_WORDS:
                cands[p] = max(cands.get(p, 0), 2)
        cands[name.replace("_", " ")] = 4
        for w, score in cands.items():
            key = (score, -rank)
            if w not in best or key > best[w][0]:
                best[w] = (key, emo)
    return ({w: e for w, (k, e) in best.items()},
            {w: e for w, (k, e) in best.items() if k[0] >= 2})


def lookup(word, idx, strong=False):
    idx = idx[1] if strong else idx[0]
    w = re.sub(r"\(.*?\)", "", word.lower()).strip()
    w = re.sub(r"^(to|a|an|the) ", "", w)
    variants = [w]
    if w.endswith("ies"):
        variants.append(w[:-3] + "y")
    if w.endswith("es"):
        variants.append(w[:-2])
    if w.endswith("s"):
        variants.append(w[:-1])
    if w.endswith("ing"):
        variants += [w[:-3], w[:-3] + "e"]
    if w.endswith("ed"):
        variants += [w[:-2], w[:-1]]
    for v in variants:
        if v in MANUAL_EMOJI:
            return MANUAL_EMOJI[v]
    for v in variants:
        if v in idx and v not in STOP and len(v) > 2:
            return idx[v]
    return None


def emoji_for_meanings(meanings, idx, strong=False):
    for m in meanings:
        e = lookup(m, idx, strong)
        if e:
            return e
    for m in meanings:
        for word in re.findall(r"[a-zA-Z']+", m):
            if word.lower() in STOP or len(word) < 3:
                continue
            e = lookup(word, idx, strong)
            if e:
                return e
    return None


# ---------------------------------------------------------------- kanji
def clean_meanings(v):
    out = [m for m in v["meanings"] if not (re.search(r"radical", m, re.I) and "(no." in m)]
    return out or v["meanings"]


def keyword(v):
    ms = clean_meanings(v)
    return ms[0] if ms else "?"


def comp_name(c, data):
    if c in RADICAL_NAMES:
        return RADICAL_NAMES[c]
    v = data.get(c)
    if v:
        ms = [m for m in v["meanings"] if "radical" not in m.lower()]
        if ms:
            n = re.sub(r"^(a|an|the) ", "", ms[0].lower())
            return "I" if n == "i" else n
    return None


def article(word):
    return "an" if word[:1].lower() in "aeiou" else "a"


def gen_story(ch, kw, comps, seed):
    """comps: list of (char, english_name)."""
    KW = kw.upper()
    if not comps:
        return f"A picture in its own right: let the shape of {ch} itself remind you of {KW}."
    if len(comps) == 1:
        c, n = comps[0]
        if n == kw.lower():
            return f"{ch} is built around {c} ({n.upper()}), so the shape already shows {KW}."
        t = [f"Built on {c} ({n.upper()}). Picture the {n} turning into {KW}.",
             f"Spot the {c} ({n.upper()}) inside. Imagine that {n} slowly becoming {KW}.",
             f"Start from {c} ({n.upper()}) and add a few strokes: now it means {KW}."]
        return t[seed % 3]
    names = [n for _, n in comps]
    plus = " + ".join(f"{c} {n.upper()}" for c, n in comps)
    lst = ", ".join(f"{c} ({n})" for c, n in comps)
    t = [f"{plus} = {KW}. Put " + " and ".join(f"the {n}" for n in names) +
         f" into one scene, and let that scene mean {kw.lower()}.",
         f"Made of {lst}. Story: the {names[0].upper()} meets the {names[1].upper()}, and the result is {KW}.",
         f"Look for {lst}. Tie them together: " + " + ".join(names) + f" \u2192 {KW}."]
    return t[seed % 3]


def hook_for(on_kata, kw):
    if not on_kata:
        return ""
    r = romaji(on_kata.replace("-", ""))
    h = HOOKS.get(r)
    if not h:
        return f"ON reading {on_kata} ({r})."
    return f"ON reading {on_kata} ({r}) sounds like \"{h}\": say \"{h}… {kw}!\" as you picture it."


def kun_hook(kun_list):
    if not kun_list:
        return ""
    k = kun_list[0].replace("-", "")
    stem, _, oku = k.partition(".")
    return f"KUN reading {stem}{('(' + oku + ')') if oku else ''} = {romaji(stem + oku)}."


def build_kanji(kanji_path, idx, kvg_dir):
    data = json.load(open(kanji_path, encoding="utf-8"))
    cards, misses = [], 0
    for ch, v in data.items():
        lvl = v.get("jlpt_new")
        if not lvl:
            continue
        kw = keyword(v)
        meanings = clean_meanings(v)
        comps = []
        for c in components(f"{kvg_dir}/{ord(ch):05x}.svg"):
            n = comp_name(c, data)
            if n and not c.startswith("CDP"):
                comps.append((c, n))
        on = [to_kata(r) for r in v.get("readings_on") or []]
        kun = v.get("readings_kun") or []
        comp_pics = [lookup(n, idx) or "" for _, n in comps]
        seed = zlib.crc32(ch.encode())
        if ch in KANJI_HAND:
            mnem, pic = KANJI_HAND[ch]
        else:
            mnem = gen_story(ch, kw, comps, seed)
            pic = (emoji_for_meanings([kw] + meanings, idx, strong=True) or
                   emoji_for_meanings([kw] + meanings, idx) or next((p for p in comp_pics if p), None))
            if not pic:
                misses += 1
                pic = "📜"
        cards.append(dict(
            id=f"k-{ch}", deck=f"n{lvl}", ch=ch, kw=kw, meanings=meanings, on=on, kun=kun,
            strokes=v.get("strokes"), grade=v.get("grade"), freq=v.get("freq"),
            comps=[[c, n, p] for (c, n), p in zip(comps, comp_pics)], mnem=mnem,
            hook=" ".join(x for x in (hook_for(on[0] if on else "", kw), kun_hook(kun)) if x),
            pic=pic))
    cards.sort(key=lambda c: (-int(c["deck"][1]), c["freq"] or 9999))
    return cards, misses


def main():
    kanji_path, emoji_path, kvg_dir, out = sys.argv[1:5]
    idx = build_emoji_index(emoji_path)
    kana = build_kana()
    kanji, misses = build_kanji(kanji_path, idx, kvg_dir)
    with open(f"{out}/kana.js", "w", encoding="utf-8") as f:
        f.write("window.KANA_DATA=" + json.dumps(kana, ensure_ascii=False, separators=(",", ":")) + ";\n")
    with open(f"{out}/kanji.js", "w", encoding="utf-8") as f:
        f.write("window.KANJI_DATA=" + json.dumps(kanji, ensure_ascii=False, separators=(",", ":")) + ";\n")
    sugg = dict(idx[1])
    sugg.update(MANUAL_EMOJI)
    sugg = {k: v for k, v in sugg.items() if re.fullmatch(r"[a-z][a-z ]{1,20}", k)}
    with open(f"{out}/emoji.js", "w", encoding="utf-8") as f:
        f.write("window.EMOJI_INDEX=" + json.dumps(sugg, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"kana {len(kana)}  kanji {len(kanji)}  kanji with fallback picture {misses}")


if __name__ == "__main__":
    main()
