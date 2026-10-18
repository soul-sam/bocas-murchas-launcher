# Clipes da call: anel de PCM, opus só ao clipar

- **Data:** 2026-10-18 (commit `perf(clipes): buffer em PCM e opus só ao clipar`)
- **Decisão:** o buffer de 30 s é um AudioWorklet (`clip-ring.worklet.js`) com PCM Int16 estéreo (~5,8 MB);
  ao clipar, WebCodecs `AudioEncoder` codifica opus 64 kbps e `webm-opus.ts` monta o .webm. Sem WebCodecs,
  sai WAV (o servidor aceita). Sozinho na call o buffer não grava.
- **Por quê:** os 3 `MediaRecorder` defasados custavam ~7,5 % de um núcleo a call inteira, até no mudo
  (medido no app; bancada: ~4,5 → ~1,1 ponto). Ganho extra: clipe sempre de 30 s e com duração no cabeçalho.
- **Cuidado:** não forçar `sampleRate` no AudioContext (voz robotizada em driver onboard); o capture
  reamostra pra 48 kHz com OfflineAudioContext.
- **Fonte:** `src/lib/clip-recorder.ts`, `docs/memory-audit-2026-10.md` (medições 5–7 e bancada).
