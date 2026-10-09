"""
Runs a model on the evaluation conversations and writes predictions for eval/run.mjs.

    python predict.py --adapter duyai-lora --out predictions_finetuned.jsonl
    python predict.py --out predictions_base.jsonl              # base model, no fine-tuning

Then on the project computer:
    node eval/run.mjs --predictions predictions_finetuned.jsonl --name "Qwen2.5-1.5B + LoRA"
"""

import argparse
import json
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from common import build_messages, parse_json

parser = argparse.ArgumentParser()
parser.add_argument("--inputs", default="data/eval_inputs.jsonl")
parser.add_argument("--model", default="Qwen/Qwen2.5-1.5B-Instruct")
parser.add_argument("--adapter", default=None, help="LoRA adapter dir; omit for the base model")
parser.add_argument("--out", default="predictions.jsonl")
parser.add_argument("--max-new-tokens", type=int, default=800)
args = parser.parse_args()

tokenizer = AutoTokenizer.from_pretrained(args.adapter or args.model)
model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.float16, device_map="auto")
if args.adapter:
    from peft import PeftModel

    model = PeftModel.from_pretrained(model, args.adapter)
model.eval()

with open(args.inputs, encoding="utf-8") as f:
    inputs = [json.loads(line) for line in f if line.strip()]

latencies = []
with open(args.out, "w", encoding="utf-8") as out:
    for example in inputs:
        prompt = tokenizer.apply_chat_template(
            build_messages(example, with_answer=False), tokenize=False, add_generation_prompt=True
        )
        encoded = tokenizer(prompt, return_tensors="pt").to(model.device)
        started = time.time()
        with torch.no_grad():
            generated = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
            )
        latencies.append(time.time() - started)
        text = tokenizer.decode(generated[0][encoded["input_ids"].shape[1] :], skip_special_tokens=True)
        out.write(json.dumps({"id": example["id"], "output": parse_json(text)}, ensure_ascii=False) + "\n")
        print(f"{example['id']}: {latencies[-1]:.1f}s")

print(f"Average latency: {sum(latencies) / len(latencies):.2f}s per call -> {args.out}")
