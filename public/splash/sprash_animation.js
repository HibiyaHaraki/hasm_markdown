/* Color palette license:
MIT License

Copyright (c) 2026 hibiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
"use strict";

(() => {
  const themes = [
  {
    "id": "classic",
    "text": "#f8fafc",
    "background": "#111827",
    "accent": "#3157c8"
  },
  {
    "id": "sunrise",
    "text": "#fff7ed",
    "background": "#1c100d",
    "accent": "#c2410c"
  },
  {
    "id": "forest",
    "text": "#f0fdf4",
    "background": "#0d1b13",
    "accent": "#276749"
  },
  {
    "id": "dawn",
    "text": "#fff7ed",
    "background": "#21130d",
    "accent": "#b45309"
  },
  {
    "id": "copper",
    "text": "#fff7ed",
    "background": "#1f120d",
    "accent": "#c2410c"
  },
  {
    "id": "pine",
    "text": "#f0fdf4",
    "background": "#0b1710",
    "accent": "#166534"
  },
  {
    "id": "ocean",
    "text": "#f0f9ff",
    "background": "#0b1720",
    "accent": "#0369a1"
  },
  {
    "id": "arctic",
    "text": "#ecfeff",
    "background": "#0c1b22",
    "accent": "#0e7490"
  },
  {
    "id": "slate",
    "text": "#f1f5f9",
    "background": "#111827",
    "accent": "#475569"
  },
  {
    "id": "charcoal",
    "text": "#f9fafb",
    "background": "#101214",
    "accent": "#4b5563"
  },
  {
    "id": "coffee",
    "text": "#fff7ed",
    "background": "#1b1511",
    "accent": "#6f4e37"
  },
  {
    "id": "sand",
    "text": "#fffbeb",
    "background": "#21180e",
    "accent": "#92400e"
  },
  {
    "id": "emerald",
    "text": "#ecfdf5",
    "background": "#071d1b",
    "accent": "#0f766e"
  },
  {
    "id": "teal-night",
    "text": "#ccfbf1",
    "background": "#071c1a",
    "accent": "#115e59"
  },
  {
    "id": "midnight",
    "text": "#e2e8f0",
    "background": "#080d18",
    "accent": "#334155"
  },
  {
    "id": "royal",
    "text": "#eef2ff",
    "background": "#0e1027",
    "accent": "#4338ca"
  },
  {
    "id": "high-contrast",
    "text": "#ffffff",
    "background": "#1a1a1a",
    "accent": "#000000"
  },
  {
    "id": "classic-light",
    "text": "#0f172a",
    "background": "#f8fafc",
    "accent": "#3157c8"
  },
  {
    "id": "sunrise-light",
    "text": "#3a1c11",
    "background": "#fff7ed",
    "accent": "#c2410c"
  },
  {
    "id": "forest-light",
    "text": "#12311f",
    "background": "#f0fdf4",
    "accent": "#276749"
  },
  {
    "id": "ocean-light",
    "text": "#082f49",
    "background": "#f0f9ff",
    "accent": "#0369a1"
  },
  {
    "id": "slate-light",
    "text": "#0f172a",
    "background": "#f8fafc",
    "accent": "#475569"
  },
  {
    "id": "royal-light",
    "text": "#111827",
    "background": "#eef2ff",
    "accent": "#4338ca"
  },
  {
    "id": "high-contrast-light",
    "text": "#111827",
    "background": "#ffffff",
    "accent": "#111827"
  }
];
  const intervalMs = 3000;
  const root = document.documentElement;
  const parameters = new URLSearchParams(location.search);
  const themedBackground = parameters.get("background") === "theme";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let current = themes.findIndex((theme) => theme.id === "classic-light");
  let timer;

  function applyTheme() {
    const theme = themes[current];
    root.dataset.theme = theme.id;
    root.style.setProperty("--splash-text", theme.text);
    root.style.setProperty("--splash-accent", theme.accent);
    root.style.setProperty(
      "--splash-background", themedBackground ? theme.background : "transparent"
    );
  }

  function nextTheme() {
    // Sample all other themes with equal probability, avoiding immediate repeats.
    const offset = 1 + Math.floor(Math.random() * (themes.length - 1));
    current = (current + offset) % themes.length;
    applyTheme();
  }

  function updateTimer() {
    clearInterval(timer);
    if (!reducedMotion.matches && !document.hidden) {
      timer = setInterval(nextTheme, intervalMs);
    }
  }

  applyTheme();
  reducedMotion.addEventListener("change", updateTimer);
  document.addEventListener("visibilitychange", updateTimer);
  addEventListener("pagehide", () => clearInterval(timer));
  addEventListener("pageshow", updateTimer);
  updateTimer();
})();
