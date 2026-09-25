import { analyzePcm, type AnalysisResponse } from './audioAnalysis';

self.onmessage = (event: MessageEvent<{ samples: Float32Array }>) => {
  const send = (message: AnalysisResponse) => self.postMessage(message);
  try {
    const result = analyzePcm(event.data.samples, percent => send({ type: 'progress', percent }));
    send({ type: 'complete', result });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
