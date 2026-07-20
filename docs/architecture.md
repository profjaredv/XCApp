# XCTF Application Architecture

## Database Architecture

### MongoDB
- **Primary Database**: MongoDB is the primary database for all application data
- **Connection**: Via MongoDB URI in `.env` file
- **Collections**:
  - `races` - Race information (name, date, distance)
  - `results` - Links athletes to races with time and place
  - `athletes` - Athlete profiles
  - `teams` - Team information
  - `teamseasonmetrics` - Aggregated team metrics by season
  - `athleteseasonmetrics` - Individual athlete metrics by season
  - `meetperformancemetrics` - Meet-specific analytics

### Firebase
- **Authentication Only**: Firebase is used exclusively for authentication
- **NOT Used For Data Storage**: No application data is stored in Firestore
- **Auth Flow**: Firebase handles user login/registration, then the app uses MongoDB for all data

## Application Stack

### Backend
- **Node.js/Express**: API server
- **MongoDB**: Database
- **Mongoose**: MongoDB ORM
- **Firebase Auth**: Authentication

### Frontend
- **React**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **shadcn-ui**: Component library

## Data Flow

1. **Authentication**: Firebase handles user authentication
2. **API Requests**: Frontend makes requests to backend API
3. **Database Operations**: Backend connects to MongoDB for all data operations
4. **Response**: Data is returned to frontend

## Development Guidelines

### DO
- Use MongoDB for all data storage
- Connect to MongoDB using the URI in `.env`
- Use Mongoose models for database operations
- Use Firebase only for authentication

### DON'T
- Store application data in Firebase/Firestore
- Mix Firebase and MongoDB data models
- Assume Firebase is the primary database

## API Structure

- All database operations go through the Express API
- Frontend components use API services to fetch/update data
- API endpoints follow RESTful conventions

## MongoDB Connection

```javascript
// Example MongoDB connection
mongoose.connect(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
});
```
