import argparse
import sys
import csv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup

def get_page_soup(team_id, year):
    """Fetches the season results page and returns a BeautifulSoup object."""
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
        # Wait for the grid to be present, which is a good indicator of page load.
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.CSS_SELECTOR, "#M_Table, #F_Table")))
        print("Page loaded successfully and main table found.", file=sys.stderr)
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        return soup
    except TimeoutException:
        print("Timed out waiting for page to load. Exiting.", file=sys.stderr)
        return None
    finally:
        driver.quit()

def build_lookup_tables(soup):
    """Builds lookup tables for meets and distances from the soup object."""
    print("Building lookup tables for meets and distances...", file=sys.stderr)
    # Build distance key
    distance_key = {}
    distance_table = soup.find('table', class_='pull-right-sm')
    if distance_table:
        rows = distance_table.find_all('tr')
        for row in rows:
            cell = row.find('td')
            if cell:
                sub = cell.find('sub')
                if sub:
                    key = sub.text.strip()
                    sub.decompose()
                    distance = cell.text.strip()
                    distance_key[key] = distance
    
    if not distance_key:
        print("Could not find the distance key list. Distances may be incorrect.", file=sys.stderr)

    # Build meet key
    meet_key = {}
    meet_list_table = soup.find('table', id='MeetList')
    result_headers_table = soup.select_one("#M_Table table.DataTable, #F_Table table.DataTable")
    
    if meet_list_table and result_headers_table:
        meets = meet_list_table.find('tbody').find_all('tr')
        result_headers = result_headers_table.find_all('th')
        # The first column is athlete name, the rest are meets.
        num_meet_columns = len(result_headers) - 1 

        meet_idx = 0
        for meet_tr in meets:
            # Skip header rows
            if meet_tr.find('th'):
                continue

            cells = meet_tr.find_all('td')
            if len(cells) == 2:
                date_label = cells[0].find('label')
                name_a = cells[1].find('a')

                if date_label and name_a:
                    meet_date = date_label.text.strip()
                    meet_name = name_a.text.strip()
                    
                    meet_key[meet_idx] = {
                        'name': meet_name,
                        'date': meet_date
                    }
                    meet_idx += 1

    print(f"Found {len(meet_key)} meets and {len(distance_key)} distance types.", file=sys.stderr)
    return distance_key, meet_key

def parse_gender_table(table, gender, distance_key, meet_key, year):
    """Parses a specific gender's results table (M_Table or F_Table)."""
    print(f"Parsing {gender}'s table...", file=sys.stderr)
    results = []
    athlete_rows = table.find_all('tr')
    for row in athlete_rows:
        # Skip header rows that use <th>
        if row.find('th'):
            continue

        cells = row.find_all('td')
        if len(cells) < 2:
            continue

                # First try to get grade from class name (e.g., y9, y10)
        grade = None
        row_classes = row.get('class', [])
        for cls in row_classes:
            if cls and cls.startswith('y') and cls[1:].isdigit():
                grade = cls[1:]
                break
        
        # If not found in class, try first cell text
        if not grade and len(cells) > 0:
            grade_cell = cells[0].text.strip()
            # Handle various grade formats: '9', '9th', 'FR', 'FR-1', etc.
            if grade_cell.isdigit() and 1 <= int(grade_cell) <= 12:
                grade = grade_cell
            elif grade_cell.upper().startswith(('FR', 'SO', 'JR', 'SR')):
                # Convert FR/SO/JR/SR to grade number
                grade_map = {'FR': '9', 'SO': '10', 'JR': '11', 'SR': '12'}
                grade = grade_map.get(grade_cell.upper()[:2], '12')
        
        # Default to empty string if grade still not found
        grade = grade or ''
        athlete_name_tag = cells[1].find('a')
        if not athlete_name_tag:
            continue
        athlete_name = athlete_name_tag.text.strip()


        # Result cells start from the 3rd column (index 2)
        for i, cell in enumerate(cells[2:]):
            time_a = cell.find('a')
            if time_a:
                time_str = time_a.text.strip()
                distance_id_span = cell.find('span', class_='subscript')
                dist_id = distance_id_span.text.strip() if distance_id_span else 'N/A'
                
                distance = distance_key.get(dist_id, 'Unknown')
                meet_info = meet_key.get(i, {})
                race_name = meet_info.get('name', 'Unknown Meet')
                race_date = meet_info.get('date', 'Unknown Date')

                results.append([
                    race_name, athlete_name, grade, gender, time_str, f"{race_date}, {year}", distance
                ])
    print(f"Found {len(results)} results in {gender}'s table.", file=sys.stderr)
    return results

def main(team_id, year):
    soup = get_page_soup(team_id, year)
    if not soup:
        return

    distance_key, meet_key = build_lookup_tables(soup)
    
    all_results = []
    # Process Men's table
    m_table = soup.find('div', id='M_Table')
    if m_table:
        all_results.extend(parse_gender_table(m_table, 'Men', distance_key, meet_key, year))
    else:
        print("Men's table (M_Table) not found.", file=sys.stderr)

    # Process Women's table
    f_table = soup.find('div', id='F_Table')
    if f_table:
        all_results.extend(parse_gender_table(f_table, 'Women', distance_key, meet_key, year))
    else:
        print("Women's table (F_Table) not found.", file=sys.stderr)

    # Output to CSV
    writer = csv.writer(sys.stdout)
    writer.writerow(["Race Name", "Athlete Name", "Grade", "Gender", "Time", "Race Date", "Distance"])
    writer.writerows(all_results)
    print(f"Finished scraping. Found {len(all_results)} results.", file=sys.stderr)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scrape athletic.net season grid results.')
    parser.add_argument('--team_id', type=int, required=True, help='Team ID to scrape')
    parser.add_argument('--year', type=int, default=2024, help='Year of the season')
    args = parser.parse_args()
    try:
        main(args.team_id, args.year)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)
