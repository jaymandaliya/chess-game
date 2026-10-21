const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Runs the engine off the main thread so a deep search never stalls other games' clocks
if (!isMainThread) {
  const { chooseMove } = require('./engine');
  parentPort.postMessage(chooseMove(workerData.fen, workerData.level));
}

function chooseMoveAsync(fen, level) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'engineWorker.js'), { workerData: { fen, level } });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Engine worker exited with ${code}`));
    });
  });
}

module.exports = { chooseMoveAsync };
