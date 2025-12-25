export function convertWavToPcm(wavBuffer: Buffer): Buffer {
  return wavBuffer.slice(44);
}
