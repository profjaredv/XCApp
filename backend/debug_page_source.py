import sys
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from bs4 import BeautifulSoup

def analyze_page_structure(team_id, year=2024):
    url = f'https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID={team_id}&S={year}'
    service = Service()
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    driver = webdriver.Chrome(service=service, options=options)
    print(f"DEBUG: Navigating to {url}", file=sys.stderr)
    driver.get(url)
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "MeetList"))
        )
        soup = BeautifulSoup(driver.page_source, 'html.parser')

        print("--- SUP Tag Analysis ---")
        sups = soup.find_all('sup')
        if sups:
            for sup in sups:
                print(f"Found sup: {sup.text.strip()}")
                if sup.parent:
                    print("Parent HTML:")
                    print(sup.parent.prettify())
                print("---")
        else:
            print("No sup tags found on the page.")
        print("------------------------")

    except TimeoutException:
        print("DEBUG: Timed out waiting for MeetList. Exiting.", file=sys.stderr)
    finally:
        driver.quit()

if __name__ == '__main__':
    analyze_page_structure(team_id=460, year=2024)
