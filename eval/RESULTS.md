# Qiymətləndirmə nəticələri

Test toplusu: eval/dataset.mjs (24 əl ilə etiketlənmiş danışıq).

| Tarix            | Model                          | Niyyət | Tarix  | Saat   | Qiymət | Öhdəlik F1 |
| ---------------- | ------------------------------ | ------ | ------ | ------ | ------ | ---------- |
| 2026-10-09 07:56 | claude-opus-5-5 (app pipeline) | 95.8%  | 100.0% | 100.0% | 100.0% | 86.7%      |
| 2026-10-09 08:28 | Qwen2.5-1.5B (baza) | 58.3% | 20.8% | 50.0% | 53.3% | 0.0% |
| 2026-10-09 09:03 | Qwen2.5-1.5B + LoRA (25 nümunə) | 50.0% | 33.3% | 88.9% | 100.0% | 41.1% |
