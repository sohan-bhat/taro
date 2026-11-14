import localFont from 'next/font/local';

// The faces are copies of the Google Fonts files, kept in font-files/ so a
// build never has to fetch them. All four are under the SIL Open Font
// License; the licenses are in font-files/licenses.

// Words a person said aloud. Italic only, the variable font.
export const saidFace = localFont({
  src: './font-files/ysabeau-office-italic.woff2',
  style: 'italic',
  weight: '1 1000',
  variable: '--font-said',
  display: 'swap',
});

// Taro's voice and the site's voice. Upright only, variable 400 to 900.
export const recordFace = localFont({
  src: './font-files/schibsted-grotesk.woff2',
  weight: '400 900',
  variable: '--font-record',
  display: 'swap',
});

export const codeFace = localFont({
  src: './font-files/spline-sans-mono.woff2',
  weight: '400 500',
  variable: '--font-code',
  display: 'swap',
  preload: false,
});

// Only the landing page applies this (Slack mocks).
export const slackFace = localFont({
  src: [
    { path: './font-files/lato-400.woff2', weight: '400' },
    { path: './font-files/lato-700.woff2', weight: '700' },
    { path: './font-files/lato-900.woff2', weight: '900' },
  ],
  variable: '--font-slack',
  display: 'swap',
  preload: false,
});
