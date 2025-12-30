class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    
    // Check if we have audio input
    if (input && input.length > 0) {
      const inputChannel = input[0]; // First (mono) channel
      
      if (inputChannel && inputChannel.length > 0) {
        // Convert Float32 to Int16 (PCM16)
        const pcm16 = new Int16Array(inputChannel.length);
        for (let i = 0; i < inputChannel.length; i++) {
          pcm16[i] = Math.max(-32768, Math.min(32767, inputChannel[i] * 32768));
        }
        
        // Send PCM16 data to main thread
        this.port.postMessage({
          type: 'audio-data',
          data: pcm16.buffer
        });
      }
    }
    
    // Return true to keep the processor alive
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);