import tvCompat from "./postcss/tv-compat.mjs";

const TV_BROWSERS = "chrome >= 53, safari >= 11";

const config = {
  plugins: [
    "@tailwindcss/postcss",
    ["@csstools/postcss-oklab-function", { preserve: false }],
    tvCompat,
    ["@csstools/postcss-color-mix-function", { preserve: false }],
    "postcss-flexbugs-fixes",
    [
      "postcss-preset-env",
      {
        browsers: TV_BROWSERS,
        autoprefixer: {
          flexbox: "no-2009",
        },
        stage: 2,
        features: {
          "cascade-layers": false,
          "custom-properties": false,
          "oklab-function": false,
          "color-mix": false,
          "color-function": { preserve: false },
          "relative-color-syntax": { preserve: false },
          "hexadecimal-alpha-notation": { preserve: false },
          "media-query-ranges": true,
          "is-pseudo-class": { preserve: false },
          "nesting-rules": { noIsPseudoSelector: true },
          // Keep logical properties. Converting them assumes LTR and breaks dir=rtl.
          "logical-properties-and-values": false,
          "logical-viewport-units": false,
          "float-clear-logical-values": false,
          "logical-resize": false,
          "logical-overflow": false,
        },
      },
    ],
  ],
};

export default config;
