# DuyAI: öz modelimizin train edilməsi

Məqsəd: Azərbaycan dilli (rus, ingilis, türk sözləri qarışıq) telefon zənglərindən **niyyəti, tarixləri, saatları, qiymətləri və öhdəlikləri** çıxaran kiçik, açıq modeli öyrətmək və onu **eyni test toplusunda** Claude ilə dürüst müqayisə etmək.

## Axın

```
generate_data.mjs ─► data/train.jsonl ─► Kaggle: train.py (QLoRA) ─► predict.py ─► eval/run.mjs
   (Claude, sintetik)                       Qwen2.5-1.5B + LoRA          (24 əl ilə etiketli test)
```

- **Train məlumatı:** Claude tərəfindən yaradılan sintetik zənglər, "silver" etiketlər
- **Test məlumatı:** `eval/dataset.mjs`, əl ilə yazılmış və etiketlənmiş 24 danışıq. Train məlumatına **heç vaxt** daxil edilmir (generator təkrarı yoxlayır)

## Addımlar

1. **Məlumat yaratmaq** (layihə kompüterində):
   ```bash
   node training/generate_data.mjs --count 600
   node training/export_eval.mjs
   ```
   600 nümunə = 120 Claude sorğusu. Xərc: Opus ilə təxminən $8–12, `--model claude-sonnet-5-5` ilə daha ucuz.
   `--budget 0.5` xərci dollarla məhdudlaşdırır. Hər partiya dərhal fayla yazılır, dayandırılıb yenidən işə salınsa qaldığı yerdən davam edir.
   Hazırkı dəst: Sonnet ilə 25 nümunə (~$0.45).

2. **Kaggle:** `training/` qovluğunu Dataset kimi yükləyin (`duyai-training`), `duyai_kaggle.ipynb` notebook-unu açın, **GPU T4** və **Internet On** seçib bütün xanaları işə salın.

3. **Nəticə:** notebook-dan `predictions_base.jsonl` və `predictions_finetuned.jsonl` fayllarını `training/` qovluğuna köçürün və bunları işlədin:
   ```bash
   node eval/run.mjs --predictions training/predictions_base.jsonl --name "Qwen2.5-1.5B (baza)"
   node eval/run.mjs --predictions training/predictions_finetuned.jsonl --name "Qwen2.5-1.5B + LoRA"
   ```
   Hər iki nəticə `eval/RESULTS.md` cədvəlinə Claude-un nəticəsinin yanına yazılır.

## Fayllar

| Fayl | Nə edir |
|---|---|
| `generate_data.mjs` | Claude ilə sintetik, etiketli zənglər (6 danışıq üslubu, 11 niyyət) |
| `export_eval.mjs` | Test danışıqlarını (cavabsız) Python üçün ixrac edir |
| `common.py` | Train və proqnozun eyni prompt formatı, JSON-un təhlükəsiz oxunması |
| `train.py` | QLoRA fine-tuning (4-bit, LoRA r=16), yalnız cavab hissəsində loss |
| `predict.py` | Test toplusunda proqnoz (baza və ya LoRA ilə), gecikməni ölçür |
| `duyai_kaggle.ipynb` | Yuxarıdakıların hamısı, Kaggle üçün hazır |

## Dürüstlük qaydası

Münsiflərə **yalnız `eval/RESULTS.md`-də ölçülmüş rəqəmlər** göstərilir. Train olunmuş model Claude-dan zəif çıxarsa, bu da dəyərli nəticədir: *"kiçik açıq model telefonun özündə/oflayn işləyə bilər, hazırda Claude-un X%-i səviyyəsindədir"*.
