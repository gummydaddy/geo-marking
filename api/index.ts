import serverApp from '../src/serverApp';

// Vercel Serverless Function entry point
// Automatically handles /api/basemaps/config, /api/tiles/carto/*, /api/places/search, /api/cache/stats
export default serverApp;
