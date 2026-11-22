"""Extracts the top-level components of each kanji from KanjiVG SVG files."""
import re
import xml.etree.ElementTree as ET

NS = "{http://kanjivg.tagaini.net}"


def components(svg_path):
    root = ET.parse(svg_path).getroot()
    top = None
    for g in root.iter("{http://www.w3.org/2000/svg}g"):
        if g.get("id", "").startswith("kvg:") and g.get(NS + "element"):
            top = g
            break
    if top is None:
        return []
    me = top.get(NS + "element")
    out = []

    def walk(node):
        for ch in node:
            if not ch.tag.endswith("g"):
                continue
            el = ch.get(NS + "element")
            if el and el != me:
                if el not in out:
                    out.append(el)
            else:
                walk(ch)
    walk(top)
    return out
