# LeadPack XC - Import & Data Management Guide

## 🎯 Quick Start (After Database Reset)

### Step 1: Import Current Season (2025)
1. Go to **Data Management** page
2. Click **"Import Season Data"**
3. Enter year: `2025`
4. Click **Import**
5. ✅ You'll see: "Successfully imported 637 results. Analytics are calculating in the background - you can safely leave this page."

**You can now navigate away!** The calculation continues in the background.

---

### Step 2: Wait for Calculations (2-3 minutes)
Check Railway logs for completion:
```
✅ Analytics calculated for season 2025
Completed athlete metrics for 182 athletes
Completed meet metrics for 7 meets
```

Or just wait 3 minutes and refresh the Analytics page.

---

### Step 3: Verify Everything Works
1. **Analytics → Meets Tab**
   - ✅ Should show 7 meets
   - ✅ Pace should be `~6:30/mi` (not `121624:47/mi`)

2. **Analytics → Athletes Tab**
   - ✅ Should show 182 athletes
   - ✅ SB 5K should have times (not `0:00.0`)
   - ✅ Races should have counts (not `0`)

3. **Click a Meet → View Chart**
   - ✅ Beeswarm plot should render
   - ✅ Full Results table should populate

---

### Step 4: Import Historical Seasons (Optional)
Once 2025 works, import previous seasons:
1. Import 2024
2. Import 2023
3. Import 2022
4. etc.

**Each import is independent** - you can leave the page after starting each one.

---

## 🔄 Re-importing / Recalculating

### When to Re-import:
- New race results added to Athletic.net
- Data looks incorrect
- After fixing bugs

### How to Re-import:
1. **Data Management** → **Import Season Data**
2. Enter same year (e.g., `2025`)
3. It will **overwrite** existing data for that season
4. Calculations run automatically

### When to Recalculate (Without Re-importing):
- Metrics look wrong but data is correct
- After code fixes to calculation logic
- Testing new features

### How to Recalculate:
1. **Data Management** → **"Recalculate Metrics"**
2. Select season (e.g., `2025`)
3. Click **Recalculate**
4. ✅ "Metrics calculation started in the background. You can safely leave this page."

---

## 📊 Data Management Page Features

### Import Season Data
- **What it does:** Scrapes Athletic.net, imports races/results/athletes, calculates metrics
- **Background:** ✅ Yes - runs async
- **Can leave page:** ✅ Yes
- **Time:** ~2-3 minutes for 637 results

### Recalculate Metrics
- **What it does:** Re-runs calculations on existing data (no scraping)
- **Background:** ✅ Yes - runs async
- **Can leave page:** ✅ Yes
- **Time:** ~1-2 minutes

### Clear Season Data
- **What it does:** Deletes all data for a specific season
- **Background:** ❌ No - immediate
- **Use case:** Before re-importing, or removing old data

---

## 🚫 Import Page (Deprecated)

The separate **Import** page is redundant. Use **Data Management** instead.

**Why?**
- ✅ Data Management has all the same features
- ✅ Plus recalculate and clear options
- ✅ Single source of truth
- ✅ Better UX

**TODO:** Remove or redirect Import page to Data Management.

---

## 🔍 Monitoring Progress

### Option 1: Railway Logs (Real-time)
Watch for these messages:
```
🔄 Starting automatic analytics calculation
Processing X races for athlete [name]
Meet [name]: avgTime=XXXs, distance=3.1mi, avgPace=XXXs/mi
Calculated metrics for [name]: best5k=XXX, totalRaces=X
Found X 5K races out of Y total races
✅ Analytics calculated for season 2025
```

### Option 2: Check Analytics Page
- Refresh after 3 minutes
- If data appears → ✅ Success
- If still empty → Check logs for errors

### Option 3: Query Database (Advanced)
```sql
SELECT COUNT(*) FROM athlete_season_metrics WHERE season = '2025';
SELECT COUNT(*) FROM meet_performance_metrics WHERE season = '2025';
```

Should show:
- ~182 athlete metrics
- ~7 meet metrics

---

## ⚠️ Troubleshooting

### "No data available for the selected season"
- **Cause:** Import failed or calculations incomplete
- **Fix:** Check Railway logs for errors, try re-importing

### Metrics show zeros (0:00.0, 0 races)
- **Cause:** Season type mismatch (fixed in latest code)
- **Fix:** Clear database, re-import with latest code

### Meet pace shows huge numbers (121624:47/mi)
- **Cause:** Old calculation bug (fixed in latest code)
- **Fix:** Recalculate metrics or re-import

### Beeswarm plot empty
- **Cause:** Race results not fetched
- **Fix:** Check Railway logs when clicking "View Chart"

---

## ✅ Success Checklist

After importing 2025:
- [ ] Results Grid shows 7 races, 182 athletes
- [ ] Meets tab shows 7 meets with correct pace (~6:30/mi)
- [ ] Athletes tab shows 182 athletes with times and race counts
- [ ] Clicking a meet shows beeswarm plot and results table
- [ ] Overview tab shows team stats
- [ ] Enhanced Overview tab shows advanced metrics

---

## 📝 Best Practices

1. **Import current season first** - Verify everything works before adding historical data
2. **Use Data Management page** - Single interface for all operations
3. **You can leave the page** - All operations run in background
4. **Check logs for errors** - Railway logs show detailed progress
5. **Re-import if unsure** - It's safe to overwrite and recalculate
6. **Clear before major changes** - Fresh start ensures consistency

---

## 🎓 Advanced: Manual Calculation

If you need to trigger calculation manually via API:

```bash
# Async (returns immediately)
curl -X POST https://xcapp-production.up.railway.app/api/performance/calculate/TEAM_ID/2025 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Sync (waits for completion)
curl -X POST https://xcapp-production.up.railway.app/api/performance/calculate/TEAM_ID/2025?wait=true \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📅 Recommended Workflow

### Season Start:
1. Import current season (e.g., 2025)
2. Verify all metrics display correctly
3. Import previous 2-3 seasons for historical context

### During Season:
1. Re-import current season weekly (or after big meets)
2. Calculations update automatically
3. No need to clear data - import overwrites

### Season End:
1. Final import to capture all results
2. Data is preserved for historical analysis
3. Next season, repeat process

---

**Questions? Check Railway logs or the METRICS_DIAGNOSTIC.md guide.**
