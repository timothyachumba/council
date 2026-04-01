// src/gradientPresets.ts

export interface GradientPreset {
	id: number;
	colors: [string, string, string, string];
	// Seed positions as [x%, y%] — controls where each color blob is anchored.
	positions: [[number, number], [number, number], [number, number], [number, number]];
}

/**
 * Renders a gradient preset as a CSS `background` string.
 * C1 is the solid base fill — it defines the dominant visual identity of the swatch.
 * The other three colors bloom as radial blobs over the top.
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	const [p1, p2, p3, p4] = preset.positions;
	return [
		`radial-gradient(circle at ${p1[0]}% ${p1[1]}%, ${c1} 0%, transparent 62%)`,
		`radial-gradient(circle at ${p2[0]}% ${p2[1]}%, ${c2} 0%, transparent 57%)`,
		`radial-gradient(circle at ${p3[0]}% ${p3[1]}%, ${c3} 0%, transparent 65%)`,
		`radial-gradient(circle at ${p4[0]}% ${p4[1]}%, ${c4} 0%, transparent 52%)`,
		c1, // solid base — C1 defines the dominant identity
	].join(", ");
}

/**
 * Returns the first color of a preset — used as the agent's primary accent
 * (name badges, @mention chips, message card avatars).
 */
export function primaryColor(preset: GradientPreset): string {
	return preset.colors[0];
}

// 20 presets across 5 visual families, 4 per family, interleaved so the
// 10-column picker (rows of 10) alternates: BLUE·ORANGE·PURPLE·TEAL·PINK·BLUE·ORANGE·PURPLE·TEAL·PINK
//
// Row 1 (0–9):  blue · orange · purple · teal · pink · blue · orange · purple · teal · pink
// Row 2 (10–19): blue · orange · purple · teal · pink · blue · orange · purple · teal · pink
//
// Indices 0–3 are the default agent identities — one per distinct family.
// C1 always defines the swatch identity (it's also the solid base fill).
export const GRADIENT_PRESETS: GradientPreset[] = [

	// ── Row 1 ──────────────────────────────────────────────────────────────────

	// 0 · Cobalt — Edge (BLUE: deep blue + indigo + hot pink + amber)
	{
		id: 0,
		colors: ["#1D4ED8", "#4F46E5", "#EC4899", "#F59E0B"],
		positions: [[15, 25], [75, 15], [80, 75], [20, 80]],
	},
	// 1 · Terra — Loom (ORANGE: burnt orange + gold + violet + sky)
	{
		id: 1,
		colors: ["#EA580C", "#EAB308", "#7C3AED", "#0EA5E9"],
		positions: [[20, 75], [75, 20], [85, 80], [10, 15]],
	},
	// 2 · Ember — Ember (PURPLE: violet + fuchsia + cyan + amber)
	{
		id: 2,
		colors: ["#9333EA", "#C026D3", "#06B6D4", "#F59E0B"],
		positions: [[5, 35], [80, 10], [60, 80], [30, 70]],
	},
	// 3 · Canopy — Quill (TEAL: teal + emerald + rose + sky)
	{
		id: 3,
		colors: ["#0D9488", "#16A34A", "#E11D48", "#0284C7"],
		positions: [[20, 20], [75, 35], [85, 85], [10, 75]],
	},
	// 4 · Flamingo (PINK: hot pink + rose + cobalt + emerald)
	{
		id: 4,
		colors: ["#EC4899", "#F43F5E", "#1D4ED8", "#10B981"],
		positions: [[85, 85], [20, 75], [10, 10], [80, 15]],
	},
	// 5 · Arctic (BLUE: sky + cobalt + violet + gold)
	{
		id: 5,
		colors: ["#0EA5E9", "#2563EB", "#8B5CF6", "#FBBF24"],
		positions: [[5, 5], [80, 30], [30, 85], [85, 80]],
	},
	// 6 · Solstice (ORANGE: amber + gold + indigo + teal)
	{
		id: 6,
		colors: ["#D97706", "#F59E0B", "#4F46E5", "#0D9488"],
		positions: [[70, 20], [15, 70], [80, 75], [30, 15]],
	},
	// 7 · Dusk (PURPLE: deep violet + purple + rose + teal)
	{
		id: 7,
		colors: ["#6D28D9", "#9333EA", "#F43F5E", "#0D9488"],
		positions: [[80, 80], [20, 15], [60, 40], [10, 85]],
	},
	// 8 · Lagoon (TEAL: cyan + teal + violet + amber)
	{
		id: 8,
		colors: ["#06B6D4", "#0D9488", "#7C3AED", "#F59E0B"],
		positions: [[50, 10], [85, 60], [25, 85], [10, 30]],
	},
	// 9 · Fuchsia (PINK: fuchsia + violet + cyan + gold)
	{
		id: 9,
		colors: ["#C026D3", "#7C3AED", "#06B6D4", "#F59E0B"],
		positions: [[80, 20], [10, 80], [85, 75], [20, 15]],
	},

	// ── Row 2 ──────────────────────────────────────────────────────────────────

	// 10 · Nocturn (BLUE: midnight + violet + rose + teal)
	{
		id: 10,
		colors: ["#1E40AF", "#5B21B6", "#F43F5E", "#0D9488"],
		positions: [[20, 15], [80, 20], [75, 80], [15, 80]],
	},
	// 11 · Inferno (ORANGE: red + orange + indigo + cyan)
	{
		id: 11,
		colors: ["#DC2626", "#F97316", "#4F46E5", "#06B6D4"],
		positions: [[5, 5], [85, 80], [80, 15], [10, 75]],
	},
	// 12 · Ultraviolet (PURPLE: indigo + violet + pink + gold)
	{
		id: 12,
		colors: ["#4F46E5", "#A855F7", "#EC4899", "#F59E0B"],
		positions: [[75, 25], [20, 75], [80, 80], [15, 15]],
	},
	// 13 · Jungle (TEAL: emerald + lime + fuchsia + sky)
	{
		id: 13,
		colors: ["#059669", "#65A30D", "#C026D3", "#0EA5E9"],
		positions: [[20, 80], [80, 80], [15, 20], [75, 15]],
	},
	// 14 · Rose Gold (PINK: rose + pink + violet + gold)
	{
		id: 14,
		colors: ["#E11D48", "#EC4899", "#7C3AED", "#D97706"],
		positions: [[10, 10], [85, 25], [65, 85], [15, 65]],
	},
	// 15 · Blueprint (BLUE: cobalt + cyan + indigo + amber)
	{
		id: 15,
		colors: ["#2563EB", "#06B6D4", "#4F46E5", "#F59E0B"],
		positions: [[85, 15], [15, 85], [80, 80], [20, 15]],
	},
	// 16 · Solar Flare (ORANGE: orange + coral + cobalt + lime)
	{
		id: 16,
		colors: ["#F97316", "#F43F5E", "#1D4ED8", "#65A30D"],
		positions: [[50, 50], [10, 10], [85, 25], [75, 85]],
	},
	// 17 · Phantom (PURPLE: violet + cobalt + fuchsia + emerald)
	{
		id: 17,
		colors: ["#7C3AED", "#1D4ED8", "#C026D3", "#10B981"],
		positions: [[5, 75], [80, 20], [25, 25], [85, 85]],
	},
	// 18 · Spearmint (TEAL: emerald + cyan + pink + gold)
	{
		id: 18,
		colors: ["#10B981", "#06B6D4", "#EC4899", "#CA8A04"],
		positions: [[15, 15], [80, 80], [20, 80], [85, 15]],
	},
	// 19 · Dusk Rose (PINK: coral + rose + indigo + teal)
	{
		id: 19,
		colors: ["#F43F5E", "#DB2777", "#4F46E5", "#0D9488"],
		positions: [[25, 25], [80, 10], [10, 80], [85, 80]],
	},
];
