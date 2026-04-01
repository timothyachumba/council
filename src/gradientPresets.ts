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
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	const [p1, p2, p3, p4] = preset.positions;
	return [
		`radial-gradient(circle at ${p1[0]}% ${p1[1]}%, ${c1} 0%, transparent 60%)`,
		`radial-gradient(circle at ${p2[0]}% ${p2[1]}%, ${c2} 0%, transparent 55%)`,
		`radial-gradient(circle at ${p3[0]}% ${p3[1]}%, ${c3} 0%, transparent 65%)`,
		`radial-gradient(circle at ${p4[0]}% ${p4[1]}%, ${c4} 0%, transparent 50%)`,
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

// 20 curated presets — vivid, contrasting palettes with unique blob positions.
// Indices 0–3 align with the default agent identities (Edge, Loom, Ember, Quill).
export const GRADIENT_PRESETS: GradientPreset[] = [
	// 0 · Cobalt Storm — Edge (steel blue + indigo + amber + violet)
	{
		id: 0,
		colors: ["#2E56A1", "#3A2078", "#F58C1E", "#9852D9"],
		positions: [[15, 25], [75, 15], [80, 75], [20, 80]],
	},
	// 1 · Terra Inferno — Loom (terracotta + gold + crimson + electric blue)
	{
		id: 1,
		colors: ["#E05C2B", "#EDAF40", "#8B1A4A", "#3615D8"],
		positions: [[20, 75], [75, 20], [85, 80], [10, 15]],
	},
	// 2 · Electric Night — Ember (mauve + electric blue + yellow + hot pink)
	{
		id: 2,
		colors: ["#97447F", "#1205D5", "#F6DF30", "#E91E8C"],
		positions: [[5, 35], [80, 10], [60, 80], [30, 70]],
	},
	// 3 · Canopy Deep — Quill (emerald + teal + gold + ocean)
	{
		id: 3,
		colors: ["#0A7A55", "#2BB5A0", "#E8C84A", "#1A5A8A"],
		positions: [[20, 20], [75, 35], [85, 85], [10, 75]],
	},
	// 4 · Neon Sunset
	{
		id: 4,
		colors: ["#FF416C", "#FF4B2B", "#4A00E0", "#F9D423"],
		positions: [[85, 85], [20, 75], [10, 10], [80, 15]],
	},
	// 5 · Midnight Ocean
	{
		id: 5,
		colors: ["#0D0D6B", "#00B4D8", "#9B2335", "#E040FB"],
		positions: [[5, 5], [80, 30], [30, 85], [85, 80]],
	},
	// 6 · Plasma Rose
	{
		id: 6,
		colors: ["#FF006E", "#3A86FF", "#FFBE0B", "#8338EC"],
		positions: [[70, 20], [15, 70], [80, 75], [30, 15]],
	},
	// 7 · Magma
	{
		id: 7,
		colors: ["#E63946", "#F4A261", "#2D1B69", "#FF6B6B"],
		positions: [[80, 80], [20, 15], [60, 40], [10, 85]],
	},
	// 8 · Prism
	{
		id: 8,
		colors: ["#8360C3", "#2EBF91", "#F7971E", "#E91E63"],
		positions: [[50, 10], [85, 60], [25, 85], [10, 30]],
	},
	// 9 · Dark Matter
	{
		id: 9,
		colors: ["#E94560", "#0F3460", "#16213E", "#533483"],
		positions: [[80, 20], [10, 80], [85, 75], [20, 15]],
	},
	// 10 · Tropical Storm
	{
		id: 10,
		colors: ["#FF6B6B", "#FFA726", "#AB47BC", "#29B6F6"],
		positions: [[20, 15], [80, 20], [75, 80], [15, 80]],
	},
	// 11 · Void
	{
		id: 11,
		colors: ["#1A237E", "#880E4F", "#E65100", "#004D40"],
		positions: [[5, 5], [85, 80], [80, 15], [10, 75]],
	},
	// 12 · Aurora
	{
		id: 12,
		colors: ["#00C9FF", "#92FE9D", "#FC466B", "#3F5EFB"],
		positions: [[75, 25], [20, 75], [80, 80], [15, 15]],
	},
	// 13 · Amethyst
	{
		id: 13,
		colors: ["#614385", "#516395", "#EC407A", "#F9D423"],
		positions: [[20, 80], [80, 80], [15, 20], [75, 15]],
	},
	// 14 · Solstice
	{
		id: 14,
		colors: ["#F7971E", "#FFD200", "#FF416C", "#1A1A2E"],
		positions: [[10, 10], [85, 25], [65, 85], [15, 65]],
	},
	// 15 · Biotope
	{
		id: 15,
		colors: ["#00B09B", "#96C93D", "#1565C0", "#E91E63"],
		positions: [[85, 15], [15, 85], [80, 80], [20, 15]],
	},
	// 16 · Obsidian Ember
	{
		id: 16,
		colors: ["#8E0E00", "#1F1C18", "#F7971E", "#FF6584"],
		positions: [[50, 50], [10, 10], [85, 25], [75, 85]],
	},
	// 17 · Ultraviolet
	{
		id: 17,
		colors: ["#1A1A2E", "#6A1B9A", "#E040FB", "#18FFFF"],
		positions: [[5, 75], [80, 20], [25, 25], [85, 85]],
	},
	// 18 · Deep Pacific
	{
		id: 18,
		colors: ["#004E92", "#000428", "#4AC29A", "#BDFFF3"],
		positions: [[15, 15], [80, 80], [20, 80], [85, 15]],
	},
	// 19 · Charcoal Fusion
	{
		id: 19,
		colors: ["#373B44", "#4286F4", "#FF6B6B", "#FFA726"],
		positions: [[25, 25], [80, 10], [10, 80], [85, 80]],
	},
];
