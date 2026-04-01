// src/gradientPresets.ts

export interface GradientPreset {
	id: number;
	colors: [string, string, string, string];
	// Seed positions as [x%, y%] — controls where each color blob is anchored.
	// Varying these per-preset creates the organic, flowing mesh shapes.
	positions: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Renders a gradient preset as a CSS `background` string.
 * Four radial blobs at unique seed positions blend into a mesh gradient.
 * The first color also fills the base to prevent transparent gaps.
 *
 * Color selection rules followed:
 * - All 4 colors in the same lightness band (no mixing dark anchors with light accents)
 * - At least one warm/cool hue crossing per palette
 * - 60-120° total hue arc minimum — no monochromatic palettes
 * - Varied saturation: dominant at 85%, secondary 70%, accent 60%
 * - "Unexpected" fourth color per palette for the memorable tension point
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	const [p1, p2, p3, p4] = preset.positions;
	return [
		`radial-gradient(circle at ${p1[0]}% ${p1[1]}%, ${c1} 0%, transparent 62%)`,
		`radial-gradient(circle at ${p2[0]}% ${p2[1]}%, ${c2} 0%, transparent 57%)`,
		`radial-gradient(circle at ${p3[0]}% ${p3[1]}%, ${c3} 0%, transparent 65%)`,
		`radial-gradient(circle at ${p4[0]}% ${p4[1]}%, ${c4} 0%, transparent 52%)`,
		c1, // solid base — prevents transparency gaps
	].join(", ");
}

/**
 * Returns the first color of a preset — used as the agent's primary accent
 * (name badges, @mention chips, message card avatars).
 */
export function primaryColor(preset: GradientPreset): string {
	return preset.colors[0];
}

// 20 curated presets — indices 0–3 align with default agent identities.
// Colors are all Tailwind-600-equivalent vibrancy (L:44–50 HSL, S:75–90%).
// Each palette has warm/cool crossing and one "unexpected" fourth color.
export const GRADIENT_PRESETS: GradientPreset[] = [
	// 0 · Cobalt Surge — Edge (blue + violet + hot pink + amber)
	// Warm/cool: blue+violet vs pink+amber. Unexpected: amber against the blue family.
	// Emergent: blue×violet→indigo, violet×pink→magenta.
	{
		id: 0,
		colors: ["#2563EB", "#7C3AED", "#DB2777", "#D97706"],
		positions: [[15, 25], [75, 15], [80, 75], [20, 80]],
	},
	// 1 · Terra Flare — Loom (orange + rose + cobalt + emerald)
	// Warm dominant with two cool surprises. Emergent: orange×rose→coral, blue×green→teal.
	{
		id: 1,
		colors: ["#EA580C", "#E11D48", "#2563EB", "#16A34A"],
		positions: [[20, 75], [75, 20], [85, 80], [10, 15]],
	},
	// 2 · Ember Violet — Ember (purple + fuchsia + ocean + gold)
	// Split-complementary: purple + fuchsia, then cyan + gold as pivot. Unexpected: gold.
	{
		id: 2,
		colors: ["#9333EA", "#C026D3", "#0891B2", "#CA8A04"],
		positions: [[5, 35], [80, 10], [60, 80], [30, 70]],
	},
	// 3 · Canopy — Quill (teal + green + rose + sky)
	// Botanical analogous (teal+green), rose as warm tension, sky as unexpected coolness.
	{
		id: 3,
		colors: ["#0D9488", "#16A34A", "#E11D48", "#0284C7"],
		positions: [[20, 20], [75, 35], [85, 85], [10, 75]],
	},
	// 4 · Inferno — red + orange + indigo + cyan
	// Fire dominant, then indigo+cyan as the cold surprise. Diagonal contrast max.
	{
		id: 4,
		colors: ["#DC2626", "#EA580C", "#4F46E5", "#0891B2"],
		positions: [[85, 85], [20, 75], [10, 10], [80, 15]],
	},
	// 5 · Cold Front — sky + blue + violet + amber
	// Cool analogous trio, amber as the unexpected warmth. Classic "space" look.
	{
		id: 5,
		colors: ["#0284C7", "#2563EB", "#7C3AED", "#D97706"],
		positions: [[5, 5], [80, 30], [30, 85], [85, 80]],
	},
	// 6 · Wildflower — fuchsia + pink + green + cobalt
	// Vivid warm+cool crossing. Green is the unexpected note against the pink/fuchsia duo.
	{
		id: 6,
		colors: ["#C026D3", "#DB2777", "#16A34A", "#2563EB"],
		positions: [[70, 20], [15, 70], [80, 75], [30, 15]],
	},
	// 7 · Solaris — orange + gold + violet + teal
	// Warm pair (orange+gold) vs cool pair (violet+teal). Classic split-complementary.
	{
		id: 7,
		colors: ["#EA580C", "#CA8A04", "#9333EA", "#0D9488"],
		positions: [[80, 80], [20, 15], [60, 40], [10, 85]],
	},
	// 8 · Cascade — blue + cyan + rose + amber
	// Aquatic duo (blue+cyan), rose for warmth, amber as the golden anchor.
	{
		id: 8,
		colors: ["#2563EB", "#0891B2", "#E11D48", "#D97706"],
		positions: [[50, 10], [85, 60], [25, 85], [10, 30]],
	},
	// 9 · Phantom — violet + cobalt + fuchsia + teal
	// Rich jewel tones. All within 120° arc. Unexpected: teal as the "exhale."
	{
		id: 9,
		colors: ["#7C3AED", "#2563EB", "#C026D3", "#0D9488"],
		positions: [[80, 20], [10, 80], [85, 75], [20, 15]],
	},
	// 10 · Helix — sky + fuchsia + amber + indigo
	// Four-way tension. Indigo+sky cool frame, fuchsia+amber warm explosions.
	{
		id: 10,
		colors: ["#0284C7", "#C026D3", "#D97706", "#4F46E5"],
		positions: [[20, 15], [80, 20], [75, 80], [15, 80]],
	},
	// 11 · Citrus Circuit — orange + lime-green + violet + sky
	// Complementary: orange vs blue-violet. Green as unexpected organic note.
	{
		id: 11,
		colors: ["#EA580C", "#65A30D", "#9333EA", "#0284C7"],
		positions: [[5, 5], [85, 80], [80, 15], [10, 75]],
	},
	// 12 · Coral Reef — rose + teal + violet + gold
	// Triadic warm pivot. Rose+teal are far-split, violet bridges, gold anchors warmth.
	{
		id: 12,
		colors: ["#E11D48", "#0D9488", "#7C3AED", "#D97706"],
		positions: [[75, 25], [20, 75], [80, 80], [15, 15]],
	},
	// 13 · Arctic Bloom — cyan + pink + indigo + green
	// Ice-cool (cyan+indigo) meets hot-bloom (pink+green). Wide arc, bridged by blue.
	{
		id: 13,
		colors: ["#0891B2", "#DB2777", "#4F46E5", "#16A34A"],
		positions: [[20, 80], [80, 80], [15, 20], [75, 15]],
	},
	// 14 · Amber Storm — gold + red + violet + ocean
	// Warm anchor (gold+red), violet as the pivot, ocean as the cold exhale.
	{
		id: 14,
		colors: ["#D97706", "#DC2626", "#7C3AED", "#0891B2"],
		positions: [[10, 10], [85, 25], [65, 85], [15, 65]],
	},
	// 15 · Spectrum — green + cobalt + fuchsia + orange
	// Near-tetradic but anchored by analogous cool pair (green+blue). Orange is the warmth.
	{
		id: 15,
		colors: ["#16A34A", "#2563EB", "#C026D3", "#EA580C"],
		positions: [[85, 15], [15, 85], [80, 80], [20, 15]],
	},
	// 16 · Nebula — indigo + rose + teal + amber
	// Cool trio (indigo+teal) framing warm pair (rose+amber). Emergent: rose×indigo→crimson.
	{
		id: 16,
		colors: ["#4F46E5", "#E11D48", "#0D9488", "#D97706"],
		positions: [[50, 50], [10, 10], [85, 25], [75, 85]],
	},
	// 17 · Ultrawave — violet + ocean + orange + hot pink
	// Electric intensity. Violet+ocean cool foundation, orange+pink vivid warm burst.
	{
		id: 17,
		colors: ["#9333EA", "#0891B2", "#EA580C", "#DB2777"],
		positions: [[5, 75], [80, 20], [25, 25], [85, 85]],
	},
	// 18 · Deep Pacific — blue + emerald + rose + gold
	// Ocean (blue+green) meets warmth (rose+gold). Classic complementary with bridging.
	{
		id: 18,
		colors: ["#2563EB", "#16A34A", "#E11D48", "#CA8A04"],
		positions: [[15, 15], [80, 80], [20, 80], [85, 15]],
	},
	// 19 · Dusk — indigo + violet + amber + teal
	// Twilight analogous (indigo+violet), then amber+teal as opposing warmth/cool accents.
	{
		id: 19,
		colors: ["#4F46E5", "#7C3AED", "#D97706", "#0D9488"],
		positions: [[25, 25], [80, 10], [10, 80], [85, 80]],
	},
];
