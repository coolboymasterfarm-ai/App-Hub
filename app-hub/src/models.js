// Model catalog for the apps in the hub, and which ones fit this PC.
// Pure logic (no Electron) so it can be tested with `node --test`.

// Sizes are the download size in GB. Whisper runs through faster-whisper
// (GPU = NVIDIA/CUDA only); chat models run through Ollama.
const WHISPER = [
  { id: 'large-v3-turbo', size: 1.6, vram: 4, note: 'Best accuracy. Needs an NVIDIA GPU to be fast.' },
  { id: 'medium', size: 1.5, vram: 3, note: 'Very good accuracy, slower than turbo.' },
  { id: 'small', size: 0.5, vram: 0, note: 'Good accuracy, fine on most CPUs.' },
  { id: 'base', size: 0.15, vram: 0, note: 'Fastest, for older or low-RAM PCs.' },
];

const CHAT = [
  { id: 'qwen3:1.7b', size: 1.4, note: 'Tiny. Works on almost anything.' },
  { id: 'llama3.2:3b', size: 2.0, note: 'Small and quick.' },
  { id: 'qwen3:4b', size: 2.5, note: 'Best small model. Good on CPU-only PCs.' },
  { id: 'gemma3:4b', size: 3.3, note: 'Small Google model.' },
  { id: 'qwen3:8b', size: 5.2, note: 'The model ClipForge was tuned with, and Starnet\'s pick for its agents.' },
  { id: 'llama3.1:8b', size: 4.9, note: 'Solid all-rounder.' },
  { id: 'gemma3:12b', size: 8.1, note: 'Strong writer for titles and captions.' },
  { id: 'qwen3:14b', size: 9.3, note: 'Smarter clip picks. Wants 12 GB+ VRAM.' },
  { id: 'qwen3:30b', size: 19, note: 'Mixture-of-experts: big, but quick for its size.' },
  { id: 'qwen3:32b', size: 20, note: 'Top quality. Wants a 24 GB GPU.' },
];

const need = (size) => size * 1.2 + 1; // weights + context/runtime overhead, GB
const maxVram = (gpus) => Math.max(0, ...gpus.map((g) => g.vramGB || 0));

// hw: { ramGB, cores, gpus: [{ name, vramGB, nvidia }] }
// fit: 'gpu' fast | 'cpu' works | 'slow' works but slowly | 'no' won't fit
function fitChat(m, hw) {
  if (maxVram(hw.gpus) >= need(m.size)) return 'gpu';
  if (hw.ramGB >= need(m.size) + 4) return 'cpu'; // leave ~4 GB for Windows + the app
  return 'no';
}

function fitWhisper(m, hw) {
  if (maxVram(hw.gpus.filter((g) => g.nvidia)) >= Math.max(m.vram, 2)) return 'gpu';
  if (m.vram === 0 && hw.ramGB >= 4) return 'cpu';
  if (hw.ramGB >= 8) return 'slow';
  return 'no';
}

function recommend(hw) {
  const whisper = WHISPER.map((m) => ({ ...m, kind: 'whisper', fit: fitWhisper(m, hw) }));
  const chat = CHAT.map((m) => ({ ...m, kind: 'ollama', fit: fitChat(m, hw) }));
  // Whisper: the best model that runs on the GPU, else small/base on the CPU.
  const w = whisper.find((m) => m.fit === 'gpu') ||
    whisper.find((m) => m.id === (hw.ramGB >= 8 && hw.cores >= 4 ? 'small' : 'base'));
  // Chat: the biggest dense qwen3 on the GPU (ClipForge prefers qwen3), else a small one on the CPU.
  const gpu = chat.filter((m) => /^qwen3:(?!30b)/.test(m.id) && m.fit === 'gpu').pop();
  const c = gpu || chat.find((m) => m.id === (hw.ramGB >= 12 ? 'qwen3:4b' : 'qwen3:1.7b'));
  w.recommended = true;
  c.recommended = c.fit !== 'no';
  return { whisper, chat };
}

module.exports = { WHISPER, CHAT, recommend };
