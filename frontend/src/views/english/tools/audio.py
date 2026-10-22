"""Озвучка фраз учебника нейросетевым голосом и сохранение их mp3-файлами.

Что делает: читает JSON [{"id": "...", "text": "..."}], синтезирует каждую фразу
моделью Kokoro-82M (пакет kokoro-onnx, onnxruntime, без torch), обрезает тишину по краям,
оставляет ~80 мс перед началом и кодирует ffmpeg'ом в mp3 mono, 24 кГц, 64 кбит/с.
Файл <id>.mp3, который уже лежит в каталоге вывода, пропускается — скрипт можно
перезапускать.

Откуда модель: релиз model-files-v1.0 репозитория thewh1teagle/kokoro-onnx на GitHub —
kokoro-v1.0.onnx и voices-v1.0.bin. Лицензия Kokoro-82M — Apache-2.0.
Голос по умолчанию af_heart (американский женский, лучший голос модели; bf_emma
владелец забраковал). Язык — по первой букве голоса: a — en-us, b — en-gb.
Каталог вывода называется именем голоса (`english-audio/af_heart`): смена голоса —
новый адрес, и браузер не держит старые записи.

Запуск:
    python -I audio.py <texts.json> <out_dir> [--model M.onnx] [--voices V.bin]
                       [--voice af_heart] [--speed 0.95]
Нужны: python -m pip install kokoro-onnx soundfile, ffmpeg в PATH.
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from kokoro_onnx import Kokoro

SAMPLE_RATE = 24000
LEAD_SILENCE_S = 0.08  # тишина перед речью: кнопка «послушать» не должна звучать с задержкой
TAIL_SILENCE_S = 0.05
THRESHOLD = 0.01  # амплитуда (от 1.0), ниже которой считаем тишиной
DEFAULT_DIR = Path(
    r"C:\Users\wxtxn\AppData\Local\Temp\claude\e--git-virex-trader"
    r"\af94e572-f932-4ce6-9c38-8e299676749a\scratchpad\kokoro"
)


def trim(samples: np.ndarray) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) > THRESHOLD)
    if loud.size == 0:
        return samples
    body = samples[loud[0] : loud[-1] + 1]
    lead = np.zeros(int(LEAD_SILENCE_S * SAMPLE_RATE), dtype=np.float32)
    tail = np.zeros(int(TAIL_SILENCE_S * SAMPLE_RATE), dtype=np.float32)
    return np.concatenate([lead, body, tail])


def encode(samples: np.ndarray, target: Path) -> None:
    tmp = target.with_suffix(".tmp.mp3")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "-",
        "-c:a", "libmp3lame", "-b:a", "64k", "-ar", "24000", "-ac", "1",
        "-f", "mp3", str(tmp),
    ]
    subprocess.run(cmd, input=samples.astype("<f4").tobytes(), check=True)
    tmp.replace(target)  # файл появляется целиком или не появляется


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("texts")
    ap.add_argument("out")
    ap.add_argument("--model", default=str(DEFAULT_DIR / "kokoro-v1.0.onnx"))
    ap.add_argument("--voices", default=str(DEFAULT_DIR / "voices-v1.0.bin"))
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.95)
    # Несколько процессов параллельно: без предела каждый берёт все ядра, и
    # они толкаются — 4 процесса по 3 потока на 12 ядрах быстрее, чем 4 по 12.
    ap.add_argument("--threads", type=int, default=0)
    args = ap.parse_args()

    lang = {"a": "en-us", "b": "en-gb"}[args.voice[0]]
    items = json.loads(Path(args.texts).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    todo = [it for it in items if not (out / f"{it['id']}.mp3").exists()]
    print(f"всего {len(items)}, осталось {len(todo)}", flush=True)
    if not todo:
        return 0

    if args.threads > 0:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = args.threads
        opts.inter_op_num_threads = 1
        session = ort.InferenceSession(args.model, opts, providers=["CPUExecutionProvider"])
        kokoro = Kokoro.from_session(session, args.voices)
    else:
        kokoro = Kokoro(args.model, args.voices)
    started = time.time()
    done = 0
    for it in todo:
        text = it["text"].replace("\u2019", "'").replace("\u2018", "'").strip()
        samples, sr = kokoro.create(text, voice=args.voice, speed=args.speed, lang=lang)
        if sr != SAMPLE_RATE:
            raise RuntimeError(f"частота {sr}, ожидалась {SAMPLE_RATE}")
        encode(trim(np.asarray(samples, dtype=np.float32)), out / f"{it['id']}.mp3")
        done += 1
        if done % 100 == 0:
            rate = done / (time.time() - started) * 60
            print(f"{done}/{len(todo)}  {rate:.0f} фраз/мин", flush=True)

    elapsed = time.time() - started
    size = sum(p.stat().st_size for p in out.glob("*.mp3"))
    print(f"готово: {done} файлов, в каталоге {size / 1e6:.1f} МБ, {elapsed:.0f} с", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
