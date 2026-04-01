// src/gradientPresets.ts

export interface GradientPreset {
	id: number;
	colors: [string, string, string, string];
	// Seed positions as [x%, y%] — each preset has a unique blob layout.
	positions: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Renders a gradient preset as a CSS `background` string.
 * C1 is the solid base fill — it defines the dominant visual identity.
 * C2–C4 are derived companions that create interesting blends over C1.
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	const [p1, p2, p3, p4] = preset.positions;
	return [
		`radial-gradient(circle at ${p1[0]}% ${p1[1]}%, ${c1} 0%, transparent 62%)`,
		`radial-gradient(circle at ${p2[0]}% ${p2[1]}%, ${c2} 0%, transparent 57%)`,
		`radial-gradient(circle at ${p3[0]}% ${p3[1]}%, ${c3} 0%, transparent 65%)`,
		`radial-gradient(circle at ${p4[0]}% ${p4[1]}%, ${c4} 0%, transparent 52%)`,
		c1,
	].join(", ");
}

/**
 * Returns the primary accent color for badges and mention chips.
 */
export function primaryColor(preset: GradientPreset): string {
	return preset.colors[0];
}

// 10 presets — each built from one primary hue with 3 derived companions:
//   C1: primary (dominant identity, solid base fill)
//   C2: analogous (±30–40° — blends smoothly, deepens the field)
//   C3: split-complement (~150° — the dramatic tension color)
//   C4: warm or cool anchor (seals the palette, emergent blend at center)
//
// Indices 0–3 are the default agent identities.
// Each preset has a unique position seed for a distinct blob composition.
export const GRADIENT_PRESETS: GradientPreset[] = [

	// 0 · Cobalt — Edge
	// Primary: deep cobalt blue. C2: indigo (analogous). C3: rose (split-comp ~150° away).
	// C4: amber (warm anchor). Emergent: cobalt×indigo→electric blue, rose×amber→warm coral.
	{
		id: 0,
		colors: ["#1D4ED8", "#4F46E5", "#EC4899", "#F59E0B"],
		positions: [[15, 25], [75, 15], [80, 75], [20, 80]],
	},

	// 1 · Terra — Loom
	// Primary: burnt orange. C2: amber-yellow (analogous warm). C3: sky blue (complement).
	// C4: fuchsia (split-comp). Emergent: orange×yellow→fire, sky×fuchsia→electric.
	{
		id: 1,
		colors: ["#EA580C", "#EAB308", "#0EA5E9", "#C026D3"],
		positions: [[20, 75], [75, 20], [85, 80], [10, 15]],
	},

	// 2 · Violet — Ember
	// Primary: vivid violet. C2: fuchsia (analogous). C3: lime green (split-comp ~150°).
	// C4: amber (warm anchor). Emergent: violet×fuchsia→magenta, green×amber→electric gold.
	{
		id: 2,
		colors: ["#9333EA", "#C026D3", "#65A30D", "#F59E0B"],
		positions: [[5, 35], [80, 10], [60, 80], [30, 70]],
	},

	// 3 · Teal — Quill
	// Primary: teal. C2: emerald (analogous). C3: crimson (complement ~180°).
	// C4: violet (split). Emergent: teal×emerald→deep green, crimson×violet→warm purple.
	{
		id: 3,
		colors: ["#0D9488", "#059669", "#E11D48", "#8B5CF6"],
		positions: [[20, 20], [75, 35], [85, 85], [10, 75]],
	},

	// 4 · Rose
	// Primary: hot pink. C2: coral-rose (analogous). C3: emerald (split-comp ~150°).
	// C4: cobalt (cool anchor). Emergent: pink×rose→vivid coral, emerald×cobalt→ocean.
	{
		id: 4,
		colors: ["#EC4899", "#F43F5E", "#10B981", "#1D4ED8"],
		positions: [[85, 85], [15, 75], [10, 10], [80, 15]],
	},

	// 5 · Emerald
	// Primary: emerald green. C2: teal (analogous cool). C3: crimson (complement).
	// C4: sky (split). Emergent: green×teal→deep cyan, crimson×sky→vivid mauve.
	{
		id: 5,
		colors: ["#059669", "#0D9488", "#DC2626", "#0EA5E9"],
		positions: [[50, 10], [85, 60], [25, 85], [10, 30]],
	},

	// 6 · Amber
	// Primary: amber/gold. C2: warm yellow (analogous). C3: cobalt (complement ~180°).
	// C4: violet (split). Emergent: amber×yellow→hot gold, cobalt×violet→electric indigo.
	{
		id: 6,
		colors: ["#D97706", "#CA8A04", "#2563EB", "#7C3AED"],
		positions: [[80, 20], [15, 70], [75, 80], [30, 15]],
	},

	// 7 · Cyan
	// Primary: cyan. C2: sky (analogous). C3: orange (complement ~180°).
	// C4: purple (split). Emergent: cyan×sky→icy blue, orange×purple→warm magenta.
	{
		id: 7,
		colors: ["#06B6D4", "#0EA5E9", "#F97316", "#A855F7"],
		positions: [[5, 5], [80, 30], [30, 85], [85, 80]],
	},

	// 8 · Crimson
	// Primary: vivid red. C2: orange (analogous warm). C3: teal (complement ~180°).
	// C4: violet (split). Emergent: red×orange→fire, teal×violet→deep jewel.
	{
		id: 8,
		colors: ["#DC2626", "#F97316", "#0D9488", "#8B5CF6"],
		positions: [[50, 50], [10, 10], [85, 25], [75, 85]],
	},

	// 9 · Fuchsia
	// Primary: fuchsia. C2: hot pink (analogous). C3: lime (split-comp ~150°).
	// C4: sky (cool anchor). Emergent: fuchsia×pink→vivid magenta, lime×sky→electric teal.
	{
		id: 9,
		colors: ["#C026D3", "#EC4899", "#65A30D", "#0EA5E9"],
		positions: [[25, 80], [80, 15], [10, 25], [85, 75]],
	},
];
