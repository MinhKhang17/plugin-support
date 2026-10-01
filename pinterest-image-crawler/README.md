# Pinterest Image Dataset Crawler

Python-only crawler that searches Pinterest by keywords and downloads image Pins for dataset building.

## Windows setup

```powershell
cd D:\path\to\pinterest-image-crawler
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Put one query per line in `keywords.txt`. Blank lines and lines starting with `#` are ignored.

## Run

```powershell
python main.py --max-images 10
```

Stop the whole run after 2,500 valid images:

```powershell
python main.py --max-per-keyword 15 --target-total 2500
```

Headless mode:

```powershell
python main.py --max-per-keyword 15 --target-total 2500 --headless
```

Output is stored under `dataset/images/<keyword>/`, with metadata in `dataset/metadata.csv`.

Notes: Pinterest's page structure can change. Keep `headless: false` while debugging. Use responsibly and comply with Pinterest's applicable terms and rights associated with downloaded content.
