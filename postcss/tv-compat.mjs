/**
 * Make Tailwind v4 output safe for Smart TV browsers (Tizen, webOS, VIDAA).
 * Those engines often ignore entire @layer blocks and cannot paint oklch/color-mix.
 */

const COLOR_MIX_WITH_VAR =
  /color-mix\(\s*in\s+(?:oklab|oklch|srgb)\s*,\s*var\(\s*(--[\w-]+)(?:\s*,[^)]*)?\s*\)\s+(\d+(?:\.\d+)?)%\s*,\s*transparent\s*\)/gi;

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseCssColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (v === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (v === "white") return { r: 255, g: 255, b: 255, a: 1 };

  const hex = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = /^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, /]\s*([\d.]+)(%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
    v,
  );
  if (rgb) {
    const ch = (num, pct) => (pct ? (Number(num) / 100) * 255 : Number(num));
    let a = 1;
    if (rgb[7] != null) {
      a = rgb[7].endsWith("%") ? Number(rgb[7]) / 100 : Number(rgb[7]);
    }
    return {
      r: ch(rgb[1], rgb[2]),
      g: ch(rgb[3], rgb[4]),
      b: ch(rgb[5], rgb[6]),
      a,
    };
  }

  return null;
}

function toRgba(color, alpha) {
  const a = Math.round(color.a * alpha * 1000) / 1000;
  return `rgba(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)}, ${a})`;
}

function collectColorVars(root) {
  const vars = new Map();
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith("--")) return;
    const color = parseCssColor(decl.value);
    if (color) vars.set(decl.prop, color);
  });
  return vars;
}

function resolveColorMixVars(root) {
  const vars = collectColorVars(root);
  root.walkDecls((decl) => {
    if (!decl.value.includes("color-mix(")) return;
    decl.value = decl.value.replace(COLOR_MIX_WITH_VAR, (match, name, pct) => {
      const color = vars.get(name);
      if (!color) return match;
      return toRgba(color, Number(pct) / 100);
    });
  });
}

function expandInsetShorthand(root) {
  root.walkDecls("inset", (decl) => {
    const parts = decl.value.trim().split(/\s+/);
    let top;
    let right;
    let bottom;
    let left;
    if (parts.length === 1) {
      top = right = bottom = left = parts[0];
    } else if (parts.length === 2) {
      top = bottom = parts[0];
      right = left = parts[1];
    } else if (parts.length === 3) {
      top = parts[0];
      right = left = parts[1];
      bottom = parts[2];
    } else if (parts.length === 4) {
      [top, right, bottom, left] = parts;
    } else {
      return;
    }
    decl.replaceWith(
      decl.clone({ prop: "top", value: top }),
      decl.clone({ prop: "right", value: right }),
      decl.clone({ prop: "bottom", value: bottom }),
      decl.clone({ prop: "left", value: left }),
    );
  });
}

function stripModernGradientInterpolation(root) {
  root.walkDecls((decl) => {
    if (!/\sin\s+ok(?:lab|lch)\b/i.test(decl.value)) return;
    decl.value = decl.value.replace(/\s+in\s+ok(?:lab|lch)\b/gi, "");
  });
}

function unwrapLayers(root) {
  let passes = 0;
  let changed = true;
  while (changed && passes < 8) {
    changed = false;
    passes += 1;
    root.walkAtRules("layer", (atRule) => {
      changed = true;
      if (!atRule.nodes || atRule.nodes.length === 0) {
        atRule.remove();
        return;
      }
      atRule.replaceWith(atRule.nodes);
    });
  }
}

function tvCompat() {
  return {
    postcssPlugin: "postcss-tv-compat",
    OnceExit(root) {
      resolveColorMixVars(root);
      expandInsetShorthand(root);
      stripModernGradientInterpolation(root);
      unwrapLayers(root);
    },
  };
}

tvCompat.postcss = true;

export default tvCompat;
