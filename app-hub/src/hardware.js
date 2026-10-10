// What this PC has: CPU, RAM, GPUs (with VRAM) and free disk.
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: 15000, windowsHide: true }, (err, out) => resolve(err ? '' : String(out)));
});
const gb = (bytes) => Math.round((bytes / 1024 ** 3) * 10) / 10;

async function gpus() {
  // nvidia-smi gives the real VRAM; it ships with every NVIDIA driver.
  const smi = await run('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  const list = smi.trim().split(/\r?\n/).filter(Boolean).map((l) => {
    const [name, mib] = l.split(',').map((s) => s.trim());
    return { name, vramGB: gb(Number(mib) * 1024 ** 2), nvidia: true };
  });
  if (list.length || process.platform !== 'win32') return list;
  // Other cards: the registry holds the 64-bit VRAM size (Win32_VideoController.AdapterRAM caps at 4 GB).
  const ps = `Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ name = $_.DriverDesc; vram = $_.'HardwareInformation.qwMemorySize' } } | ConvertTo-Json -Compress`;
  try {
    const rows = [].concat(JSON.parse(await run('powershell', ['-NoProfile', '-Command', ps])) || []);
    return rows.filter((r) => r && r.name).map((r) => ({
      name: r.name, vramGB: gb(Number(r.vram) || 0), nvidia: /nvidia/i.test(r.name),
    }));
  } catch { return []; }
}

function freeDiskGB(dir) {
  try { const s = fs.statfsSync(dir); return gb(s.bavail * s.bsize); } catch { return null; }
}

async function detect(dir) {
  const cpus = os.cpus();
  return {
    cpu: (cpus[0] && cpus[0].model.trim()) || 'Unknown CPU',
    cores: cpus.length,
    ramGB: gb(os.totalmem()),
    gpus: await gpus(),
    diskGB: freeDiskGB(dir),
    os: `${os.type()} ${os.release()}`,
  };
}

module.exports = { detect };
