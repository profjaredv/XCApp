import argparse
import sys
import csv
import re
from urllib.parse import urljoin
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup

def get_page_soup(team_id, year):
    url = f'https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID={team_id}&S={year}'
    print(f"Fetching URL: {url}", file=sys.stderr)
    service = Service(ChromeDriverManager().install())
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    driver = webdriver.Chrome(service=service, options=options)
    driver.get(url)
    try:
        # If there is a Roster tab, click it so the roster tables render or unhide
        try:
            roster_tab = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//a[contains(., 'Roster') or contains(@href, 'Roster')]"))
            )
            roster_tab.click()
        except Exception:
            pass  # If not found, continue; some pages default to roster visible

        # Try to reveal hidden athletes and expand both gender sections if controls exist
        try:
            show_athletes = driver.find_element(By.ID, 'ShowAthletes')
            driver.execute_script('arguments[0].click();', show_athletes)
        except Exception:
            pass
        try:
            click_m = driver.find_element(By.ID, 'click_M')
            driver.execute_script('arguments[0].click();', click_m)
        except Exception:
            pass
        try:
            click_f = driver.find_element(By.ID, 'click_F')
            driver.execute_script('arguments[0].click();', click_f)
        except Exception:
            pass

        # Wait for roster tables or rows to exist in DOM
        WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "#M_Table tr, #F_Table tr, div#M_Table, div#F_Table"))
        )
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        return soup
    except TimeoutException:
        print("Timed out waiting for page to load.", file=sys.stderr)
        return None
    finally:
        driver.quit()


def parse_gender_table(table, gender):
    rows = table.find_all('tr')
    roster = []
    for row in rows:
        if row.find('th'):
            continue
        cells = row.find_all('td')
        if len(cells) < 2:
            continue
        # Grade inference from row class or first cell
        grade = ''
        row_classes = row.get('class', [])
        for cls in row_classes:
            if cls and cls.startswith('y') and cls[1:].isdigit():
                grade = cls[1:]
                break
            # Sometimes classes may be like 'grade-9'
            m = re.match(r"^grade[-_]?([0-9]{1,2})$", cls)
            if m:
                grade = m.group(1)
                break
        # data attributes fallback
        if not grade:
            data_grade = row.get('data-grade') or row.get('data-y')
            if data_grade and str(data_grade).isdigit():
                grade = str(data_grade)
        if not grade:
            grade_cell = cells[0].text.strip()
            if grade_cell.isdigit() and 1 <= int(grade_cell) <= 12:
                grade = grade_cell
            else:
                gm = {'FR': '9', 'SO': '10', 'JR': '11', 'SR': '12'}
                key = grade_cell.upper()[:2]
                grade = gm.get(key, '')
        # Name link can be inside the second cell, possibly deeper
        a = cells[1].find('a')
        if not a:
            continue
        name = a.text.strip()
        # Phase 2 step 5: stable per-athlete identifier to match on instead
        # of name — see scrape_season.py for why this isn't parsed down to
        # a bare numeric id.
        href = a.get('href') or ''
        athletic_athlete_id = urljoin('https://www.athletic.net', href) if href else ''
        roster.append([name, grade, gender, athletic_athlete_id])
    return roster


def main(team_id, year):
    soup = get_page_soup(team_id, year)
    if not soup:
        return
    all_rows = []
    # Try multiple selectors for robustness
    m_table = soup.find(id='M_Table')
    if m_table:
        all_rows.extend(parse_gender_table(m_table, 'Men'))
    f_table = soup.find(id='F_Table')
    if f_table:
        all_rows.extend(parse_gender_table(f_table, 'Women'))
    # Some pages may wrap tables differently; search fallback by header text
    if not all_rows:
        # Look for any tables containing a header that mentions Boys/Men or Girls/Women
        for table in soup.find_all('table'):
            header_text = table.get_text(' ', strip=True).lower()
            if 'boys' in header_text or 'men' in header_text:
                all_rows.extend(parse_gender_table(table, 'Men'))
            elif 'girls' in header_text or 'women' in header_text:
                all_rows.extend(parse_gender_table(table, 'Women'))
    writer = csv.writer(sys.stdout)
    writer.writerow(["Athlete Name", "Grade", "Gender", "Athletic Athlete ID"])
    writer.writerows(all_rows)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scrape athletic.net roster for a season (names, grades, gender).')
    parser.add_argument('--team_id', type=int, required=True)
    parser.add_argument('--year', type=int, required=True)
    args = parser.parse_args()
    try:
        main(args.team_id, args.year)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)
