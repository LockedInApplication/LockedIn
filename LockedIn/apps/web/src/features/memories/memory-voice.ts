export const voiceSeconds = 10;
const wavRate = 16_000;

// Matches the API's canonical mono, 16-bit PCM WAV. The audio samples are
// processed in the browser only; the basic format lets the server verify length.
export function encodeMemoryVoice(input: Float32Array, inputRate: number) {
  const count = Math.min(voiceSeconds * wavRate, Math.floor(input.length * wavRate / inputRate));
  if (!Number.isFinite(count) || inputRate <= 0 || count < wavRate / 4) throw new Error("Try recording for a little longer.");
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  tag(0, "RIFF"); view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, wavRate, true); view.setUint32(28, wavRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, "data"); view.setUint32(40, count * 2, true);
  const step = inputRate / wavRate;
  for (let i = 0; i < count; i++) {
    const from = Math.floor(i * step);
    const to = Math.min(input.length, Math.max(from + 1, Math.floor((i + 1) * step)));
    let value = 0;
    for (let j = from; j < to; j++) value += input[j]!;
    value = Math.max(-1, Math.min(1, value / (to - from)));
    view.setInt16(44 + i * 2, Math.round(value < 0 ? value * 0x8000 : value * 0x7fff), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}

const stopTracks = (stream?: MediaStream) => stream?.getTracks().forEach(track => track.stop());

export async function beginMemoryCapture(
  signal: AbortSignal,
  onClip: (clip: Blob) => void,
  onFailure: (message: string) => void,
) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") {
    throw new Error("Voice recording isn’t available here. You can still leave a written note.");
  }
  signal.throwIfAborted();
  const context = new AudioContext();
  let stream: MediaStream | undefined;
  let node: AudioWorkletNode | undefined;
  let closed = false;
  let limit: ReturnType<typeof setTimeout> | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  function cleanup() {
    if (closed) return;
    closed = true;
    clearTimeout(limit);
    clearTimeout(stopTimeout);
    signal.removeEventListener("abort", cleanup);
    node?.port.close();
    node?.disconnect();
    stopTracks(stream);
    void context.close().catch(() => {});
  }
  signal.addEventListener("abort", cleanup, { once: true });
  try {
    if (!context.audioWorklet) throw new Error("Voice recording isn’t available here. You can still leave a written note.");
    const media = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }).then(value => {
      if (closed) stopTracks(value);
      else stream = value;
    });
    // Call resume from the original record gesture, before awaiting permission.
    await Promise.all([context.resume(), context.audioWorklet.addModule("/worklets/memory-voice.js"), media]);
    signal.throwIfAborted();
    if (!stream) throw new Error("Couldn’t start the microphone.");
    const source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "lockedin-memory-voice", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = ({ data }) => {
      if (closed || !(data instanceof Float32Array)) return;
      const rate = context.sampleRate;
      cleanup();
      try { onClip(encodeMemoryVoice(data, rate)); }
      catch (error) { onFailure(error instanceof Error ? error.message : "Couldn’t finish the recording."); }
    };
    node.onprocessorerror = () => {
      if (closed) return;
      cleanup();
      onFailure("Couldn’t record audio. Try again or leave a written note.");
    };
    const stop = () => {
      if (closed || stopTimeout !== undefined) return;
      node?.port.postMessage("stop");
      stopTracks(stream);
      stopTimeout = setTimeout(() => {
        cleanup();
        onFailure("Couldn’t finish the recording. Try again.");
      }, 1500);
    };
    stream.getAudioTracks().forEach(track => track.addEventListener("ended", stop, { once: true }));
    source.connect(node);
    node.connect(context.destination);
    limit = setTimeout(stop, voiceSeconds * 1000 + 250);
    return { stop };
  } catch (error) {
    cleanup();
    throw error;
  }
}
