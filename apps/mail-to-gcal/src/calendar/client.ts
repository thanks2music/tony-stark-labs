import { google, type calendar_v3 } from 'googleapis';
import { getAuthClient } from '../auth/oauth.js';

export function getCalendarClient(): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}
