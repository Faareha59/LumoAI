// services/audioUtils.ts

// Decodes a base64 string into a Uint8Array.
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
  
/**
 * Creates a Blob URL from a base64 encoded audio string.
 * The audio data is expected to be raw PCM data from Gemini TTS.
 * @param base64Audio The base64 encoded audio string.
 * @returns A Blob URL for the audio.
 */
export const createAudioUrlFromBase64 = (base64Audio: string): string => {
    try {
        const audioBytes = decode(base64Audio);
        
        // Raw PCM data needs a WAV header to be playable in the browser.
        // Gemini TTS uses 24000Hz sample rate, 16-bit, mono.
        const wavHeader = createWavHeader({
            dataLength: audioBytes.length,
            sampleRate: 24000,
            numChannels: 1,
            bitsPerSample: 16
        });
        const wavBytes = new Uint8Array(wavHeader.byteLength + audioBytes.length);

        wavBytes.set(new Uint8Array(wavHeader), 0);
        wavBytes.set(audioBytes, wavHeader.byteLength);
        
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error("Error creating audio URL:", error);
        return "";
    }
};

interface WavHeaderOptions {
    dataLength: number;
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
}

/**
 * Creates a WAV file header.
 * @param options Header generation options.
 * @returns An ArrayBuffer containing the WAV header.
 */
function createWavHeader({ dataLength, numChannels, sampleRate, bitsPerSample }: WavHeaderOptions): ArrayBuffer {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size for PCM
    view.setUint16(20, 1, true); // AudioFormat, 1 for PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}