/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class MemoryVoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(Math.floor(sampleRate * 10));
    this.length = 0;
    this.finished = false;
    this.port.onmessage = event => {
      if (event.data === "stop") this.finish();
    };
  }

  process(inputs) {
    if (this.finished) return false;
    const input = inputs[0]?.[0];
    if (!input?.length) return true;
    const count = Math.min(input.length, this.buffer.length - this.length);
    this.buffer.set(input.subarray(0, count), this.length);
    this.length += count;
    if (this.length === this.buffer.length) this.finish();
    // No samples are sent to the output, so the mic isn't monitored.
    return !this.finished;
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    const samples = this.buffer.slice(0, this.length);
    this.port.postMessage(samples, [samples.buffer]);
  }
}

registerProcessor("lockedin-memory-voice", MemoryVoiceProcessor);
