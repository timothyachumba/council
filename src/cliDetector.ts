// src/cliDetector.ts

import { exec } from "child_process";
import { existsSync } from "fs";
import * as os from "os";
import * as path from "path";

const CANDIDATE_PATHS = [
	path.join(os.homedir(), ".local", "bin", "claude"),
	"/usr/local/bin/claude",
	"/opt/homebrew/bin/claude",
];

/**
 * Tries to find the Claude CLI binary.
 * Checks `which claude` first, then a list of common install locations.
 * Returns the first resolved path, or null if nothing found.
 */
export async function detectClaudeCli(): Promise<string | null> {
	// 1. Try `which claude`
	const fromWhich = await tryWhich();
	if (fromWhich) return fromWhich;

	// 2. Check known paths
	for (const p of CANDIDATE_PATHS) {
		if (existsSync(p)) return p;
	}

	return null;
}

function tryWhich(): Promise<string | null> {
	return new Promise((resolve) => {
		exec("which claude", (err, stdout) => {
			if (err || !stdout.trim()) {
				resolve(null);
			} else {
				resolve(stdout.trim());
			}
		});
	});
}
