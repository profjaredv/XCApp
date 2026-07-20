# LeadPack XC

A comprehensive cross country analytics platform designed to help teams reach the lead pack. Features automated data import, performance tracking, and advanced visualizations for coaches and athletes.

## 🚀 Features

- **Automated Data Import**: Scrape race results from Athletic.net
- **Comprehensive Analytics**: Team and individual performance metrics
- **Multi-Season Trends**: Track performance across multiple seasons
- **Enhanced Analytics**: Distance analysis, race comparisons, and more
- **Real-time Updates**: Automatic calculation after each race import

## 🏗️ Architecture

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database & Auth**: Supabase (PostgreSQL + Auth)
- **Deployment**: Railway or Vercel

## 📦 Project Structure

```
leadpack-xc/
├── web/                 # React frontend
├── backend/            # Express API server
├── docs/              # Documentation
└── vercel.json        # Vercel deployment config
```

## 🚀 Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed deployment instructions.

### Quick Start (Railway)

1. **Update environment variables** in Railway dashboard
2. **Push to GitHub**: Railway auto-deploys
3. **Test your app**

### Environment Variables Required

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
COACH_UPGRADE_CODE=your_upgrade_code
PORT=3001
NODE_ENV=production
```

## 🔧 Local Development

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Set up environment variables**:
   - Copy `.env.example` to `.env` in project root
   - Fill in your Supabase credentials (URL and anon key)

3. **Start development servers**:
   ```bash
   npm run dev
   ```

## 📊 Analytics Features

### Overview Tab
- Team performance metrics
- Top improving athletes
- Season pace trends

### Athletes Tab
- Individual athlete profiles
- Performance filtering by grade/gender
- Career progression tracking

### Meets Tab
- Race results and visualizations
- Meet-by-meet analysis

### Enhanced Analytics
- Distance-specific analysis
- Multi-season comparisons
- Advanced performance metrics

## 🔄 Data Flow

1. **Import**: Scrape race data from Athletic.net
2. **Calculate**: Automatically compute all analytics metrics
3. **Store**: Save results to MongoDB for fast access
4. **Display**: Real-time updates in the UI

## 🛠️ Tech Stack

### Frontend
- React 19 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Recharts for data visualization
- React Query for state management

### Backend
- Node.js with Express
- MongoDB with Mongoose
- Firebase Admin SDK
- Python scraping scripts

## 📈 Performance

- **Fast Loading**: Pre-calculated metrics stored in database
- **Automatic Updates**: Metrics recalculate after each race import
- **Responsive Design**: Works on desktop and mobile
- **Real-time Data**: Live updates without page refresh

## 🔐 Security

- Firebase Authentication
- Team-based access control
- Environment variable protection
- Input validation and sanitization

## 📝 License

MIT License - see LICENSE file for details

<!-- Railway deployment trigger - force refresh -->
