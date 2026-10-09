"""
Fine-tunes a small open model (default Qwen2.5-1.5B-Instruct) with QLoRA to turn
Azerbaijani call transcripts into structured JSON. Fits a single Kaggle T4 (16 GB).

    python train.py --data data/train.jsonl --out duyai-lora
"""

import argparse
import json
import random

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    DataCollatorForSeq2Seq,
    Trainer,
    TrainingArguments,
)

from common import build_messages

parser = argparse.ArgumentParser()
parser.add_argument("--data", default="data/train.jsonl")
parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
parser.add_argument("--out", default="duyai-lora")
parser.add_argument("--epochs", type=float, default=3)
parser.add_argument("--lr", type=float, default=2e-4)
parser.add_argument("--max-len", type=int, default=1536)
parser.add_argument("--seed", type=int, default=42)
args = parser.parse_args()

random.seed(args.seed)
torch.manual_seed(args.seed)

with open(args.data, encoding="utf-8") as f:
    examples = [json.loads(line) for line in f if line.strip()]
random.shuffle(examples)
split = max(1, int(len(examples) * 0.05))
val_examples, train_examples = examples[:split], examples[split:]
print(f"train={len(train_examples)} val={len(val_examples)}")

tokenizer = AutoTokenizer.from_pretrained(args.model)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token


def tokenize(example: dict) -> dict:
    """Loss only on the assistant's JSON answer, not on the prompt."""
    prompt = tokenizer.apply_chat_template(
        build_messages(example, with_answer=False), tokenize=False, add_generation_prompt=True
    )
    full = tokenizer.apply_chat_template(build_messages(example, with_answer=True), tokenize=False)
    prompt_ids = tokenizer(prompt, add_special_tokens=False)["input_ids"]
    full_ids = tokenizer(full, add_special_tokens=False)["input_ids"][: args.max_len]
    labels = [-100] * min(len(prompt_ids), len(full_ids)) + full_ids[len(prompt_ids) :]
    return {"input_ids": full_ids, "attention_mask": [1] * len(full_ids), "labels": labels}


train_ds = Dataset.from_list(train_examples).map(tokenize, remove_columns=list(train_examples[0]))
val_ds = Dataset.from_list(val_examples).map(tokenize, remove_columns=list(val_examples[0]))

accumulation = 8 if len(train_examples) >= 200 else 2
steps_per_epoch = max(1, len(train_examples) // (2 * accumulation))
# warmup_steps works on both transformers 4.x and 5.x (5.x removed warmup_ratio).
warmup_steps = max(1, int(0.05 * steps_per_epoch * args.epochs))

model = AutoModelForCausalLM.from_pretrained(
    args.model,
    quantization_config=BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,  # T4 has no bfloat16
        bnb_4bit_use_double_quant=True,
    ),
    device_map="auto",
)
model = prepare_model_for_kbit_training(model)
model = get_peft_model(
    model,
    LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    ),
)
model.print_trainable_parameters()

trainer = Trainer(
    model=model,
    args=TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        gradient_accumulation_steps=accumulation,
        lr_scheduler_type="cosine",
        warmup_steps=warmup_steps,
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        load_best_model_at_end=True,
        fp16=True,
        gradient_checkpointing=True,
        report_to="none",
        seed=args.seed,
    ),
    train_dataset=train_ds,
    eval_dataset=val_ds,
    data_collator=DataCollatorForSeq2Seq(tokenizer, padding=True, label_pad_token_id=-100),
)
trainer.train()
trainer.save_model(args.out)
tokenizer.save_pretrained(args.out)
print(f"Saved LoRA adapter to {args.out}")
