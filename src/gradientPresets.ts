// src/gradientPresets.ts

export interface GradientPreset {
	id: number;
	colors: [string, string, string, string];
}

// 20 curated palettes — indices 0–3 match the default agent identities
export const GRADIENT_PRESETS: GradientPreset[] = [
	{ id: 0,  colors: ["#4858D4", "#6B8DD4", "#2A3A9E", "#8B9AE8"] }, // cobalt   (Edge)
	{ id: 1,  colors: ["#DC6845", "#E89B6B", "#B84A2A", "#F0C080"] }, // terracotta (Loom)
	{ id: 2,  colors: ["#7B32C8", "#A855C8", "#5A1AAA", "#C478E8"] }, // purple   (Ember)
	{ id: 3,  colors: ["#5FA96E", "#7EC48C", "#3A8A50", "#A8D4A0"] }, // sage     (Quill)
	{ id: 4,  colors: ["#1A3A6B", "#2E5A9E", "#0E2248", "#4A7AB8"] }, // deep ocean
	{ id: 5,  colors: ["#8B5E3C", "#C4895A", "#6A3E22", "#D4A878"] }, // warm earth
	{ id: 6,  colors: ["#C84878", "#E87898", "#A82A58", "#F0A0B8"] }, // rose
	{ id: 7,  colors: ["#4A6680", "#6A8AA0", "#2E4A60", "#8AAAC0"] }, // arctic slate
	{ id: 8,  colors: ["#2A6B3C", "#4A8A5A", "#1A4A2A", "#6AAA7A"] }, // forest
	{ id: 9,  colors: ["#D4A020", "#E8C860", "#B07800", "#F0D880"] }, // golden
	{ id: 10, colors: ["#E8704A", "#F09A70", "#C84828", "#F8B890"] }, // coral
	{ id: 11, colors: ["#2A1A5E", "#4A3A8E", "#180E3E", "#6A5AAE"] }, // midnight
	{ id: 12, colors: ["#2A9A8A", "#4ABAA8", "#1A7A6A", "#6ACAC0"] }, // mint
	{ id: 13, colors: ["#9A78C8", "#B898E8", "#7A58A8", "#D0B0F8"] }, // lavender
	{ id: 14, colors: ["#D45A2A", "#E87A50", "#B03A10", "#F0A870"] }, // sunset
	{ id: 15, colors: ["#5A7A9A", "#7A9AB8", "#3A5A7A", "#9ABAC8"] }, // steel
	{ id: 16, colors: ["#9A1A2A", "#C04050", "#780A18", "#D07080"] }, // crimson
	{ id: 17, colors: ["#C8A060", "#E0C088", "#A87840", "#F0D8A0"] }, // cream
	{ id: 18, colors: ["#2A7A9A", "#4A9AB8", "#1A5A7A", "#6ABACA"] }, // teal
	{ id: 19, colors: ["#3A3A4A", "#5A5A6A", "#1A1A2A", "#7A7A8A"] }, // ink
];

/**
 * Renders a gradient preset as a CSS `background` string.
 * Four overlapping radial gradients at corners produce a soft mesh effect.
 */
export function gradientToCss(preset: GradientPreset): string {
	const [c1, c2, c3, c4] = preset.colors;
	return [
		`radial-gradient(ellipse at 0% 0%, ${c1}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 100% 0%, ${c2}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 100% 100%, ${c3}cc 0%, transparent 60%)`,
		`radial-gradient(ellipse at 0% 100%, ${c4}cc 0%, transparent 60%)`,
	].join(", ");
}

/**
 * Returns the first color of a preset — used as the agent's primary accent
 * (name badges, @mention chips, message card avatars).
 */
export function primaryColor(preset: GradientPreset): string {
	return preset.colors[0];
}
