import ssbLogoRaster from '../assets/images/ssb_restaurant_logo_1788429393965.jpg';

/**
 * Sri Saravana Bhavan (SSB) Restaurant Vector SVG Logo
 * Matches the official circular crest with golden double ring, wheat sheaf laurel branches,
 * interlocking SSB monogram (silver S, gold S, silver B), and arched 'SRI SARAVANA BHAVAN' lettering.
 * Encoded as a zero-latency data URI for high-contrast thermal receipt printing.
 */
export const SRI_SARAVANA_BHAVAN_VECTOR_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300"><defs><path id="arcText" d="M 45,195 A 120,120 0 0,0 255,195" fill="none"/><linearGradient id="ssbGold" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23E5C158"/><stop offset="50%" stop-color="%23C59B27"/><stop offset="100%" stop-color="%239A7718"/></linearGradient><linearGradient id="ssbSilver" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23C0C0C0"/><stop offset="50%" stop-color="%238E8E93"/><stop offset="100%" stop-color="%2368686C"/></linearGradient></defs><circle cx="150" cy="150" r="142" fill="none" stroke="url(%23ssbGold)" stroke-width="3"/><circle cx="150" cy="150" r="136" fill="none" stroke="url(%23ssbGold)" stroke-width="1.5"/><g stroke="url(%23ssbGold)" fill="url(%23ssbGold)"><path d="M 42,185 C 28,150 32,95 62,60" fill="none" stroke-width="2.5" stroke-linecap="round"/><path d="M 43,180 C 35,175 32,165 38,160 C 44,165 46,174 43,180 Z"/><path d="M 48,165 C 56,168 58,158 52,152 C 46,155 45,162 48,165 Z"/><path d="M 37,155 C 28,148 27,138 34,134 C 40,138 41,148 37,155 Z"/><path d="M 43,140 C 52,142 54,132 47,127 C 41,130 40,137 43,140 Z"/><path d="M 36,128 C 28,120 28,110 36,107 C 42,111 41,120 36,128 Z"/><path d="M 43,114 C 52,115 54,105 47,100 C 41,104 40,110 43,114 Z"/><path d="M 40,100 C 33,92 35,82 43,80 C 48,85 47,94 40,100 Z"/><path d="M 48,86 C 58,86 60,76 53,72 C 47,75 46,82 48,86 Z"/><path d="M 48,74 C 44,65 48,56 56,56 C 60,62 57,70 48,74 Z"/><path d="M 60,62 C 68,60 70,51 63,48 C 58,51 58,58 60,62 Z"/></g><g stroke="url(%23ssbGold)" fill="url(%23ssbGold)"><path d="M 258,185 C 272,150 268,95 238,60" fill="none" stroke-width="2.5" stroke-linecap="round"/><path d="M 257,180 C 265,175 268,165 262,160 C 256,165 254,174 257,180 Z"/><path d="M 252,165 C 244,168 242,158 248,152 C 254,155 255,162 252,165 Z"/><path d="M 263,155 C 272,148 273,138 266,134 C 260,138 259,148 263,155 Z"/><path d="M 257,140 C 248,142 246,132 253,127 C 259,130 260,137 257,140 Z"/><path d="M 264,128 C 272,120 272,110 264,107 C 258,111 259,120 264,128 Z"/><path d="M 257,114 C 248,115 246,105 253,100 C 259,104 260,110 257,114 Z"/><path d="M 260,100 C 267,92 265,82 257,80 C 252,85 253,94 260,100 Z"/><path d="M 252,86 C 242,86 240,76 247,72 C 253,75 254,82 252,86 Z"/><path d="M 252,74 C 256,65 252,56 244,56 C 240,62 243,70 252,74 Z"/><path d="M 240,62 C 232,60 230,51 237,48 C 242,51 242,58 240,62 Z"/></g><path d="M 130,95 C 118,90 92,90 85,108 C 80,120 86,133 98,140 L 114,148 C 126,155 132,166 128,180 C 122,198 98,202 82,190 C 76,185 73,178 72,172" fill="none" stroke="url(%23ssbSilver)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/><path d="M 166,96 L 166,196 M 166,96 C 188,96 216,102 216,124 C 216,140 196,146 172,146 M 166,146 C 196,146 222,154 222,174 C 222,196 190,196 166,196" fill="none" stroke="url(%23ssbSilver)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/><path d="M 162,94 C 148,87 122,88 114,106 C 108,120 114,134 128,142 L 144,150 C 158,158 166,170 160,185 C 153,204 125,206 106,193 C 99,188 95,180 94,172" fill="none" stroke="url(%23ssbGold)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><text font-family="sans-serif, monospace" font-size="14.5" font-weight="900" letter-spacing="3" fill="%2368686C"><textPath href="%23arcText" startOffset="50%" text-anchor="middle">SRI SARAVANA BHAVAN</textPath></text></svg>`;

/**
 * Default logo reference for the entire application (Bill print, Thermal preview, App Header, Settings)
 */
export const DEFAULT_RESTAURANT_LOGO = ssbLogoRaster;
export const SRI_SARAVANA_BHAVAN_LOGO = ssbLogoRaster;

export const SRI_SARAVANA_BHAVAN_PRESET = {
  id: 'sri_saravana_bhavan',
  name: 'Sri Saravana Bhavan (SSB)',
  subtitle: 'Official Golden Crest Logo',
  dataUrl: ssbLogoRaster,
  vectorUrl: SRI_SARAVANA_BHAVAN_VECTOR_LOGO
};
