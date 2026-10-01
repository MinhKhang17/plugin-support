import time
from urllib.parse import quote_plus
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import (
    StaleElementReferenceException,
    WebDriverException,
)
from webdriver_manager.chrome import ChromeDriverManager



def wait_for_pinterest_login(driver):
    print("\n" + "=" * 60)
    print("PINTEREST LOGIN")
    print("=" * 60)
    print("Đang mở Pinterest...")
    print("Hãy đăng nhập trong cửa sổ Chrome.")
    print("Crawler sẽ tự bắt đầu sau khi phát hiện đăng nhập thành công.")
    print("=" * 60)

    driver.get("https://www.pinterest.com/")

    while True:
        try:
            current_url = driver.current_url.lower()

            # Nếu vẫn đang ở trang login/signup thì tiếp tục chờ
            if "/login" in current_url or "/signup" in current_url:
                print("[WAIT] Chưa đăng nhập Pinterest...")
                time.sleep(2)
                continue

            # Kiểm tra một số element thường chỉ xuất hiện
            # khi Pinterest đã vào giao diện chính.
            logged_in_elements = driver.find_elements(
                By.CSS_SELECTOR,
                'a[href="/"], a[href*="/settings"], [data-test-id="header-profile"]'
            )

            if logged_in_elements:
                print("\n[OK] Pinterest login thành công!")
                print("[OK] Bắt đầu crawler...\n")
                time.sleep(2)
                return

            print("[WAIT] Đang chờ đăng nhập...")
            time.sleep(2)

        except WebDriverException:
            time.sleep(2)
def build_driver(headless=False):
    options = Options()

    if headless:
        options.add_argument("--headless=new")

    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1440,1200")
    options.add_argument("--lang=en-US")
    options.add_argument("--disable-notifications")
    options.add_argument("--log-level=3")

    # Dedicated Chrome profile for Pinterest crawler
    options.add_argument(
        r"--user-data-dir=D:\triho\pinterest_chrome_profile"
    )

    return webdriver.Chrome(
        service=Service(ChromeDriverManager().install()),
        options=options,
    )


def _best_img_url(img):
    """
    Extract the best Pinterest CDN image URL from an <img> element.

    Pinterest frequently replaces image elements while lazy-loading.
    Therefore every Selenium access must tolerate stale elements.
    """

    candidates = []

    try:
        # src / data-src
        for attr in ("src", "data-src"):
            try:
                value = img.get_attribute(attr)
            except StaleElementReferenceException:
                return None
            except WebDriverException:
                return None

            if (
                value
                and value.startswith("http")
                and "pinimg.com" in value
            ):
                candidates.append(value)

        # srcset
        try:
            srcset = img.get_attribute("srcset") or ""
        except (StaleElementReferenceException, WebDriverException):
            srcset = ""

        for part in srcset.split(","):
            part = part.strip()

            if not part:
                continue

            pieces = part.split()

            if not pieces:
                continue

            url = pieces[0]

            if (
                url.startswith("http")
                and "pinimg.com" in url
            ):
                candidates.append(url)

    except (StaleElementReferenceException, WebDriverException):
        return None

    if not candidates:
        return None

    # Try Pinterest original-size URL.
    normalized = []

    for url in candidates:
        for marker in (
            "/75x75_RS/",
            "/136x136/",
            "/170x/",
            "/236x/",
            "/474x/",
            "/564x/",
            "/736x/",
        ):
            url = url.replace(marker, "/originals/")

        normalized.append(url)

    # Remove duplicates while preserving order.
    normalized = list(dict.fromkeys(normalized))

    if not normalized:
        return None

    return max(normalized, key=len)


def collect_image_urls(
    driver,
    keyword,
    desired,
    scroll_pause=1.2,
    max_scrolls=60,
    no_growth_limit=7,
):
    search_url = (
        "https://www.pinterest.com/search/pins/"
        f"?q={quote_plus(keyword)}"
    )

    try:
        driver.get(search_url)
    except WebDriverException as e:
        print(
            f"[WARN] Failed to open Pinterest for "
            f"'{keyword}': {type(e).__name__}"
        )
        return []

    time.sleep(2.5)

    found = []
    seen = set()

    no_growth = 0
    target_candidates = max(int(desired), 1)

    for scroll_number in range(max_scrolls):

        before = len(found)

        # DOM can change at any time on Pinterest.
        try:
            images = driver.find_elements(
                By.CSS_SELECTOR,
                "img",
            )
        except WebDriverException:
            print(
                f"[WARN] Could not read images on scroll "
                f"{scroll_number + 1}"
            )
            time.sleep(1)
            continue

        for img in images:

            try:
                image_url = _best_img_url(img)

            except StaleElementReferenceException:
                # Pinterest replaced the element.
                continue

            except WebDriverException:
                continue

            except Exception as e:
                # One bad element should never kill the crawler.
                print(
                    f"[WARN] Skip image: "
                    f"{type(e).__name__}"
                )
                continue

            if not image_url:
                continue

            if image_url in seen:
                continue

            seen.add(image_url)
            found.append(image_url)

            if len(found) >= target_candidates:
                return found

        # Scroll after processing the current DOM.
        try:
            driver.execute_script(
                "window.scrollTo("
                "0, document.body.scrollHeight"
                ");"
            )
        except WebDriverException:
            print("[WARN] Scroll failed, retrying...")
            time.sleep(1)
            continue

        time.sleep(scroll_pause)

        # Detect whether Pinterest stopped giving new images.
        if len(found) == before:
            no_growth += 1
        else:
            no_growth = 0

        if no_growth >= no_growth_limit:
            break

    return found