import { build } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await build({
    build: {
      outDir: 'dist-sim',
      lib: {
        entry: path.resolve(__dirname, 'src/sim/simulate.ts'),
        formats: ['es'],
        fileName: 'sim',
      },
      rollupOptions: {
        external: ['path', 'url', 'fs'],
      },
    },
    configFile: false,
  });

  console.log('\nRunning compiled simulation...\n');
  const sim = await import('./dist-sim/sim.js');
  sim.runTunnelingTest();
  sim.runMatchSimulation(100);
}

run().catch(console.error);
