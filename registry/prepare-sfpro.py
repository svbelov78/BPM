"""Compress the user-supplied variable SF Pro as WOFF2, without subsetting.

Optional asset preparation only, not a prototype/build runtime dependency.
Requires fonttools[woff]. Run: python3 registry/prepare-sfpro.py /path/to/archive.zip
The archive and unrelated font faces are not copied into the deliverable.
"""
import argparse
import hashlib
import io
from pathlib import Path
import zipfile

from fontTools.ttLib import TTFont


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.archive) as archive:
        candidates = [name for name in archive.namelist()
                      if not name.startswith("__MACOSX/") and Path(name).name == "SF-Pro.ttf"]
        if len(candidates) != 1:
            raise ValueError("Expected exactly one SF-Pro.ttf in the supplied archive")
        source = archive.read(candidates[0])
    font = TTFont(io.BytesIO(source), recalcTimestamp=False)
    if font["name"].getDebugName(1) != "SF Pro" or "fvar" not in font:
        raise ValueError("Expected the original variable SF Pro font")
    axes = {axis.axisTag: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in font["fvar"].axes}
    if not {"wght", "wdth", "opsz"}.issubset(axes):
        raise ValueError("Missing SF Pro weight, width or optical-size axis")
    cmap = font.getBestCmap()
    if any(ord(char) not in cmap for char in "АБВЁЙабвёйSF Pro0123456789₽"):
        raise ValueError("Missing required Russian/Latin glyphs")
    output = Path(__file__).resolve().parent / "assets/fonts/sf-pro-variable.woff2"
    output.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(output)
    result = TTFont(output)
    if result.getBestCmap() != cmap or len(result.getGlyphOrder()) != len(font.getGlyphOrder()):
        raise ValueError("Compression must preserve all characters and glyphs")
    if [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
        for axis in result["fvar"].axes] != [(axis.axisTag, axis.minValue, axis.defaultValue, axis.maxValue)
                                           for axis in font["fvar"].axes]:
        raise ValueError("Compression must preserve variable axes")
    print(f"Source: {candidates[0]} ({len(source):,} bytes)")
    print(f"Source SHA256: {hashlib.sha256(source).hexdigest()}")
    print(f"Output: {output} ({output.stat().st_size:,} bytes)")
    print(f"Output SHA256: {hashlib.sha256(output.read_bytes()).hexdigest()}")
    print(f"Preserved: {len(cmap):,} characters, {len(font.getGlyphOrder()):,} glyphs, axes {axes}")


if __name__ == "__main__":
    main()
