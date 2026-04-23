import { google, type gmail_v1 } from 'googleapis';
import { getAuthClient } from '../auth/oauth.js';

export function getGmailClient(): gmail_v1.Gmail {
  return google.gmail({ version: 'v1', auth: getAuthClient() });
}
