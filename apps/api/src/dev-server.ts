/**
 * Dev entry: load Sentry + dotenv before server (same as prod --import instrument),
 * without tsx --import which breaks resolution of ./lib/*.js from instrument.ts.
 */
import './instrument.js';
import './server.js';
