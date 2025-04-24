from pathlib import Path

def get_project_root():
    current_file = Path(__file__).resolve()
    for parent in current_file.parents:
        if (parent / 'main.py').exists():
            return parent
    raise RuntimeError("Could not find project root directory")