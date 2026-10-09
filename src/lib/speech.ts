import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import { LANGUAGES, type LanguageCode } from "../config/languages";
import { SILENCE_MS, TOKEN_REFRESH_MS } from "../config/constants";
import type { VoiceGender } from "../types";
import { api } from "./api";
import { tr } from "../i18n/i18n";

export interface RecognizerHandlers {
  onPartial: (text: string) => void;
  /** A finished phrase, how long it was spoken (ms) and the language it was spoken in. */
  onPhrase: (text: string, durationMs: number, lang: LanguageCode) => void;
  onError: (message: string) => void;
}

const LOCALE_TO_CODE = new Map(
  (Object.keys(LANGUAGES) as LanguageCode[]).map((code) => [LANGUAGES[code].locale, code]),
);

/**
 * Thin wrapper around the Azure Speech SDK: keeps an authorization token fresh
 * and exposes continuous recognition and text-to-speech.
 */
export class SpeechService {
  private token = "";
  private region = "";
  private refreshTimer: ReturnType<typeof setInterval> | undefined;
  private recognizers: sdk.SpeechRecognizer[] = [];
  /** One open synthesizer per voice: reusing its connection saves ~0.3 s per phrase. */
  private synthesizers = new Map<string, sdk.SpeechSynthesizer>();

  async connect(onRefreshError: (err: Error) => void): Promise<void> {
    await this.refreshToken();
    this.refreshTimer = setInterval(
      () => this.refreshToken().catch(onRefreshError),
      TOKEN_REFRESH_MS,
    );
  }

  private async refreshToken(): Promise<void> {
    const { token, region } = await api.speechToken();
    this.token = token;
    this.region = region;
    for (const recognizer of this.recognizers) recognizer.authorizationToken = token;
    for (const synthesizer of this.synthesizers.values()) synthesizer.authorizationToken = token;
  }

  private config(): sdk.SpeechConfig {
    return sdk.SpeechConfig.fromAuthorizationToken(this.token, this.region);
  }

  /**
   * Continuous recognition of one audio stream. With several `languages` Azure identifies
   * the spoken language per phrase (continuous language ID, up to 10 candidates); the first
   * one is the expected language and the fallback.
   */
  async startRecognizer(
    stream: MediaStream,
    languages: LanguageCode[],
    handlers: RecognizerHandlers,
  ): Promise<void> {
    const [expected, ...others] = languages;
    if (!expected) throw new Error("No recognition language");

    const config = this.config();
    config.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, String(SILENCE_MS));
    const audio = sdk.AudioConfig.fromStreamInput(stream);

    let recognizer: sdk.SpeechRecognizer;
    if (others.length) {
      const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(
        languages.slice(0, 10).map((code) => LANGUAGES[code].locale),
      );
      autoDetect.mode = sdk.LanguageIdMode.Continuous;
      recognizer = sdk.SpeechRecognizer.FromConfig(config, autoDetect, audio);
    } else {
      config.speechRecognitionLanguage = LANGUAGES[expected].locale;
      recognizer = new sdk.SpeechRecognizer(config, audio);
    }

    recognizer.recognizing = (_s, e) => handlers.onPartial(e.result.text);
    recognizer.recognized = (_s, e) => {
      handlers.onPartial("");
      const text = e.result.text?.trim();
      if (e.result.reason !== sdk.ResultReason.RecognizedSpeech || !text) return;
      const detected = others.length
        ? LOCALE_TO_CODE.get(sdk.AutoDetectSourceLanguageResult.fromResult(e.result).language)
        : undefined;
      handlers.onPhrase(text, e.result.duration / 10_000, detected ?? expected); // ticks → ms
    };
    recognizer.canceled = (_s, e) => {
      if (e.reason === sdk.CancellationReason.Error) handlers.onError(e.errorDetails);
    };

    await new Promise<void>((resolve, reject) =>
      recognizer.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(err))),
    );
    this.recognizers.push(recognizer);
  }

  private synthesizer(lang: LanguageCode, gender: VoiceGender): sdk.SpeechSynthesizer {
    const voice = LANGUAGES[lang].voices[gender];
    let synthesizer = this.synthesizers.get(voice);
    if (!synthesizer) {
      const config = this.config();
      config.speechSynthesisVoiceName = voice;
      config.speechSynthesisOutputFormat =
        sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      // A null audio config returns the audio instead of playing it on the default speaker.
      synthesizer = new sdk.SpeechSynthesizer(config, null);
      this.synthesizers.set(voice, synthesizer);
    }
    return synthesizer;
  }

  /** Opens the TTS connections for the call's voices now, so the first phrase isn't slower. */
  prewarm(voices: { lang: LanguageCode; gender: VoiceGender }[]): void {
    for (const { lang, gender } of voices) {
      sdk.Connection.fromSynthesizer(this.synthesizer(lang, gender)).openConnection();
    }
  }

  /** Returns MP3 audio for the text, spoken by the chosen voice of that language. */
  synthesize(text: string, lang: LanguageCode, gender: VoiceGender): Promise<ArrayBuffer> {
    const synthesizer = this.synthesizer(lang, gender);
    return new Promise((resolve, reject) => {
      synthesizer.speakTextAsync(
        text,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted)
            resolve(result.audioData);
          else
            reject(
              new Error(
                result.errorDetails || tr("Səsləndirmə alınmadı", "Speech synthesis failed"),
              ),
            );
        },
        (err) => reject(new Error(err)),
      );
    });
  }

  async dispose(): Promise<void> {
    clearInterval(this.refreshTimer);
    await Promise.all(
      this.recognizers.map(
        (recognizer) =>
          new Promise<void>((resolve) =>
            recognizer.stopContinuousRecognitionAsync(
              () => {
                recognizer.close();
                resolve();
              },
              () => resolve(),
            ),
          ),
      ),
    );
    this.recognizers = [];
    for (const synthesizer of this.synthesizers.values()) synthesizer.close();
    this.synthesizers.clear();
  }
}
