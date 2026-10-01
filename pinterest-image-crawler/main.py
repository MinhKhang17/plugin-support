import argparse
import os
import yaml

from crawler.pinterest import (
    build_driver,
    collect_image_urls,
    wait_for_pinterest_login,
)
from downloader.image_downloader import download_candidates
from processing.deduplicate import HashDeduplicator
from utils.metadata import MetadataWriter
def load_keywords(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return [line.strip() for line in f if line.strip() and not line.lstrip().startswith("#")]


def main():
    parser = argparse.ArgumentParser(description="Pinterest-only image dataset crawler")
    parser.add_argument("--keywords", default="keywords.txt")
    parser.add_argument("--max-images", "--max-per-keyword", dest="max_images", type=int, default=20)
    parser.add_argument("--target-total", type=int, default=0, help="Stop after this many valid saved images (0 = disabled)")
    parser.add_argument("--headless", action="store_true")
    args = parser.parse_args()

    with open("config.yaml", "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    keywords = load_keywords(args.keywords)
    if not keywords:
        raise SystemExit("keywords.txt is empty. Add one Pinterest search keyword per line.")

    output_root = cfg["output"]["root"]
    os.makedirs(output_root, exist_ok=True)
    metadata = MetadataWriter(cfg["output"]["metadata"])
    deduper = HashDeduplicator()
    driver = build_driver(headless=args.headless or cfg["browser"].get("headless", False))
    wait_for_pinterest_login(driver)
    total = 0

    print("=" * 60)
    print("PINTEREST IMAGE DATASET CRAWLER")
    print(f"Keywords: {len(keywords)}")
    print(f"Max per keyword: {args.max_images}")
    print(f"Target total: {args.target_total or 'disabled'}")
    print("=" * 60)

    try:
        for idx, keyword in enumerate(keywords, 1):
            if args.target_total and total >= args.target_total:
                break
            remaining = args.max_images
            if args.target_total:
                remaining = min(remaining, args.target_total - total)
            if remaining <= 0:
                break

            multiplier = max(2, int(cfg["download"].get("candidate_multiplier", 4)))
            desired_candidates = remaining * multiplier
            print(f"\n[{idx}/{len(keywords)}] SEARCH: {keyword}")
            urls = collect_image_urls(
                driver,
                keyword,
                desired_candidates,
                scroll_pause=cfg["browser"]["scroll_pause"],
                max_scrolls=cfg["browser"]["max_scrolls"],
                no_growth_limit=cfg["browser"]["no_growth_limit"],
            )
            print(f"  Found {len(urls)} Pinterest image candidates")
            saved = download_candidates(
                urls, keyword, output_root, remaining,
                cfg["download"]["workers"], cfg["download"]["timeout"], cfg["download"]["retries"],
                cfg["images"]["min_width"], cfg["images"]["min_height"], cfg["images"]["jpeg_quality"],
                deduper, metadata,
            )
            total += saved
            print(f"  SAVED: {saved} | TOTAL THIS RUN: {total}")
    finally:
        driver.quit()

    print("\nDONE")
    print(f"Valid images saved this run: {total}")
    print(f"Images folder: {output_root}")
    print(f"Metadata: {cfg['output']['metadata']}")


if __name__ == "__main__":
    main()
