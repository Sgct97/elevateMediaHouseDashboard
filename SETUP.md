# Email Campaign Dashboard - Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   cd dashboard
   npm install
   ```

2. **Configure API credentials:**
   Create a `.env.local` file in the dashboard folder with:
   ```
   WORTHAUTOTRACK_USERNAME=your_username_here
   WORTHAUTOTRACK_PASSWORD=your_password_here
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000

## Deploy to Render

1. Push code to GitHub/GitLab

2. Create new Web Service on Render:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Add environment variables:
     - `WORTHAUTOTRACK_USERNAME`
     - `WORTHAUTOTRACK_PASSWORD`

## Adding New Brands (White-Label)

Edit `src/lib/brands.ts`:

```typescript
'new-brand': {
  id: 'new-brand',
  name: 'New Brand Name',
  logo: '/new-logo.png',
  primaryColor: '#FF5733',
  secondaryColor: '#333333',
  textColor: '#333333',
}
```

Add the logo to `public/` folder.

## Features

- ✅ Real-time data from WorthAutoTrack API
- ✅ Auto-refresh every 2 minutes
- ✅ Manual refresh button
- ✅ Date, Dealership, and Invoice filters
- ✅ Sortable, paginated tables
- ✅ White-label support (multiple brands)
- ✅ Responsive design
- ✅ Zero maintenance (serverless)

## API Endpoints

The dashboard connects to:
- `GET /api/v1/campaigns/all/` - All campaigns
- `POST /api/v1/campaign/viewstats/:id` - Campaign details + URL breakdown

## Troubleshooting

**"API credentials not configured"**
- Make sure `.env.local` (local) or environment variables (Render) are set

**"Authentication failed"**
- Double-check username/password
- Test credentials with curl:
  ```bash
  curl -u "username:password" http://www.worthautotrack.com/api/v1/campaigns/recent/
  ```

**Dashboard is slow**
- First load fetches all campaigns (can be slow with 1000+ campaigns)
- Subsequent loads use auto-refresh (faster, incremental)

