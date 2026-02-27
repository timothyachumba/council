import { spawn } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface VoiceServiceEvents {
	recording: () => void;
	transcribing: () => void;
	transcribed: (text: string) => void;
	error: (err: Error) => void;
}

export declare interface VoiceService {
	on<K extends keyof VoiceServiceEvents>(event: K, listener: VoiceServiceEvents[K]): this;
	emit<K extends keyof VoiceServiceEvents>(event: K, ...args: Parameters<VoiceServiceEvents[K]>): boolean;
}

export class VoiceService extends EventEmitter {
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private _isRecording = false;
	private parakeetPath: string | null;

	constructor(parakeetPath: string | null = null) {
		super();
		this.parakeetPath = parakeetPath;
	}

	get isRecording(): boolean {
		return this._isRecording;
	}

	async startRecording(): Promise<void> {
		if (this._isRecording) return;

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			this.chunks = [];
			this.mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

			this.mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) this.chunks.push(e.data);
			};

			this.mediaRecorder.onstop = () => {
				// Stop all tracks to release mic
				stream.getTracks().forEach((t) => t.stop());
				void this.transcribe();
			};

			this.mediaRecorder.start();
			this._isRecording = true;
			this.emit("recording");
		} catch (err) {
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
		}
	}

	stopRecording(): void {
		if (!this._isRecording || !this.mediaRecorder) return;
		this._isRecording = false;
		this.mediaRecorder.stop();
	}

	private async transcribe(): Promise<void> {
		this.emit("transcribing");

		const blob = new Blob(this.chunks, { type: "audio/webm" });
		const arrayBuffer = await blob.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const tmpFile = path.join(os.tmpdir(), `cv-voice-${Date.now()}.webm`);

		try {
			fs.writeFileSync(tmpFile, buffer);

			const bin = this.resolveParakeetBin();
			const proc = spawn(bin, [tmpFile, "--output-format", "json"]);

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			proc.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString("utf8");
			});

			proc.on("close", (code) => {
				// Cleanup temp file
				try { fs.unlinkSync(tmpFile); } catch { /* noop */ }

				if (code !== 0) {
					this.emit("error", new Error(`parakeet-mlx exited with code ${code}: ${stderr}`));
					return;
				}

				try {
					const result = JSON.parse(stdout);
					const text = (result.text ?? result.transcription ?? "").trim();
					if (text) {
						this.emit("transcribed", text);
					} else {
						this.emit("error", new Error("No text in transcription result"));
					}
				} catch {
					// Might be plain text output
					const text = stdout.trim();
					if (text) {
						this.emit("transcribed", text);
					} else {
						this.emit("error", new Error("Empty transcription result"));
					}
				}
			});

			proc.on("error", (err) => {
				try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
				this.emit("error", err);
			});
		} catch (err) {
			try { fs.unlinkSync(tmpFile); } catch { /* noop */ }
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
		}
	}

	private resolveParakeetBin(): string {
		// 1. Check user-configured path
		if (this.parakeetPath) return this.parakeetPath;

		// 2. Check uv default location
		const uvPath = path.join(os.homedir(), ".local", "bin", "parakeet-mlx");
		if (fs.existsSync(uvPath)) return uvPath;

		// 3. Fall back to bare command on PATH
		return "parakeet-mlx";
	}

	updatePath(parakeetPath: string | null): void {
		this.parakeetPath = parakeetPath;
	}
}
