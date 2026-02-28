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
	private audioCtx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private amplitudeData: Uint8Array = new Uint8Array(0);

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
				// Clean up audio analyser
				this.sourceNode?.disconnect();
				this.sourceNode = null;
				this.analyser = null;
				if (this.audioCtx) {
					void this.audioCtx.close();
					this.audioCtx = null;
				}
				void this.transcribe();
			};

			// Set up Web Audio analyser for amplitude
			this.audioCtx = new AudioContext();
			this.analyser = this.audioCtx.createAnalyser();
			this.analyser.fftSize = 256;
			this.analyser.smoothingTimeConstant = 0;
			this.amplitudeData = new Uint8Array(this.analyser.frequencyBinCount);
			this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
			this.sourceNode.connect(this.analyser);

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

	/** Returns normalized 0-1 amplitude from the mic. Poll at ~80ms for waveform bars. */
	getAmplitude(): number {
		if (!this.analyser) return 0;
		this.analyser.getByteTimeDomainData(this.amplitudeData);
		let max = 0;
		for (let i = 0; i < this.amplitudeData.length; i++) {
			const v = Math.abs(this.amplitudeData[i] - 128);
			if (v > max) max = v;
		}
		return max / 128;
	}

	private async transcribe(): Promise<void> {
		this.emit("transcribing");

		const blob = new Blob(this.chunks, { type: "audio/webm" });
		const arrayBuffer = await blob.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const tmpDir = path.join(os.tmpdir(), `cv-voice-${Date.now()}`);
		const tmpFile = path.join(tmpDir, "recording.webm");

		try {
			fs.mkdirSync(tmpDir, { recursive: true });
			fs.writeFileSync(tmpFile, buffer);

			const bin = this.resolveParakeetBin();
			// Ensure ffmpeg and common tools are in PATH for the subprocess
			const env = { ...process.env };
			const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
			env.PATH = extraPaths.join(":") + ":" + (env.PATH ?? "");

			const proc = spawn(bin, [
				tmpFile,
				"--output-format", "json",
				"--output-dir", tmpDir,
			], { env });

			let stderr = "";

			let stdout = "";

			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});

			proc.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString("utf8");
			});

			proc.on("close", (code) => {
				console.log("[cv-voice] parakeet-mlx exited with code", code);
				console.log("[cv-voice] stderr:", stderr);
				console.log("[cv-voice] stdout:", stdout);
				console.log("[cv-voice] files in tmpDir:", fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir) : "dir not found");

				if (code !== 0) {
					this.cleanup(tmpDir);
					this.emit("error", new Error(`parakeet-mlx exited with code ${code}: ${stderr}`));
					return;
				}

				// parakeet-mlx exits 0 even on failure — check stdout for errors
				if (stdout.includes("Error transcribing")) {
					this.cleanup(tmpDir);
					this.emit("error", new Error(stdout.trim()));
					return;
				}

				try {
					// Read the json output file (named after the input file)
					const jsonFile = path.join(tmpDir, "recording.json");
					if (fs.existsSync(jsonFile)) {
						const raw = fs.readFileSync(jsonFile, "utf8");
						const result = JSON.parse(raw);
						const text = (result.text ?? result.transcription ?? "").trim();
						if (text) {
							this.cleanup(tmpDir);
							this.emit("transcribed", text);
							return;
						}
					}

					// Fallback: try reading any .json file in the dir
					const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".json"));
					for (const f of files) {
						const raw = fs.readFileSync(path.join(tmpDir, f), "utf8");
						const result = JSON.parse(raw);
						const text = (result.text ?? result.transcription ?? "").trim();
						if (text) {
							this.cleanup(tmpDir);
							this.emit("transcribed", text);
							return;
						}
					}

					this.cleanup(tmpDir);
					this.emit("error", new Error("No transcription text found"));
				} catch (err) {
					this.cleanup(tmpDir);
					this.emit("error", err instanceof Error ? err : new Error(String(err)));
				}
			});

			proc.on("error", (err) => {
				this.cleanup(tmpDir);
				this.emit("error", err);
			});
		} catch (err) {
			this.cleanup(tmpDir);
			this.emit("error", err instanceof Error ? err : new Error(String(err)));
		}
	}

	private cleanup(dir: string): void {
		try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
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
