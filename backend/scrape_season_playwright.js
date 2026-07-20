const { chromium } = require('playwright');

async function scrapeSeasonResults(teamId, year) {
  console.error(`Starting Playwright scrape for team ${teamId}, year ${year}`);
  
  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    
    // Navigate to Athletic.net season results page
    const url = `https://www.athletic.net/CrossCountry/Results/Season.aspx?SchoolID=${teamId}&S=${year}`;
    console.error(`Navigating to: ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Wait for the results grid to be present (M_Table or F_Table)
    console.error('Waiting for results grid...');
    await page.waitForSelector('#M_Table, #F_Table', { timeout: 20000 });
    console.error('Page loaded successfully and main table found.');
    
    // Extract all data using the same logic as Python scraper
    const allResults = await page.evaluate((year) => {
      const results = [];
      
      // Build distance key
      const distanceKey = {};
      const distanceTable = document.querySelector('table.pull-right-sm');
      if (distanceTable) {
        const rows = distanceTable.querySelectorAll('tr');
        rows.forEach(row => {
          const cell = row.querySelector('td');
          if (cell) {
            const sub = cell.querySelector('sub');
            if (sub) {
              const key = sub.textContent.trim();
              sub.remove();
              const distance = cell.textContent.trim();
              distanceKey[key] = distance;
            }
          }
        });
      }
      
      // Build meet key
      const meetKey = {};
      const meetListTable = document.querySelector('#MeetList');
      const resultHeadersTable = document.querySelector('#M_Table table.DataTable, #F_Table table.DataTable');
      
      if (meetListTable && resultHeadersTable) {
        const meets = meetListTable.querySelectorAll('tbody tr');
        let meetIdx = 0;
        
        meets.forEach(meetTr => {
          // Skip header rows
          if (meetTr.querySelector('th')) return;
          
          const cells = meetTr.querySelectorAll('td');
          if (cells.length === 2) {
            const dateLabel = cells[0].querySelector('label');
            const nameA = cells[1].querySelector('a');
            
            if (dateLabel && nameA) {
              const meetDate = dateLabel.textContent.trim();
              const meetName = nameA.textContent.trim();
              
              meetKey[meetIdx] = {
                name: meetName,
                date: meetDate
              };
              meetIdx++;
            }
          }
        });
      }
      
      console.log(`Found ${Object.keys(meetKey).length} meets and ${Object.keys(distanceKey).length} distance types.`);
      
      // Parse gender tables
      function parseGenderTable(tableId, gender) {
        const tableResults = [];
        const table = document.querySelector(`#${tableId}`);
        if (!table) {
          console.log(`${gender}'s table (${tableId}) not found.`);
          return tableResults;
        }
        
        console.log(`Parsing ${gender}'s table...`);
        const athleteRows = table.querySelectorAll('tr');
        
        athleteRows.forEach(row => {
          // Skip header rows
          if (row.querySelector('th')) return;
          
          const cells = row.querySelectorAll('td');
          if (cells.length < 2) return;
          
          // Get grade
          let grade = '';
          const rowClasses = row.className.split(' ');
          for (const cls of rowClasses) {
            if (cls && cls.startsWith('y') && /^\d+$/.test(cls.substring(1))) {
              grade = cls.substring(1);
              break;
            }
          }
          
          if (!grade && cells[0]) {
            const gradeCell = cells[0].textContent.trim();
            if (/^\d+$/.test(gradeCell) && parseInt(gradeCell) >= 1 && parseInt(gradeCell) <= 12) {
              grade = gradeCell;
            } else if (/^(FR|SO|JR|SR)/i.test(gradeCell)) {
              const gradeMap = {'FR': '9', 'SO': '10', 'JR': '11', 'SR': '12'};
              grade = gradeMap[gradeCell.toUpperCase().substring(0, 2)] || '12';
            }
          }
          
          const athleteNameTag = cells[1].querySelector('a');
          if (!athleteNameTag) return;
          const athleteName = athleteNameTag.textContent.trim();
          
          // Result cells start from the 3rd column (index 2)
          for (let i = 2; i < cells.length; i++) {
            const cell = cells[i];
            const timeA = cell.querySelector('a');
            if (timeA) {
              const timeStr = timeA.textContent.trim();
              const distanceIdSpan = cell.querySelector('span.subscript');
              const distId = distanceIdSpan ? distanceIdSpan.textContent.trim() : 'N/A';
              
              const distance = distanceKey[distId] || 'Unknown';
              const meetInfo = meetKey[i - 2] || {};
              const raceName = meetInfo.name || 'Unknown Meet';
              const raceDate = meetInfo.date || 'Unknown Date';
              
              tableResults.push([
                raceName,
                athleteName,
                grade,
                gender,
                timeStr,
                `${raceDate}, ${year}`,
                distance
              ]);
            }
          }
        });
        
        console.log(`Found ${tableResults.length} results in ${gender}'s table.`);
        return tableResults;
      }
      
      // Process both tables
      results.push(...parseGenderTable('M_Table', 'Men'));
      results.push(...parseGenderTable('F_Table', 'Women'));
      
      return results;
    }, year);
    
    console.error(`Finished scraping. Found ${allResults.length} results.`);
    
    // Output CSV format (matching Python scraper exactly)
    console.log('Race Name,Athlete Name,Grade,Gender,Time,Race Date,Distance');
    allResults.forEach(row => {
      console.log(row.map(field => `"${field}"`).join(','));
    });
    
    await browser.close();
    return allResults;
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);
  let teamId, year;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team_id' && args[i + 1]) {
      teamId = args[i + 1];
    }
    if (args[i] === '--year' && args[i + 1]) {
      year = args[i + 1];
    }
  }
  
  if (!teamId || !year) {
    console.error('Usage: node scrape_season_playwright.js --team_id <id> --year <year>');
    process.exit(1);
  }
  
  scrapeSeasonResults(teamId, year)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { scrapeSeasonResults };
