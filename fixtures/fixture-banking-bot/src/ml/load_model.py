# Banking-bot fixture: deliberately-unsafe pickle/torch load.
# Triggers R013 (LLM03 supply chain — arbitrary code execution).

import pickle
import torch


def load_user_model(path):
    # Unsafe: torch.load without weights_only=True is equivalent to
    # running an arbitrary Python script embedded in the .pt file.
    return torch.load(path)


def load_pickle_payload(blob):
    return pickle.loads(blob)
