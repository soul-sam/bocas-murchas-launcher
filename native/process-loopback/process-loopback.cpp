/*
 * bm-loopback.exe — som do sistema MENOS um processo.
 *
 * O loopback comum do Windows (o `audio: 'loopback'` do Electron) entrega a
 * mistura final da placa de som, inclusive o que o proprio launcher toca: as
 * vozes da call, o soundboard, os avisos. Quem transmitia a tela com som
 * devolvia a call pra call. Ver src/lib/process-loopback.ts.
 *
 * Aqui usamos a captura por processo do Windows 10 2004+ (build 19041):
 * `AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK` com
 * `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE` — tudo que toca no PC,
 * exceto o processo alvo e os filhos dele.
 *
 * Uso:   bm-loopback.exe <pid-excluido> <sample-rate>
 * Saida: PCM float32 intercalado, 2 canais, no stdout, sem cabecalho.
 *        Silencio vira zeros (nao some), pra quem le manter o relogio.
 * Fim:   quando o stdin fecha (o launcher morreu ou mandou parar) ou o
 *        stdout quebra. Codigo de saida != 0 = nao deu pra capturar; a
 *        mensagem vai pro stderr.
 *
 * Build: native/process-loopback/build.cmd (MSVC). O .exe fica versionado em
 * build/bin pra quem empacota nao precisar de compilador.
 */

#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <wrl/implements.h>
#include <io.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <vector>

#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "ole32.lib")

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

static const UINT16 kChannels = 2;

class ActivationHandler
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase,
                          IActivateAudioInterfaceCompletionHandler> {
 public:
  HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  HRESULT result = E_FAIL;
  ComPtr<IAudioClient> client;

  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) override {
    ComPtr<IUnknown> unknown;
    HRESULT activateResult = E_FAIL;
    result = op->GetActivateResult(&activateResult, &unknown);
    if (SUCCEEDED(result)) result = activateResult;
    if (SUCCEEDED(result)) result = unknown.As(&client);
    SetEvent(done);
    return S_OK;
  }
};

static HANDLE g_stop = nullptr;

/* O launcher nao manda nada pelo stdin: EOF nele = hora de sair. */
static DWORD WINAPI WatchStdin(LPVOID) {
  char buf[64];
  DWORD read = 0;
  HANDLE in = GetStdHandle(STD_INPUT_HANDLE);
  while (ReadFile(in, buf, sizeof(buf), &read, nullptr) && read > 0) {
  }
  SetEvent(g_stop);
  return 0;
}

static int Fail(const char* what, HRESULT hr) {
  fprintf(stderr, "%s: 0x%08lx\n", what, (unsigned long)hr);
  return 2;
}

static bool WriteAll(HANDLE out, const void* data, DWORD bytes) {
  const char* p = static_cast<const char*>(data);
  while (bytes > 0) {
    DWORD written = 0;
    if (!WriteFile(out, p, bytes, &written, nullptr) || written == 0) return false;
    p += written;
    bytes -= written;
  }
  return true;
}

int wmain(int argc, wchar_t** argv) {
  if (argc < 3) {
    fprintf(stderr, "uso: bm-loopback.exe <pid-excluido> <sample-rate>\n");
    return 1;
  }
  const DWORD pid = wcstoul(argv[1], nullptr, 10);
  const DWORD rate = wcstoul(argv[2], nullptr, 10);
  if (pid == 0 || rate < 8000 || rate > 192000) {
    fprintf(stderr, "argumentos invalidos\n");
    return 1;
  }

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return Fail("CoInitializeEx", hr);

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT prop = {};
  prop.vt = VT_BLOB;
  prop.blob.cbSize = sizeof(params);
  prop.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto handler = Microsoft::WRL::Make<ActivationHandler>();
  ComPtr<IActivateAudioInterfaceAsyncOperation> op;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                                   __uuidof(IAudioClient), &prop, handler.Get(), &op);
  if (FAILED(hr)) return Fail("ActivateAudioInterfaceAsync", hr);
  if (WaitForSingleObject(handler->done, 5000) != WAIT_OBJECT_0)
    return Fail("ativacao demorou", E_FAIL);
  if (FAILED(handler->result)) return Fail("ativacao", handler->result);
  ComPtr<IAudioClient> client = handler->client;

  // Captura por processo nao tem GetMixFormat: o formato e o que pedirmos, e o
  // AUTOCONVERTPCM faz a conversao. Float32 na taxa do AudioContext de quem le
  // = nenhuma reamostragem do lado do launcher.
  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = kChannels;
  format.nSamplesPerSec = rate;
  format.wBitsPerSample = 32;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                          AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                              AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                              AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                          200000 /* 20 ms */, 0, &format, nullptr);
  if (FAILED(hr)) return Fail("Initialize", hr);

  ComPtr<IAudioCaptureClient> capture;
  hr = client->GetService(IID_PPV_ARGS(&capture));
  if (FAILED(hr)) return Fail("GetService", hr);

  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  g_stop = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  hr = client->SetEventHandle(ready);
  if (FAILED(hr)) return Fail("SetEventHandle", hr);

  _setmode(_fileno(stdout), _O_BINARY);
  HANDLE out = GetStdHandle(STD_OUTPUT_HANDLE);
  CreateThread(nullptr, 0, WatchStdin, nullptr, 0, nullptr);

  hr = client->Start();
  if (FAILED(hr)) return Fail("Start", hr);

  // Avisa o launcher que a captura esta de pe (stderr e texto, stdout e audio).
  fprintf(stderr, "ready\n");
  fflush(stderr);

  std::vector<float> silence;
  HANDLE waits[2] = {g_stop, ready};
  bool running = true;
  while (running) {
    DWORD w = WaitForMultipleObjects(2, waits, FALSE, 1000);
    if (w == WAIT_OBJECT_0) break;
    if (w == WAIT_FAILED) break;

    UINT32 packet = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&packet)) && packet > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) {
        running = false;
        break;
      }
      const DWORD bytes = frames * format.nBlockAlign;
      bool ok;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        silence.assign(static_cast<size_t>(frames) * kChannels, 0.0f);
        ok = WriteAll(out, silence.data(), bytes);
      } else {
        ok = WriteAll(out, data, bytes);
      }
      capture->ReleaseBuffer(frames);
      if (!ok) {
        running = false;
        break;
      }
    }
  }

  client->Stop();
  return 0;
}
